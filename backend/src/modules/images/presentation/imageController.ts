/**
 * modules/images/presentation/imageController.ts
 *
 * Thin controller for the images module: extract HTTP inputs (params,
 * query, multipart parts), call the use case, shape the response. All
 * rules (validation, deletion ordering, URL building) live in the
 * application layer.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  UploadImageUseCase,
  ListEntityImagesUseCase,
  ServeEntityImageUseCase,
  UpdateImageUseCase,
  DeleteImageUseCase,
  DeleteEntityImagesUseCase,
} from '../application/ImageUseCases';
import type { ImageAccessPolicy } from '../application/ImageAccessPolicy';
import type {
  ImageActor,
  ImageRepository,
  ImageStorage,
  ImageRecord,
  EntityType,
} from '../domain/Image';
import { numericParam, type Handler } from '../../../core/middleware';
import { HTTP_STATUS } from '../../../core/config';
import { ValidationError } from '../../../core/errors';
import { formatToDBDate } from '../../../core/utils';
import { readUpload } from './multipartUpload';

// ── Serving constants ─────────────────────────────────────────────────────────

const SERVED_IMAGE_CONTENT_TYPE = 'image/webp';
/** Client/proxy cache lifetime for served entity images (1 day). */
const SERVED_IMAGE_CACHE_CONTROL = 'public, max-age=86400';

// ── Response payloads (wire contract, see docs/api-reference.md) ─────────────

export interface UploadImageResponse {
  data: { path: string; date: string };
}
export interface ImageListResponse {
  data: ImageRecord[];
}
export interface ImageResponse {
  data: ImageRecord;
}

// ── HTTP input helpers ────────────────────────────────────────────────────────

const entityTypeParam = (req: FastifyRequest): EntityType =>
  (req.params as { entityType: string }).entityType as EntityType; // validated by the entity type hook

const actorOf = (req: FastifyRequest): ImageActor => ({ id: req.user!.id, role: req.user!.role });

export interface ImageController {
  uploadImage: Handler;
  listEntityImages: Handler;
  serveEntityImage: Handler;
  updateImage: Handler;
  deleteImage: Handler;
  deleteEntityImages: Handler;
}

export const createImageController = (
  repo: ImageRepository,
  storage: ImageStorage,
  access: ImageAccessPolicy,
): ImageController => {
  const upload = new UploadImageUseCase(repo, storage, access);
  const list = new ListEntityImagesUseCase(repo, access);
  const serve = new ServeEntityImageUseCase(repo, storage, access);
  const update = new UpdateImageUseCase(repo, storage, access);
  const remove = new DeleteImageUseCase(repo, storage, access);
  const removeForEntity = new DeleteEntityImagesUseCase(repo, storage, access);

  return {
    uploadImage: async (req: FastifyRequest, reply: FastifyReply) => {
      const entityType = entityTypeParam(req);
      const entityId = numericParam(req, 'entityId');
      const { file } = await readUpload(req);
      if (!file) throw new ValidationError('No image file provided.');

      const { url, capturedAt } = await upload.execute({
        actor: actorOf(req),
        entityType,
        entityId,
        file,
      });

      const body: UploadImageResponse = {
        data: { path: url, date: formatToDBDate(capturedAt.getTime()) },
      };
      return reply
        .code(HTTP_STATUS.CREATED)
        .header('Location', `/images/${entityType}/${entityId}`)
        .send(body);
    },

    listEntityImages: async (req: FastifyRequest) => {
      const images = await list.execute(
        entityTypeParam(req),
        Number((req.query as { entityId?: string }).entityId),
        actorOf(req),
      );
      const body: ImageListResponse = { data: images };
      return body;
    },

    serveEntityImage: async (req: FastifyRequest, reply: FastifyReply) => {
      const sizeParam = (req.query as { size?: string }).size;
      const width = sizeParam ? parseInt(sizeParam, 10) : undefined;

      const buffer = await serve.execute(
        entityTypeParam(req),
        numericParam(req, 'entityId'),
        actorOf(req),
        width !== undefined && !isNaN(width) && width > 0 ? width : undefined,
      );

      return reply
        .header('Content-Type', SERVED_IMAGE_CONTENT_TYPE)
        .header('Cache-Control', SERVED_IMAGE_CACHE_CONTROL)
        .send(buffer);
    },

    updateImage: async (req: FastifyRequest) => {
      const { file, fields } = await readUpload(req);
      const record = await update.execute({
        actor: actorOf(req),
        imageId: numericParam(req, 'id'),
        file,
        date: fields['date'],
      });
      const body: ImageResponse = { data: record };
      return body;
    },

    deleteImage: async (req: FastifyRequest, reply: FastifyReply) => {
      await remove.execute(numericParam(req, 'id'), actorOf(req));
      return reply.code(HTTP_STATUS.NO_CONTENT).send();
    },

    deleteEntityImages: async (req: FastifyRequest, reply: FastifyReply) => {
      await removeForEntity.execute(
        entityTypeParam(req),
        numericParam(req, 'entityId'),
        actorOf(req),
      );
      return reply.code(HTTP_STATUS.NO_CONTENT).send();
    },
  };
};
