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
 *  - Delete: file first, then metadata — a dangling row is worse than
 *    a dangling file, and remove() treats missing files as success.
 */

import type {
  ImageRepository,
  ImageStorage,
  ImageRecord,
  EntityType,
  UploadedFile,
} from '../domain/Image';
import { NotFoundError, ValidationError } from '../../../core/errors';
import { STATIC_UPLOADS_ROUTE } from '../../../core/config';

// ── Helpers ───────────────────────────────────────────────────────────────────

const toEpochSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

/** Builds the absolute public URL a stored file is served under. */
const buildPublicUrl = (
  publicBaseUrl: string,
  entityType: EntityType,
  filename: string,
): string => `${publicBaseUrl}${STATIC_UPLOADS_ROUTE}/${entityType}/${filename}`;

// ── Use Cases ─────────────────────────────────────────────────────────────────

export interface UploadImageInput {
  entityType: EntityType;
  entityId: number;
  file: UploadedFile;
  /** protocol://host of this request — used to build the stored URL. */
  publicBaseUrl: string;
}

export interface UploadImageResult {
  url: string;
  capturedAt: Date;
}

export class UploadImageUseCase {
  constructor(
    private readonly repo: ImageRepository,
    private readonly storage: ImageStorage,
  ) {}

  async execute(input: UploadImageInput): Promise<UploadImageResult> {
    const { filename, capturedAt } = await this.storage.processUpload(
      input.file,
      input.entityType,
    );

    const url = buildPublicUrl(input.publicBaseUrl, input.entityType, filename);
    await this.repo.create(
      input.entityType,
      input.entityId,
      url,
      toEpochSeconds(capturedAt),
    );

    return { url, capturedAt };
  }
}

export class ListEntityImagesUseCase {
  constructor(private readonly repo: ImageRepository) {}

  async execute(entityType: EntityType, entityId: number): Promise<ImageRecord[]> {
    if (!Number.isInteger(entityId) || entityId <= 0) {
      throw new ValidationError(
        'entityId query parameter must be a positive integer',
        { entityId: 'must be a positive integer' },
      );
    }
    return this.repo.findByEntity(entityType, entityId);
  }
}

export class ServeEntityImageUseCase {
  constructor(
    private readonly repo: ImageRepository,
    private readonly storage: ImageStorage,
  ) {}

  /**
   * Returns the primary (oldest) image of an entity as webp bytes,
   * optionally resized. 404 when the entity has no images or the file
   * is gone from disk.
   */
  async execute(
    entityType: EntityType,
    entityId: number,
    resizeWidth?: number,
  ): Promise<Buffer> {
    const images = await this.repo.findByEntity(entityType, entityId);
    if (!images.length) throw new NotFoundError('Image');

    return this.storage.readAsWebp(entityType, images[0].url, resizeWidth);
  }
}

export interface UpdateImageInput {
  imageId: number;
  /** New file, when the client replaced the image. */
  file?: UploadedFile;
  /** New capture date — any Date-parsable value from the form. */
  date?: string | number;
  publicBaseUrl: string;
}

export class UpdateImageUseCase {
  constructor(
    private readonly repo: ImageRepository,
    private readonly storage: ImageStorage,
  ) {}

  async execute(input: UpdateImageInput): Promise<ImageRecord> {
    if (!input.file && input.date === undefined) {
      throw new ValidationError('No file or date provided for update.');
    }

    const existing = await this.repo.findById(input.imageId);
    if (!existing) throw new NotFoundError('Image');

    let newUrl: string | undefined;
    if (input.file) {
      const { filename } = await this.storage.processUpload(
        input.file,
        existing.entityType,
      );
      newUrl = buildPublicUrl(input.publicBaseUrl, existing.entityType, filename);
    }

    let uploadDate: number | undefined;
    if (input.date !== undefined) {
      const parsed = new Date(input.date).getTime();
      if (!Number.isFinite(parsed)) {
        throw new ValidationError('Invalid date value', {
          date: 'date must be a valid ISO string or Unix timestamp',
        });
      }
      uploadDate = Math.floor(parsed / 1000);
    }

    await this.repo.update(input.imageId, { imageUrl: newUrl, uploadDate });

    // The new file is committed to the database — only now is it safe
    // to drop the old one.
    if (newUrl) {
      await this.storage.remove(existing.entityType, existing.url);
    }

    const updated = await this.repo.findById(input.imageId);
    if (!updated) throw new NotFoundError('Image');
    return updated;
  }
}

export class DeleteImageUseCase {
  constructor(
    private readonly repo: ImageRepository,
    private readonly storage: ImageStorage,
  ) {}

  async execute(imageId: number): Promise<void> {
    const image = await this.repo.findById(imageId);
    if (!image) throw new NotFoundError('Image');

    await this.storage.remove(image.entityType, image.url);
    await this.repo.delete(imageId);
  }
}

export class DeleteEntityImagesUseCase {
  constructor(
    private readonly repo: ImageRepository,
    private readonly storage: ImageStorage,
  ) {}

  async execute(entityType: EntityType, entityId: number): Promise<void> {
    const images = await this.repo.deleteByEntity(entityType, entityId);
    await Promise.all(
      images.map((img) => this.storage.remove(entityType, img.url)),
    );
  }
}
