/**
 * modules/images/presentation/imageController.ts
 *
 * Thin controller for the images module: extract HTTP inputs (params,
 * query, multer file), call the use case, shape the response. All
 * rules — validation, deletion ordering, URL building — live in the
 * application layer.
 */

import type { Request, RequestHandler, Response } from 'express';
import {
  UploadImageUseCase,
  ListEntityImagesUseCase,
  ServeEntityImageUseCase,
  UpdateImageUseCase,
  DeleteImageUseCase,
  DeleteEntityImagesUseCase,
} from '../application/ImageUseCases';
import type {
  ImageRepository,
  ImageStorage,
  ImageRecord,
  EntityType,
  UploadedFile,
} from '../domain/Image';
import { asyncHandler } from '../../../core/middleware';
import { HTTP_STATUS } from '../../../core/config';
import { formatToDBDate } from '../../../core/utils';

// ── Serving constants ─────────────────────────────────────────────────────────

const SERVED_IMAGE_CONTENT_TYPE = 'image/webp';
/** Client/proxy cache lifetime for served entity images (1 day). */
const SERVED_IMAGE_CACHE_CONTROL = 'public, max-age=86400';

// ── Response payloads (wire contract, see docs/api-reference.md) ─────────────

export interface UploadImageResponse { data: { path: string; date: string } }
export interface ImageListResponse { data: ImageRecord[] }
export interface ImageResponse { data: ImageRecord }

// ── HTTP input helpers ────────────────────────────────────────────────────────

const entityTypeParam = (req: Request): EntityType =>
  req.params.entityType as EntityType; // validated by validateEntityType middleware

const publicBaseUrl = (req: Request): string =>
  `${req.protocol}://${req.get('host')}`;

const uploadedFile = (req: Request): UploadedFile => ({
  buffer: req.file!.buffer,
  originalName: req.file!.originalname,
});

/**
 * HTTP handlers exposed by the images module.
 *
 * Explicitly typed so the declaration emit never has to name
 * transitive express types (ParamsDictionary/ParsedQs) — those are
 * not reachable by name under pnpm's non-hoisted node_modules
 * layout (TS2883).
 */
export interface ImageController {
  uploadImage: RequestHandler;
  listEntityImages: RequestHandler;
  serveEntityImage: RequestHandler;
  updateImage: RequestHandler;
  deleteImage: RequestHandler;
  deleteEntityImages: RequestHandler;
}

export const createImageController = (
  repo: ImageRepository,
  storage: ImageStorage,
): ImageController => {
  const upload = new UploadImageUseCase(repo, storage);
  const list = new ListEntityImagesUseCase(repo);
  const serve = new ServeEntityImageUseCase(repo, storage);
  const update = new UpdateImageUseCase(repo, storage);
  const remove = new DeleteImageUseCase(repo, storage);
  const removeForEntity = new DeleteEntityImagesUseCase(repo, storage);

  return {
    uploadImage: asyncHandler(async (req: Request, res: Response) => {
      const entityType = entityTypeParam(req);
      const entityId = Number(req.params.entityId);

      const { url, capturedAt } = await upload.execute({
        entityType,
        entityId,
        file: uploadedFile(req),
        publicBaseUrl: publicBaseUrl(req),
      });

      const body: UploadImageResponse = {
        data: { path: url, date: formatToDBDate(capturedAt.getTime()) },
      };
      res
        .status(HTTP_STATUS.CREATED)
        .location(`/images/${entityType}/${entityId}`)
        .json(body);
    }),

    listEntityImages: asyncHandler(async (req: Request, res: Response) => {
      const images = await list.execute(
        entityTypeParam(req),
        Number(req.query.entityId),
      );
      const body: ImageListResponse = { data: images };
      res.json(body);
    }),

    serveEntityImage: asyncHandler(async (req: Request, res: Response) => {
      const sizeParam = req.query.size as string | undefined;
      const width = sizeParam ? parseInt(sizeParam, 10) : undefined;

      const buffer = await serve.execute(
        entityTypeParam(req),
        Number(req.params.entityId),
        width !== undefined && !isNaN(width) && width > 0 ? width : undefined,
      );

      res.set('Content-Type', SERVED_IMAGE_CONTENT_TYPE);
      res.set('Cache-Control', SERVED_IMAGE_CACHE_CONTROL);
      res.send(buffer);
    }),

    updateImage: asyncHandler(async (req: Request, res: Response) => {
      const record = await update.execute({
        imageId: Number(req.params.id),
        file: req.file ? uploadedFile(req) : undefined,
        date: (req.body as { date?: string | number }).date,
        publicBaseUrl: publicBaseUrl(req),
      });
      const body: ImageResponse = { data: record };
      res.json(body);
    }),

    deleteImage: asyncHandler(async (req: Request, res: Response) => {
      await remove.execute(Number(req.params.id));
      res.status(HTTP_STATUS.NO_CONTENT).end();
    }),

    deleteEntityImages: asyncHandler(async (req: Request, res: Response) => {
      await removeForEntity.execute(
        entityTypeParam(req),
        Number(req.params.entityId),
      );
      res.status(HTTP_STATUS.NO_CONTENT).end();
    }),
  };
};
