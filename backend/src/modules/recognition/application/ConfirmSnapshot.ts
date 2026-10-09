import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { ImageRepository } from '../../images/domain/Image';
import type { CreateWateringRecordUseCase } from '../../watering/application/WateringUseCases';
import { toStoredImagePath } from '../../../core/config';
import { NotFoundError } from '../../../core/errors';
import { parseOrThrow } from '../../../core/validation';
import type { EmbeddingRepository, SnapshotStore } from '../domain/Recognition';

const ConfirmSchema = z.object({
  plantId: z.number().int().positive(),
  usedFertilizer: z.boolean().default(false),
  fertilizerTypeId: z.number().int().nullable().optional(),
  keepPhoto: z.boolean().default(true),
});

export interface ConfirmResult {
  recordId: number;
  imageId: number | null;
}

export class ConfirmSnapshotUseCase {
  constructor(
    private readonly createWatering: CreateWateringRecordUseCase,
    private readonly images: ImageRepository,
    private readonly embeddings: EmbeddingRepository,
    private readonly snapshots: SnapshotStore,
    private readonly modelId: string,
    private readonly uploadsDir: string,
  ) {}

  async execute(userId: number, snapshotId: string, input: unknown): Promise<ConfirmResult> {
    const data = parseOrThrow(ConfirmSchema, input, 'Invalid confirmation');
    const snap = this.snapshots.take(snapshotId, userId);
    if (!snap) throw new NotFoundError('Snapshot');
    try {
      const record = await this.createWatering.execute(data.plantId, userId, {
        usedFertilizer: data.usedFertilizer,
        fertilizerTypeId: data.fertilizerTypeId,
      });
      if (!data.keepPhoto) return { recordId: record.record_id, imageId: null };

      const filename = `${Date.now()}-snapshot.webp`;
      const target = path.join(this.uploadsDir, 'plant', filename);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(snap.path, target);
      try {
        const imageId = await this.images.create(
          'plant',
          data.plantId,
          toStoredImagePath('plant', filename),
          Math.floor(Date.now() / 1000),
        );
        await this.embeddings.save(imageId, this.modelId, snap.vector);
        return { recordId: record.record_id, imageId };
      } catch (err) {
        await rm(target, { force: true });
        throw err;
      }
    } finally {
      await rm(snap.path, { force: true });
    }
  }
}
