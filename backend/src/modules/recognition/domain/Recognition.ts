export interface Embedder {
  readonly modelId: string;
  /** Best-candidate score at or above which the match counts as confident. */
  readonly confidentScore: number;
  embed(image: Buffer): Promise<Float32Array>;
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
  plantImagesMissing(model: string): Promise<MissingImage[]>;
  purgeOrphans(): Promise<void>;
}
