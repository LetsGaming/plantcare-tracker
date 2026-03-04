/**
 * modules/images/presentation/imageRoutes.ts
 *
 * Full image upload/serve/delete pipeline.
 * Ported from V1's imageController.js + imageRoutes.js —
 * Multer, EXIF extraction, Sharp processing all stay in presentation
 * because they're HTTP/infrastructure concerns, not business logic.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs/promises';
import multer from 'multer';
import sharp from 'sharp';
import ExifParser from 'exif-parser';
import type { Pool } from 'mysql2/promise';
import { MySQLImageRepository, type EntityType } from '../infrastructure/MySQLImageRepository';
import { NotFoundError, ValidationError } from '../../../core/errors';
import { authenticateToken } from '../../../core/middleware';
import { formatToDBDate } from '../../../core/utils';
import { createModuleLogger } from '../../../core/logging';

const log = createModuleLogger('ImageRoutes');

const NAS_PATH = process.env.NAS_PATH
  ? path.resolve(process.env.NAS_PATH)
  : path.resolve(process.cwd(), 'uploads');

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/jpg'];
const ENTITY_TYPES: EntityType[] = ['plant', 'substrate', 'component'];

// ── Multer (memory storage — buffer needed for Sharp + EXIF) ─────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Invalid file type. Only png, jpeg, and jpg are allowed.'));
  },
});

// ── EXIF date extraction ──────────────────────────────────────────────────────

const parseExifDate = (value: unknown): Date | null => {
  if (!value) return null;
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'number') {
    date = new Date(String(value).length === 10 ? (value as number) * 1000 : value as number);
  } else if (typeof value === 'string') {
    date = new Date((value as string).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
  } else {
    return null;
  }
  if (isNaN(date.getTime())) return null;
  if (date.getFullYear() < 1990 || date.getTime() > Date.now() + 60_000) return null;
  return date;
};

const extractImageDate = async (buffer: Buffer): Promise<Date> => {
  try {
    const result = ExifParser.create(buffer).parse();
    const tags = result?.tags ?? {};
    for (const key of ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'GPSDateStamp']) {
      const parsed = parseExifDate(tags[key as keyof typeof tags]);
      if (parsed) return parsed;
    }
  } catch (err) {
    log.warn('EXIF extraction failed', { err });
  }
  return new Date();
};

// ── Filename anonymizer ───────────────────────────────────────────────────────

const anonymizeImageName = (fileName: string, contextKeywords: string[] = []): string => {
  if (!fileName) return 'img.jpg';
  const lastDot = fileName.lastIndexOf('.');
  const ext = lastDot !== -1 ? fileName.slice(lastDot).toLowerCase() : '.jpg';
  const namePart = lastDot !== -1 ? fileName.slice(0, lastDot) : fileName;

  const PII_REDLIST = ['admin', 'user', 'owner', 'desktop', 'download', 'iphone', 'android', 'tmp'];
  const tokens = namePart
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !PII_REDLIST.includes(t) && !/^\d+$/.test(t) || contextKeywords.includes(t));

  const base = tokens.length > 0 ? tokens.join('-') : 'image';
  const hash = Math.random().toString(36).substring(2, 6);
  return `${base.substring(0, 30 - 5)}-${hash}${ext}`;
};

// ── Middleware: process and store uploaded image ──────────────────────────────

const processAndStoreImage = (requireEntityType = false) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.file) return next(new ValidationError('No image file provided.'));

    const entityType = Array.isArray(req.params.entityType) ? req.params.entityType[0] : (req.params.entityType ?? 'generic');
    const uploadPath = requireEntityType ? path.join(NAS_PATH, entityType) : NAS_PATH;

    try {
      await fs.mkdir(uploadPath, { recursive: true });

      const baseName = anonymizeImageName(req.file.originalname, [entityType]).replace(/\.[^/.]+$/, '');
      const filename = `${Date.now()}-${baseName}.webp`;
      const outputPath = path.join(uploadPath, filename);

      const imageDate = await extractImageDate(req.file.buffer);
      req.body.date = imageDate.getTime();

      await sharp(req.file.buffer)
        .resize({ width: 1024, withoutEnlargement: true })
        .toFormat('webp')
        .webp({ quality: 70, nearLossless: true })
        .toFile(outputPath);

      req.file.path = outputPath;
      req.file.filename = filename;
      next();
    } catch (err) {
      log.error('Image processing failed', { err });
      next(err);
    }
  };

// ── Helper: delete file from disk (silent) ────────────────────────────────────

const deleteFromDisk = async (imagePath: string): Promise<void> => {
  try {
    await fs.unlink(imagePath);
    log.info(`Deleted: ${imagePath}`);
  } catch {
    log.warn(`Unlink failed (file may not exist): ${imagePath}`);
  }
};

const resolveLocalPath = (imageUrl: string, entityType: string): string => {
  const filename = path.basename(imageUrl);
  return path.join(NAS_PATH, entityType, filename);
};

// ── Router ────────────────────────────────────────────────────────────────────

export const createImageRouter = (pool: Pool): Router => {
  const router = Router();
  const repo = new MySQLImageRepository(pool);

  const validateEntityType = (req: Request, _res: Response, next: NextFunction): void => {
    if (!ENTITY_TYPES.includes(req.params.entityType as EntityType)) {
      return next(new ValidationError(`entityType must be one of: ${ENTITY_TYPES.join(', ')}`));
    }
    next();
  };

  // POST /:entityType/:entityId — upload image
  router.post(
    '/:entityType/:entityId',
    authenticateToken,
    validateEntityType,
    upload.single('image'),
    processAndStoreImage(true),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { entityType, entityId } = req.params;
        const filePath = `${req.protocol}://${req.get('host')}/uploads/${entityType}/${req.file!.filename}`;
        const dateStr = formatToDBDate(req.body.date ?? Date.now());

        await repo.create(entityType as EntityType, Number(entityId), filePath, dateStr);
        res.status(201).json({ success: true, data: { path: filePath, date: dateStr } });
      } catch (err) { next(err); }
    },
  );

  // GET /:entityType — list images for entity (entityId in query)
  router.get('/:entityType', authenticateToken, validateEntityType, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { entityId } = req.query;
      const images = await repo.findByEntity(req.params.entityType as EntityType, Number(entityId));
      res.json({ success: true, data: images });
    } catch (err) { next(err); }
  });

  // GET /:entityType/:entityId — serve image file (with optional ?size=)
  router.get('/:entityType/:entityId', authenticateToken, validateEntityType, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const images = await repo.findByEntity(req.params.entityType as EntityType, Number(req.params.entityId));
      if (!images.length) return next(new NotFoundError('Image'));

      const entityType = Array.isArray(req.params.entityType) ? req.params.entityType[0] : req.params.entityType;
      const localPath = resolveLocalPath(images[0].image_url, entityType);
      await fs.access(localPath);

      let transform = sharp(localPath);
      const sizeParam = req.query.size as string | undefined;
      if (sizeParam) {
        const width = parseInt(sizeParam);
        if (!isNaN(width) && width > 0) transform = transform.resize({ width, withoutEnlargement: true });
      }

      const buffer = await transform.toFormat('webp').toBuffer();
      res.set('Content-Type', 'image/webp');
      res.set('Cache-Control', 'public, max-age=86400');
      res.send(buffer);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return next(new NotFoundError('File on disk'));
      next(err);
    }
  });

  // PATCH /image/:entityType/:id — update image (replace file and/or date)
  router.patch(
    '/image/:entityType/:id',
    authenticateToken,
    validateEntityType,
    upload.single('image'),
    async (req: Request, res: Response, next: NextFunction) => {
      if (!req.file && !req.body.date) {
        return next(new ValidationError('No file or date provided for update.'));
      }
      // If replacing file, delete old one from disk first
      if (req.file) {
        const existing = await repo.findById(Number(req.params.id));
        if (existing) {
          const entityType = Array.isArray(req.params.entityType) ? req.params.entityType[0] : req.params.entityType;
          await deleteFromDisk(resolveLocalPath(existing.image_url, entityType));
        }
      }
      next();
    },
    // Only run Sharp processing if a new file was actually uploaded
    (req: Request, res: Response, next: NextFunction): void => {
      if (!req.file) return next();
      processAndStoreImage(true)(req, res, next);
    },
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id, entityType } = req.params;
        const filePath = req.file
          ? `${req.protocol}://${req.get('host')}/uploads/${entityType}/${req.file.filename}`
          : undefined;
        const dateStr = req.body.date ? formatToDBDate(req.body.date) : undefined;

        await repo.update(Number(id), { date: dateStr, imageUrl: filePath });
        res.json({ success: true, data: { path: filePath } });
      } catch (err) { next(err); }
    },
  );

  // DELETE /image/:entityType/:id — delete single image
  router.delete('/image/:entityType/:id', authenticateToken, validateEntityType, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const image = await repo.findById(Number(req.params.id));
      if (!image) return next(new NotFoundError('Image'));

      const entityType = Array.isArray(req.params.entityType) ? req.params.entityType[0] : req.params.entityType;
      await deleteFromDisk(resolveLocalPath(image.image_url, entityType));
      await repo.delete(Number(req.params.id));
      res.json({ success: true, data: { deleted: true } });
    } catch (err) { next(err); }
  });

  // DELETE /:entityType/:entityId — delete all images for an entity
  router.delete('/:entityType/:entityId', authenticateToken, validateEntityType, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const images = await repo.deleteByEntity(
        req.params.entityType as EntityType,
        Number(req.params.entityId),
      );
      const entityType = Array.isArray(req.params.entityType) ? req.params.entityType[0] : req.params.entityType;
      await Promise.all(images.map((img) => deleteFromDisk(resolveLocalPath(img.image_url, entityType))));
      res.json({ success: true, data: { deleted: true } });
    } catch (err) { next(err); }
  });

  return router;
};
