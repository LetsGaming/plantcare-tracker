/**
 * modules/images/presentation/imageRoutes.ts
 *
 * Composition root for the images module.
 *
 * @fastify/multipart stays at the HTTP edge; Sharp/EXIF processing lives in
 * the LocalImageStorage adapter; rules live in the use cases, including who
 * may read or change which entity's images. Guest read-only access is
 * enforced once for the whole API (guestReadOnly).
 */

import multipart from '@fastify/multipart';
import type { FastifyPluginAsync } from 'fastify';
import { SQLiteImageRepository } from '../infrastructure/SQLiteImageRepository';
import { LocalImageStorage } from '../infrastructure/LocalImageStorage';
import { createImageController } from './imageController';
import { SQLiteImageEntityLookup } from '../infrastructure/SQLiteImageEntityLookup';
import { ImageAccessPolicy } from '../application/ImageAccessPolicy';
import { IMAGE_ENTITY_TYPES, isEntityType } from '../domain/Image';
import { ValidationError } from '../../../core/errors';
import { authenticateToken, globalErrorHandler, numericParam } from '../../../core/middleware';
import type { Hook } from '../../../core/middleware';
import { MAX_UPLOAD_BYTES, translateUploadError } from './uploadErrors';

const validateEntityType: Hook = async (request) => {
  const value = (request.params as { entityType?: string }).entityType;
  if (!value || !isEntityType(value)) {
    throw new ValidationError(`entityType must be one of: ${IMAGE_ENTITY_TYPES.join(', ')}`);
  }
};

export const imageRoutes: FastifyPluginAsync = async (app) => {
  const repo = new SQLiteImageRepository();
  const storage = new LocalImageStorage();
  const access = new ImageAccessPolicy(new SQLiteImageEntityLookup());
  const ctrl = createImageController(repo, storage, access);

  // Parts are buffered and attached to the body so handlers read them like
  // any other input; the size cap bounds memory per upload.
  await app.register(multipart, {
    attachFieldsToBody: true,
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });
  app.setErrorHandler((error, request, reply) =>
    globalErrorHandler(translateUploadError(error), request, reply),
  );

  // POST /:entityType/:entityId: upload image
  app.post(
    '/:entityType/:entityId',
    { onRequest: [authenticateToken, validateEntityType] },
    ctrl.uploadImage,
  );

  // GET /:entityType: list images for entity (entityId in query)
  app.get(
    '/:entityType',
    { onRequest: [authenticateToken, validateEntityType] },
    ctrl.listEntityImages,
  );

  // GET /:entityType/:entityId: serve primary image file (optional ?size=)
  app.get(
    '/:entityType/:entityId',
    { onRequest: [authenticateToken, validateEntityType] },
    ctrl.serveEntityImage,
  );

  // PATCH /:id: replace file and/or update date
  app.patch('/:id', { onRequest: authenticateToken }, ctrl.updateImage);

  // DELETE /:id: delete single image by image ID, 204 No Content.
  // Only numeric image ids belong to this route; anything else is unknown.
  app.delete('/:id', { onRequest: authenticateToken }, async (request, reply) => {
    const id = numericParam(request, 'id');
    if (!Number.isInteger(id) || id <= 0) return reply.callNotFound();
    return ctrl.deleteImage(request, reply);
  });

  // DELETE /:entityType/:entityId: delete all images for an entity
  app.delete(
    '/:entityType/:entityId',
    { onRequest: [authenticateToken, validateEntityType] },
    ctrl.deleteEntityImages,
  );
};
