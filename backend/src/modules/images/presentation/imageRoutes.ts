/**
 * modules/images/presentation/imageRoutes.ts
 *
 * Composition root for the images module.
 *
 * Multer stays at the HTTP edge (it is request middleware); Sharp/EXIF
 * processing lives in the LocalImageStorage adapter; rules live in the
 * use cases. Mutations carry checkGuestPermission in line with the
 * shared API contract (guests are GET-only).
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { SQLiteImageRepository } from '../infrastructure/SQLiteImageRepository';
import { LocalImageStorage } from '../infrastructure/LocalImageStorage';
import { createImageController } from './imageController';
import { IMAGE_ENTITY_TYPES, isEntityType } from '../domain/Image';
import { ValidationError } from '../../../core/errors';
import { authenticateToken, checkGuestPermission } from '../../../core/middleware';
import { MAX_UPLOAD_BYTES, translateMulterError } from './uploadErrors';

// ── Upload middleware ─────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

// Memory storage: the buffer is needed for both EXIF extraction and
// Sharp processing before anything touches the disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new ValidationError('Invalid file type. Only png, jpeg, and jpg are allowed.'));
  },
});

/** upload.single('image') with Multer errors translated to the API contract. */
const uploadSingleImage = (req: Request, res: Response, next: NextFunction): void => {
  upload.single('image')(req, res, (err: unknown) => {
    if (err) return next(translateMulterError(err));
    next();
  });
};

const validateEntityType = (req: Request, _res: Response, next: NextFunction): void => {
  // Express 5 types params as string | string[] — normalise first.
  const raw = req.params.entityType;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !isEntityType(value)) {
    return next(
      new ValidationError(`entityType must be one of: ${IMAGE_ENTITY_TYPES.join(', ')}`),
    );
  }
  req.params.entityType = value;
  next();
};

// ── Router ────────────────────────────────────────────────────────────────────

export const createImageRouter = (): Router => {
  const router = Router();
  const repo = new SQLiteImageRepository();
  const storage = new LocalImageStorage();
  const ctrl = createImageController(repo, storage);

  const requireUploadedFile = (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.file) return next(new ValidationError('No image file provided.'));
    next();
  };

  // POST /:entityType/:entityId — upload image
  router.post(
    '/:entityType/:entityId',
    authenticateToken,
    checkGuestPermission,
    validateEntityType,
    uploadSingleImage,
    requireUploadedFile,
    ctrl.uploadImage,
  );

  // GET /:entityType — list images for entity (entityId in query)
  router.get('/:entityType', authenticateToken, validateEntityType, ctrl.listEntityImages);

  // GET /:entityType/:entityId — serve primary image file (optional ?size=)
  router.get('/:entityType/:entityId', authenticateToken, validateEntityType, ctrl.serveEntityImage);

  // PATCH /:id — replace file and/or update date
  router.patch(
    '/:id',
    authenticateToken,
    checkGuestPermission,
    uploadSingleImage,
    ctrl.updateImage,
  );

  // DELETE /:id — delete single image by image ID, 204 No Content
  router.delete(
    '/:id',
    authenticateToken,
    checkGuestPermission,
    (req: Request, res: Response, next: NextFunction): void => {
      // Non-numeric ids fall through to /:entityType/:entityId below —
      // this route only owns numeric image ids.
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return next('route');
      ctrl.deleteImage(req, res, next);
    },
  );

  // DELETE /:entityType/:entityId — delete all images for an entity
  router.delete(
    '/:entityType/:entityId',
    authenticateToken,
    checkGuestPermission,
    validateEntityType,
    ctrl.deleteEntityImages,
  );

  return router;
};
