/**
 * modules/images/domain/Image.ts
 *
 * Domain model and ports for the images module.
 *
 * This module previously had no domain or application layer at all —
 * the route file talked to the repository class directly and owned
 * every rule. The two ports below are what the use cases program
 * against:
 *
 *  - ImageRepository: metadata persistence (implemented by SQLite).
 *  - ImageStorage:    the file side — converting an upload to the
 *                     stored format, reading it back (optionally
 *                     resized), and deleting it. Implemented by the
 *                     local-disk adapter; a future object-storage
 *                     backend only has to satisfy this interface.
 *
 * No framework, SQL, or filesystem imports are allowed here.
 */

// ── Entity types an image can belong to ───────────────────────────────────────

export const IMAGE_ENTITY_TYPES = ['plant', 'substrate', 'component'] as const;
export type EntityType = (typeof IMAGE_ENTITY_TYPES)[number];

export const isEntityType = (value: string): value is EntityType =>
  (IMAGE_ENTITY_TYPES as readonly string[]).includes(value);

// ── Image record ──────────────────────────────────────────────────────────────

export interface ImageRecord {
  id: number;
  /** Absolute public URL the client loads the image from. */
  url: string;
  /** Capture/upload date as Unix epoch seconds. */
  date: number;
  entityType: EntityType;
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface UpdateImageDTO {
  imageUrl?: string;
  /** Unix epoch seconds. */
  uploadDate?: number;
}

/** Raw upload as handed over by the HTTP layer. */
export interface UploadedFile {
  buffer: Buffer;
  originalName: string;
}

// ── Ports ─────────────────────────────────────────────────────────────────────

export interface ImageRepository {
  findByEntity(entityType: EntityType, entityId: number): Promise<ImageRecord[]>;
  findById(imageId: number): Promise<ImageRecord | null>;
  create(
    entityType: EntityType,
    entityId: number,
    imageUrl: string,
    uploadDate?: number,
  ): Promise<number>;
  update(imageId: number, fields: UpdateImageDTO): Promise<void>;
  delete(imageId: number): Promise<void>;
  deleteByEntity(entityType: EntityType, entityId: number): Promise<ImageRecord[]>;
}

export interface ProcessedUpload {
  /** Filename (webp) as written to storage. */
  filename: string;
  /** Best-known capture date (EXIF when present, otherwise now). */
  capturedAt: Date;
}

export interface ImageStorage {
  /**
   * Converts and persists an upload; returns the stored filename and
   * the capture date extracted from its metadata.
   */
  processUpload(
    file: UploadedFile,
    entityType: EntityType,
  ): Promise<ProcessedUpload>;

  /**
   * Reads a stored image as webp, optionally resized to resizeWidth.
   * Throws NotFoundError when the file is missing on disk.
   */
  readAsWebp(
    entityType: string,
    imageUrl: string,
    resizeWidth?: number,
  ): Promise<Buffer>;

  /** Deletes the stored file; missing files are ignored. */
  remove(entityType: string, imageUrl: string): Promise<void>;
}
