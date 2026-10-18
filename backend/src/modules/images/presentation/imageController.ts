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
  UpdateImageUseCase,
  DeleteImageUseCase,
  DeleteEntityImagesUseCase,
  type ImageRemovedListener,
  type ImageStoredListener,
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
import { toImageDto, type ImageDTO } from '../domain/imageDto';

// ── Response payloads (wire contract, see docs/api-reference.md) ─────────────

export interface UploadImageResponse {
  data: { path: string; date: string };
}
export type ImageWire = ImageDTO & { entityType: EntityType };
export interface ImageListResponse {
  data: ImageWire[];
}
export interface ImageResponse {
  data: ImageWire;
}

const toWire = (record: ImageRecord): ImageWire => ({
  ...toImageDto(record),
  entityType: record.entityType,
});

// ── HTTP input helpers ────────────────────────────────────────────────────────

const entityTypeParam = (req: FastifyRequest): EntityType =>
  (req.params as { entityType: string }).entityType as EntityType; // validated by the entity type hook

const actorOf = (req: FastifyRequest): ImageActor => ({ id: req.user!.id, role: req.user!.role });

export interface ImageController {
  uploadImage: Handler;
  listEntityImages: Handler;
  updateImage: Handler;
  deleteImage: Handler;
  deleteEntityImages: Handler;
}

export const createImageController = (
  repo: ImageRepository,
  storage: ImageStorage,
  access: ImageAccessPolicy,
  onStored?: ImageStoredListener,
  onRemoved?: ImageRemovedListener,
): ImageController => {
  const upload = new UploadImageUseCase(repo, storage, access, onStored);
  const list = new ListEntityImagesUseCase(repo, access);
  const update = new UpdateImageUseCase(repo, storage, access, onStored);
  const remove = new DeleteImageUseCase(repo, storage, access, onRemoved);
  const removeForEntity = new DeleteEntityImagesUseCase(repo, storage, access, onRemoved);

  return {
    uploadImage: async (req: FastifyRequest, reply: FastifyReply) => {
      const entityType = entityTypeParam(req);
      const entityId = numericParam(req, 'entityId');
      const { file, fields } = await readUpload(req);
      if (!file) throw new ValidationError('No image file provided.');

      const { url, capturedAt } = await upload.execute({
        actor: actorOf(req),
        entityType,
        entityId,
        file,
        date: fields['date'],
      });

      const body: UploadImageResponse = {
        data: { path: url, date: formatToDBDate(capturedAt.getTime()) },
      };
      return reply
        .code(HTTP_STATUS.CREATED)
        .header('Location', `/images/${entityType}?entityId=${entityId}`)
        .send(body);
    },

    listEntityImages: async (req: FastifyRequest) => {
      const images = await list.execute(
        entityTypeParam(req),
        Number((req.query as { entityId?: string }).entityId),
        actorOf(req),
      );
      const body: ImageListResponse = { data: images.map(toWire) };
      return body;
    },

    updateImage: async (req: FastifyRequest) => {
      const { file, fields } = await readUpload(req);
      const record = await update.execute({
        actor: actorOf(req),
        imageId: numericParam(req, 'id'),
        file,
        date: fields['date'],
      });
      const body: ImageResponse = { data: toWire(record) };
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
