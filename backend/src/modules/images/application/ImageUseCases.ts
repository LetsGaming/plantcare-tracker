/**
 * modules/images/application/ImageUseCases.ts
 *
 * Use cases for image metadata and file lifecycle.
 *
 * Each use case receives the ImageRepository (metadata) and — where
 * files are touched — the ImageStorage port. Ordering rules that were
 * previously buried in route middleware are explicit here:
 *
 *  - Update: the old file is deleted only AFTER the new file is
 *    processed and the database points at it. Deleting first would
 *    lose the image if processing failed midway.
 *  - Delete one image: file first, then metadata. A dangling row is
 *    worse than a dangling file, and remove() treats missing files as
 *    success.
 *  - Delete all images of an entity: rows first, then files, through the
 *    ImageCleanupService. A failing row delete fails the request; failing
 *    file removals are logged and leave only unreferenced files.
 */

import type {
  EntityImagePurger,
  ImageActor,
  ImageRepository,
  ImageStorage,
  ImageRecord,
  ImageVariantMeta,
  ProcessedUpload,
  StoredImage,
  EntityType,
  UploadedFile,
} from '../domain/Image';
import type { ImageAccessPolicy } from './ImageAccessPolicy';
import { parseCaptureDate } from './captureDate';
import { NotFoundError, ValidationError } from '../../../core/errors';
import { toPublicImageUrl, toStoredImagePath } from '../../../core/config';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Drops the internal entity reference before a record leaves the module. */
const toRecord = ({
  id,
  url,
  date,
  entityType,
  width,
  height,
  placeholder,
  variants,
}: StoredImage): ImageRecord => ({
  id,
  url,
  date,
  entityType,
  width,
  height,
  placeholder,
  variants,
});

const pickVariantMeta = ({
  width,
  height,
  placeholder,
  variants,
}: ImageVariantMeta): ImageVariantMeta => ({ width, height, placeholder, variants });

const toEpochSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

// ── Use Cases ─────────────────────────────────────────────────────────────────

export interface UploadImageInput {
  actor: ImageActor;
  entityType: EntityType;
  entityId: number;
  file: UploadedFile;
  /** Explicit capture time (epoch ms); wins over the file's EXIF date. */
  date?: string | number;
}

/** Emitted after a new image file is committed, so other modules can react. */
export interface StoredImageEvent {
  imageId: number;
  entityType: EntityType;
  imageUrl: string;
}

export type ImageStoredListener = (event: StoredImageEvent) => void;

/** Emitted after image files and rows are removed; the owner is the acting user. */
export type ImageRemovedListener = (event: { entityType: EntityType; ownerUserId: number }) => void;

export interface UploadImageResult {
  url: string;
  capturedAt: Date;
}

export class UploadImageUseCase {
  constructor(
    private readonly repo: ImageRepository,
    private readonly storage: ImageStorage,
    private readonly access: ImageAccessPolicy,
    private readonly onStored?: ImageStoredListener,
  ) {}

  async execute(input: UploadImageInput): Promise<UploadImageResult> {
    await this.access.assertCanModify(input.entityType, input.entityId, input.actor);

    const explicitMs = input.date === undefined ? undefined : parseCaptureDate(input.date);

    const processed = await this.storage.processUpload(input.file, input.entityType);
    const capturedAt = explicitMs === undefined ? processed.capturedAt : new Date(explicitMs);

    const stored = toStoredImagePath(input.entityType, processed.filename);
    let imageId: number;
    try {
      imageId = await this.repo.create(
        input.entityType,
        input.entityId,
        stored,
        toEpochSeconds(capturedAt),
        pickVariantMeta(processed),
      );
    } catch (err) {
      await this.storage.remove(input.entityType, processed.filename, processed.variants);
      throw err;
    }
    this.onStored?.({ imageId, entityType: input.entityType, imageUrl: stored });

    return { url: toPublicImageUrl(stored), capturedAt };
  }
}

