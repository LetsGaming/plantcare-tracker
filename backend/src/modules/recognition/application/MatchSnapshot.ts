import sharp, { type Sharp } from 'sharp';
import type { UploadedFile } from '../../images/domain/Image';
import { ValidationError } from '../../../core/errors';
import type {
  Embedder,
  EmbeddingRepository,
  PlantMatch,
  SnapshotStore,
} from '../domain/Recognition';

import { rankPlants } from './rankPlants';

const SNAPSHOT_WIDTH = 1024;
const SNAPSHOT_QUALITY = 70;

export interface MatchResult {
  snapshotId: string;
  threshold: number;
  candidates: PlantMatch[];
}

export class MatchSnapshotUseCase {
  constructor(
    private readonly embedder: Embedder,
    private readonly embeddings: EmbeddingRepository,
    private readonly snapshots: SnapshotStore,
    private readonly limitInputPixels: number,
  ) {}

  async execute(userId: number, file: UploadedFile): Promise<MatchResult> {
    const unreadable = () => new ValidationError('Unreadable image', { image: 'Unreadable image' });
    let source: Sharp;
    let encoded: Promise<Buffer>;
    try {
      source = sharp(file.buffer, { limitInputPixels: this.limitInputPixels }).rotate();
      encoded = source
        .clone()
        .resize({ width: SNAPSHOT_WIDTH, withoutEnlargement: true })
        .webp({ quality: SNAPSHOT_QUALITY })
        .toBuffer();
    } catch {
      throw unreadable();
    }
    const embedded = this.embedder.embedDecoded?.(source);
    embedded?.catch(() => undefined);
    let webp: Buffer;
    try {
      webp = await encoded;
    } catch {
      throw unreadable();
    }
    const vector = await (embedded ?? this.embedder.embed(webp));
    const candidates = rankPlants(
      vector,
      await this.embeddings.vectorsForUser(userId, this.embedder.modelId),
    );
    const snapshotId = await this.snapshots.put(userId, webp, vector);
    return { snapshotId, threshold: this.embedder.confidentScore, candidates };
  }
}
