/**
 * modules/watering/application/WateringUseCases.ts
 *
 * Use cases for watering records and fertilizer types.
 *
 * Everything in this file previously lived inline in the router
 * factory: the zod schemas, the epoch-seconds normalisation, the
 * "create then read back" orchestration, and the not-found decisions.
 * Moving it here brings the module in line with the reference pattern
 * (plants): validation and business rules in the application layer,
 * repositories behind ports, presentation reduced to HTTP plumbing.
 */

import { z } from 'zod';
import type {
  WateringRepository,
  WateringRecordData,
  FertilizerType,
} from '../domain/WateringRecord';
import { NotFoundError, ValidationError, InternalError } from '../../../core/errors';
import { parseOrThrow } from '../../../core/validation';

// ── Input schemas (Zod) ───────────────────────────────────────────────────────

export const CreateWateringSchema = z.object({
  date: z.union([z.string(), z.number()]).optional(),
  usedFertilizer: z.boolean().default(false),
  fertilizerTypeId: z.number().int().nullable().optional(),
});

export const UpdateWateringSchema = z
  .object({
    date: z.union([z.string(), z.number()]).optional(),
    usedFertilizer: z.boolean().optional(),
    fertilizerTypeId: z.number().int().nullable().optional(),
  })
  .refine(
    (d) =>
      d.date !== undefined ||
      d.usedFertilizer !== undefined ||
      d.fertilizerTypeId !== undefined,
    { message: 'At least one field must be provided for update' },
  );

// ── Date normalisation (business rule) ────────────────────────────────────────

/**
 * Normalises a client-supplied date (ISO string, epoch millis, or epoch
 * seconds) to Unix epoch seconds for SQLite storage. Returns null when
 * the input does not represent a valid point in time.
 *
 * Exported for direct unit testing.
 */
export const toEpochSeconds = (date: string | number): number | null => {
  const ms =
    typeof date === 'number'
      ? (date > 1e10 ? date : date * 1000)
      : new Date(date).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
};

/** Shared guard: normalise or throw the field-scoped ValidationError. */
const requireEpochSeconds = (date: string | number): number => {
  const seconds = toEpochSeconds(date);
  if (seconds === null) {
    throw new ValidationError('Invalid date value', {
      date: 'date must be a valid ISO string or Unix timestamp',
    });
  }
  return seconds;
};

// ── Use Cases ─────────────────────────────────────────────────────────────────

export class GetFertilizerTypesUseCase {
  constructor(private readonly repo: WateringRepository) {}

  async execute(): Promise<FertilizerType[]> {
    const types = await this.repo.findFertilizerTypes();
    // An empty catalogue means the seed data is missing — surfaced as
    // 404 so the client can distinguish it from "no records yet".
    if (!types.length) throw new NotFoundError('Fertilizer types');
    return types;
  }
}

export class GetWateringRecordsForPlantUseCase {
  constructor(private readonly repo: WateringRepository) {}

  async execute(plantId: number, userId: number): Promise<WateringRecordData[]> {
    // An empty list is a valid answer (plant with no history) — no 404.
    return this.repo.findByPlant(plantId, userId);
  }
}

export class GetWateringRecordUseCase {
  constructor(private readonly repo: WateringRepository) {}

  async execute(recordId: number, userId: number): Promise<WateringRecordData> {
    const record = await this.repo.findById(recordId, userId);
    if (!record) throw new NotFoundError('Watering record');
    return record;
  }
}

export class CreateWateringRecordUseCase {
  constructor(private readonly repo: WateringRepository) {}

  async execute(
    plantId: number,
    userId: number,
    input: unknown,
  ): Promise<WateringRecordData> {
    const data = parseOrThrow(CreateWateringSchema, input, 'Invalid watering data');

    const epochSeconds = requireEpochSeconds(data.date ?? Date.now());

    const recordId = await this.repo.create(
      {
        plantId,
        date: epochSeconds,
        usedFertilizer: data.usedFertilizer,
        fertilizerTypeId: data.fertilizerTypeId ?? null,
      },
      userId,
    );

    // The repository inserts via "... WHERE EXISTS (plant owned by user)";
    // a zero id means the plant does not exist or is not the caller's.
    if (!recordId) throw new NotFoundError('Plant');

    const record = await this.repo.findById(recordId, userId);
    if (!record) throw new InternalError('Created watering record could not be read back');
    return record;
  }
}

export class UpdateWateringRecordUseCase {
  constructor(private readonly repo: WateringRepository) {}

  async execute(
    recordId: number,
    userId: number,
    input: unknown,
  ): Promise<WateringRecordData> {
    const data = parseOrThrow(UpdateWateringSchema, input, 'Invalid watering data');

    const dateSeconds =
      data.date !== undefined ? requireEpochSeconds(data.date) : undefined;

    const updated = await this.repo.update(recordId, userId, {
      date: dateSeconds,
      usedFertilizer: data.usedFertilizer,
      fertilizerTypeId: data.fertilizerTypeId,
    });
    if (!updated) throw new NotFoundError('Watering record');

    const record = await this.repo.findById(recordId, userId);
    if (!record) throw new NotFoundError('Watering record');
    return record;
  }
}

export class DeleteWateringRecordUseCase {
  constructor(private readonly repo: WateringRepository) {}

  async execute(recordId: number, userId: number): Promise<void> {
    const deleted = await this.repo.delete(recordId, userId);
    if (!deleted) throw new NotFoundError('Watering record');
  }
}
