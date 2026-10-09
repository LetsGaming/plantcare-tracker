import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { ImageRepository } from '../../images/domain/Image';
import type { CreateWateringRecordUseCase } from '../../watering/application/WateringUseCases';
import { toStoredImagePath } from '../../../core/config';
import { NotFoundError } from '../../../core/errors';
import { parseOrThrow } from '../../../core/validation';
import type {
  EmbeddingRepository,
  PendingSnapshot,
  RecognitionLogger,
  SnapshotStore,
} from '../domain/Recognition';

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
    private readonly log: Pick<RecognitionLogger, 'warn'>,
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

      const imageId = await this.keepPhoto(snap, data.plantId);
      return { recordId: record.record_id, imageId };
    } finally {
      await rm(snap.path, { force: true });
    }
  }

  /** Best effort: the watering record already exists, so a photo failure never fails the request. */
  private async keepPhoto(snap: PendingSnapshot, plantId: number): Promise<number | null> {
    const filename = `${Date.now()}-${randomUUID()}-snapshot.webp`;
    const target = path.join(this.uploadsDir, 'plant', filename);
    let imageId: number;
    try {
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(snap.path, target, constants.COPYFILE_EXCL);
      imageId = await this.images.create(
        'plant',
        plantId,
        toStoredImagePath('plant', filename),
        Math.floor(Date.now() / 1000),
      );
    } catch (err) {
      this.log.warn({ err, plantId }, 'snapshot photo could not be stored');
      await rm(target, { force: true });
      return null;
    }
    try {
      await this.embeddings.save(imageId, this.modelId, snap.vector);
    } catch (err) {
      this.log.warn({ err, imageId }, 'snapshot photo embedding failed');
    }
    return imageId;
  }
}