export class ListEntityImagesUseCase {
  constructor(
    private readonly repo: ImageRepository,
    private readonly access: ImageAccessPolicy,
  ) {}

  async execute(
    entityType: EntityType,
    entityId: number,
    actor: ImageActor,
  ): Promise<ImageRecord[]> {
    if (!Number.isInteger(entityId) || entityId <= 0) {
      throw new ValidationError('entityId query parameter must be a positive integer', {
        entityId: 'must be a positive integer',
      });
    }
    await this.access.assertCanView(entityType, entityId, actor);
    return this.repo.findByEntity(entityType, entityId);
  }
}

export interface UpdateImageInput {
  actor: ImageActor;
  imageId: number;
  /** New file, when the client replaced the image. */
  file?: UploadedFile;
  /** New capture date (epoch ms) from the form. */
  date?: string | number;
}

export class UpdateImageUseCase {
  constructor(
    private readonly repo: ImageRepository,
    private readonly storage: ImageStorage,
    private readonly access: ImageAccessPolicy,
    private readonly onStored?: ImageStoredListener,
  ) {}

  async execute(input: UpdateImageInput): Promise<ImageRecord> {
    if (!input.file && input.date === undefined) {
      throw new ValidationError('No file or date provided for update.');
    }

    const existing = await this.repo.findById(input.imageId);
    if (!existing) throw new NotFoundError('Image');
    await this.access.assertCanModify(existing.entityType, existing.entityId, input.actor);

    let uploadDate: number | undefined;
    if (input.date !== undefined) {
      uploadDate = Math.floor(parseCaptureDate(input.date) / 1000);
    }

    let newUrl: string | undefined;
    let newMeta: ImageVariantMeta | undefined;
    let processed: ProcessedUpload | undefined;
    if (input.file) {
      processed = await this.storage.processUpload(input.file, existing.entityType);
      newUrl = toStoredImagePath(existing.entityType, processed.filename);
      newMeta = pickVariantMeta(processed);
    }

    try {
      await this.repo.update(input.imageId, { imageUrl: newUrl, uploadDate, ...newMeta });
    } catch (err) {
      if (processed) {
        await this.storage.remove(existing.entityType, processed.filename, processed.variants);
      }
      throw err;
    }

    // The new file is committed to the database — only now is it safe
    // to drop the old one.
    if (newUrl) {
      await this.storage.remove(existing.entityType, existing.url, existing.variants);
      this.onStored?.({
        imageId: input.imageId,
        entityType: existing.entityType,
        imageUrl: newUrl,
      });
    }

    const updated = await this.repo.findById(input.imageId);
    if (!updated) throw new NotFoundError('Image');
    return toRecord(updated);
  }
}

export class DeleteImageUseCase {
  constructor(
    private readonly repo: ImageRepository,
    private readonly storage: ImageStorage,
    private readonly access: ImageAccessPolicy,
    private readonly onRemoved?: ImageRemovedListener,
  ) {}

  async execute(imageId: number, actor: ImageActor): Promise<void> {
    const image = await this.repo.findById(imageId);
    if (!image) throw new NotFoundError('Image');
    await this.access.assertCanModify(image.entityType, image.entityId, actor);

    await this.storage.remove(image.entityType, image.url, image.variants);
    await this.repo.delete(imageId);
    this.onRemoved?.({ entityType: image.entityType, ownerUserId: actor.id });
  }
}

export class DeleteEntityImagesUseCase {
  constructor(
    private readonly purger: EntityImagePurger,
    private readonly access: ImageAccessPolicy,
    private readonly onRemoved?: ImageRemovedListener,
  ) {}

  async execute(entityType: EntityType, entityId: number, actor: ImageActor): Promise<void> {
    await this.access.assertCanModify(entityType, entityId, actor);
    await this.purger.purge(entityType, entityId);
    this.onRemoved?.({ entityType, ownerUserId: actor.id });
  }
}
