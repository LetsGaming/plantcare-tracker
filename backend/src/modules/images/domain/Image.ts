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
 *  - ImageStorage:    the file side: converting an upload to the
 *                     stored variants and deleting them. Implemented by the
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

/** Variant metadata persisted with every image row; variants = 1 means the 160 and 480 files exist. */
export interface ImageVariantMeta {
  width: number | null;
  height: number | null;
  placeholder: string | null;
  variants: number;
}

export interface ImageRecord extends ImageVariantMeta {
  id: number;
  /** Absolute public URL the client loads the image from (the database stores the path only). */
  url: string;
  /** Capture/upload date as Unix epoch seconds. */
  date: number;
  entityType: EntityType;
}

/** An image row together with the entity it belongs to; never sent to clients as is. */
export interface StoredImage extends ImageRecord {
  entityId: number;
}

// ── Access ────────────────────────────────────────────────────────────────────

/** The authenticated caller an image operation runs on behalf of. */
export interface ImageActor {
  id: number;
  role: string;
}

/** What the images module needs to know about an entity to authorize access. */
export interface ImageEntityInfo {
  /** Owning user; null for entities nobody owns (the component catalogue). */
  ownerId: number | null;
  isPublic: boolean;
}

export interface ImageEntityLookup {
  /** Returns null when the entity does not exist. */
  find(entityType: EntityType, entityId: number): Promise<ImageEntityInfo | null>;
}

/**
 * Lets the modules that own images (plants, substrates, components) remove
 * every image of an entity they delete, rows and files alike.
 */
export interface EntityImageCleanup {
  /** Never throws: the entity is already gone, so failures are only logged. */
  removeAll(entityType: EntityType, entityId: number): Promise<void>;
}

/** Explicit "delete all images of this entity" request. */
export interface EntityImagePurger {
  /**
   * Deletes the image rows, then their files. A failing row delete rejects;
   * failing file removals are logged and only leave unreferenced files.
   */
  purge(entityType: EntityType, entityId: number): Promise<void>;
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface UpdateImageDTO extends Partial<ImageVariantMeta> {
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
  findById(imageId: number): Promise<StoredImage | null>;
  create(
    entityType: EntityType,
    entityId: number,
    imageUrl: string,
    uploadDate?: number,
    meta?: ImageVariantMeta,
  ): Promise<number>;
  update(imageId: number, fields: UpdateImageDTO): Promise<void>;
  delete(imageId: number): Promise<void>;
  deleteByEntity(entityType: EntityType, entityId: number): Promise<ImageRecord[]>;
}

export interface ProcessedUpload extends ImageVariantMeta {
  /** Filename (webp) of the 1024 px variant as written to storage. */
  filename: string;
  /** Best-known capture date (EXIF when present, otherwise now). */
  capturedAt: Date;
}

export interface ImageStorage {
  /**
   * Converts and persists an upload as three webp variants; returns the
   * stored filename, the capture date extracted from its metadata and the
   * dimensions and placeholder colour of the largest variant.
   */
  processUpload(file: UploadedFile, entityType: EntityType): Promise<ProcessedUpload>;

  /** Reads the stored main file of an image; rejects when it is missing. */
  read(entityType: EntityType, imageUrl: string): Promise<Buffer>;

  /**
   * Deletes the stored file and, for variants = 1, its 160 and 480 variants.
   * With variants undefined the variant files are removed when they exist.
   * Missing files are ignored.
   */
  remove(entityType: string, imageUrl: string, variants?: number): Promise<void>;
}
