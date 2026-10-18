import type { Sharp } from 'sharp';

export interface Embedder {
  readonly modelId: string;
  /** Best-candidate score at or above which the match counts as confident. */
  readonly confidentScore: number;
  embed(image: Buffer): Promise<Float32Array>;
  /** Embeds an opened, orientation-corrected pipeline by cloning it, so the caller opens the file once. */
  embedDecoded?(source: Sharp): Promise<Float32Array>;
}

export interface PlantVector {
  plantId: number;
  imageId: number;
  vector: Float32Array;
}

export interface PlantMatch {
  plantId: number;
  score: number;
}

export interface MissingImage {
  imageId: number;
  imageUrl: string;
}

export interface EmbeddingRepository {
  save(imageId: number, model: string, vector: Float32Array): Promise<void>;
  vectorsForUser(userId: number, model: string): Promise<PlantVector[]>;
  /** Plant images without a vector for the model, ascending by id after `afterId`, at most `limit`. */
  plantImagesMissing(model: string, limit?: number, afterId?: number): Promise<MissingImage[]>;
  anyMissing(model: string): Promise<boolean>;
  countMissing(model: string): Promise<number>;
}

export interface PendingSnapshot {
  userId: number;
  path: string;
  vector: Float32Array;
  expiresAt: number;
}

export interface SnapshotStore {
  put(userId: number, webp: Buffer, vector: Float32Array): Promise<string>;
  /** Removes and returns the snapshot, or null when unknown, expired or owned by someone else. */
  take(id: string, userId: number): PendingSnapshot | null;
}

export interface RecognitionLogger {
  warn(msg: string): void;
  warn(obj: object, msg: string): void;
  info(obj: object, msg: string): void;
}

export interface EmbedQueueStats {
  /** Images waiting in the in-memory queue. */
  queued: number;
  /** Images still without a vector at the last backfill scan. */
  pending: number;
  /** Images that did not fit the queue since the last scan and were left to the backfill. */
  deferred: number;
}
