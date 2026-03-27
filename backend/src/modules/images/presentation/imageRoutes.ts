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
import { SQLiteImageRepository, type EntityType } from '../infrastructure/SQLiteImageRepository';
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
    log.warn('EXIF extraction failed', { reason: (err as Error).message });
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
    log.debug(`Deleted image: ${path.basename(imagePath)}`);
  } catch {
    log.warn(`Unlink failed (file may not exist): ${path.basename(imagePath)}`);
  }
};

const resolveLocalPath = (imageUrl: string, entityType: string): string => {
  const filename = path.basename(imageUrl);
  return path.join(NAS_PATH, entityType, filename);
};

// ── Router ────────────────────────────────────────────────────────────────────

export const createImageRouter = (_pool?: unknown): Router => {
  const router = Router();
  const repo = new SQLiteImageRepository();

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
        const uploadTimestamp = req.body.date ? Math.floor(new Date(req.body.date).getTime() / 1000) : Math.floor(Date.now() / 1000);

        await repo.create(entityType as EntityType, Number(entityId), filePath, uploadTimestamp);
        res.status(201).location(`/images/${entityType}/${entityId}`).json({ data: { path: filePath, date: dateStr } });
      } catch (err) { next(err); }
    },
  );

  // GET /:entityType — list images for entity (entityId in query)
  router.get('/:entityType', authenticateToken, validateEntityType, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { entityId } = req.query;
      const parsedId = Number(entityId);
      if (!entityId || !Number.isInteger(parsedId) || parsedId <= 0) {
        return next(new ValidationError('entityId query parameter must be a positive integer'));
      }
      const images = await repo.findByEntity(req.params.entityType as EntityType, parsedId);
      res.json({ data: images });
    } catch (err) { next(err); }
  });

  // GET /:entityType/:entityId — serve image file (with optional ?size=)
  router.get('/:entityType/:entityId', authenticateToken, validateEntityType, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const images = await repo.findByEntity(req.params.entityType as EntityType, Number(req.params.entityId));
      if (!images.length) return next(new NotFoundError('Image'));

      const entityType = Array.isArray(req.params.entityType) ? req.params.entityType[0] : req.params.entityType;
      const localPath = resolveLocalPath(images[0].url, entityType);
      // No fs.access() pre-check — it creates a TOCTOU race (file can disappear
      // between the check and the open). Let sharp throw ENOENT directly; the
      // catch block below already handles it correctly.
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

  // PATCH /:id — update image (replace file and/or date)
  router.patch(
    '/:id',
    authenticateToken,
    validateEntityType,
    upload.single('image'),
    async (req: Request, _res: Response, next: NextFunction) => {
      if (!req.file && !req.body.date) {
        return next(new ValidationError('No file or date provided for update.'));
      }
      // Stash the existing record so we can delete the old file AFTER the new
      // one is successfully written. Deleting first risks losing the image if
      // Sharp fails mid-processing.
      if (req.file) {
        const existing = await repo.findById(Number(req.params.id));
        if (existing) {
          (req as Request & { _oldImageUrl?: string; _oldEntityType?: string })._oldImageUrl = existing.url;
          (req as Request & { _oldImageUrl?: string; _oldEntityType?: string })._oldEntityType = existing.entityType;
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
        const id = Number(req.params.id);
        const typed = req as Request & { _oldImageUrl?: string; _oldEntityType?: string };
        const entityType = typed._oldEntityType ?? 'plant';
        const filePath = req.file
          ? `${req.protocol}://${req.get('host')}/uploads/${entityType}/${req.file.filename}`
          : undefined;

        const uploadDate = req.body.date ? Math.floor(new Date(req.body.date).getTime() / 1000) : undefined;
        await repo.update(id, { uploadDate, imageUrl: filePath });

        // New file committed to DB — safe to delete the old file now
        if (req.file && typed._oldImageUrl) {
          await deleteFromDisk(resolveLocalPath(typed._oldImageUrl, entityType));
        }

        const updated = await repo.findById(id);
        res.json({ data: updated });
      } catch (err) { next(err); }
    },
  );

  // DELETE /:id — delete single image by image ID, 204 No Content
  router.delete('/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      // Reject non-numeric IDs so this route doesn't shadow /:entityType/:entityId
      if (!Number.isInteger(id) || id <= 0) return next();
      const image = await repo.findById(id);
      if (!image) return next(new NotFoundError('Image'));

      await deleteFromDisk(resolveLocalPath(image.url, image.entityType));
      await repo.delete(id);
      res.status(204).end();
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
      await Promise.all(images.map((img) => deleteFromDisk(resolveLocalPath(img.url, entityType))));
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
};