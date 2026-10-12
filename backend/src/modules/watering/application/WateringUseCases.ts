/**
 * modules/watering/application/WateringUseCases.ts
 *
 * Use cases for watering records and fertilizer types. Writes answer with
 * what changed (the records plus the watering summaries of the affected
 * plants) so clients never re-read histories after a write.
 */

import { z } from 'zod';
import { toPage, type Cursor, type Page } from '../../../core/pagination';
import {
  toWateringItem,
  type WateringRepository,
  type WateringItem,
  type WateringSummaries,
  type FertilizerType,
} from '../domain/WateringRecord';
import { parseTzOffset, type WateringSummary } from '../../plants/domain/wateringSummary';
import { NotFoundError, ValidationError } from '../../../core/errors';
import { parseOrThrow } from '../../../core/validation';

// ── Input schemas (Zod) ───────────────────────────────────────────────────────

const TzOffsetField = z.union([z.string(), z.number()]).optional();

export const BATCH_MAX = 200;

export const CreateWateringSchema = z.object({
  date: z.union([z.string(), z.number()]).optional(),
  usedFertilizer: z.boolean().default(false),
  fertilizerTypeId: z.number().int().nullable().optional(),
  tz_offset: TzOffsetField,
});

export const CreateWateringBatchSchema = z.object({
  date: z.union([z.string(), z.number()]).optional(),
  tz_offset: TzOffsetField,
  entries: z
    .array(
      z.object({
        plantId: z.number().int().positive(),
        usedFertilizer: z.boolean().default(false),
        fertilizerTypeId: z.number().int().nullable().optional(),
      }),
    )
    .min(1)
    .max(BATCH_MAX)
    .refine((list) => new Set(list.map((e) => e.plantId)).size === list.length, {
      message: 'Each plant may appear only once',
    }),
});

export const DeleteWateringBatchSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(BATCH_MAX),
  tz_offset: TzOffsetField,
});

export const UpdateWateringSchema = z
  .object({
    date: z.union([z.string(), z.number()]).optional(),
    usedFertilizer: z.boolean().optional(),
    fertilizerTypeId: z.number().int().nullable().optional(),
    tz_offset: TzOffsetField,
  })
  .refine(
    (d) =>
      d.date !== undefined || d.usedFertilizer !== undefined || d.fertilizerTypeId !== undefined,
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
    typeof date === 'number' ? (date > 1e10 ? date : date * 1000) : new Date(date).getTime();
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

const summaryOf = async (
  repo: WateringRepository,
  plantId: number,
  tzMinutes: number,
): Promise<WateringSummary> => {
  const summary = (await repo.summariesFor([plantId], tzMinutes)).get(plantId);
  if (!summary) throw new NotFoundError('Plant');
  return summary;
};

// ── Results ───────────────────────────────────────────────────────────────────

export interface WateringWriteResult {
  record: WateringItem;
  summary: WateringSummary;
}

export interface WateringBatchResult {
  records: WateringItem[];
  summaries: WateringSummaries;
}

export interface WateringHistoryPage extends Page<WateringItem> {
  total?: number;
}

// ── Use Cases ─────────────────────────────────────────────────────────────────

export class GetFertilizerTypesUseCase {
  private cached: FertilizerType[] | null = null;

  constructor(private readonly repo: WateringRepository) {}

  /** The catalogue is static seed data, so it is read once per process. */
  async execute(): Promise<FertilizerType[]> {
    if (this.cached) return this.cached;
    const types = await this.repo.findFertilizerTypes();
    // An empty catalogue means the seed data is missing, surfaced as
    // 404 so the client can distinguish it from "no records yet".
    if (!types.length) throw new NotFoundError('Fertilizer types');
    this.cached = types;
    return types;
  }
}

export class GetWateringHistoryUseCase {
  constructor(private readonly repo: WateringRepository) {}

  async execute(
    plantId: number,
    userId: number,
    query: { limit: number; cursor: Cursor | null },
  ): Promise<WateringHistoryPage> {
    const found = await this.repo.findHistory(plantId, userId, {
      limit: query.limit,
      cursor: query.cursor,
      withTotal: query.cursor === null,
    });
    if (!found) throw new NotFoundError('Plant');
    const page = toPage(found.rows, {
      limit: query.limit,
      sort: 'date',
      key: (row) => ({ v: row.date, id: row.id }),
    });
    return {
      items: page.items.map(toWateringItem),
      nextCursor: page.nextCursor,
      ...(found.total === undefined ? {} : { total: found.total }),
    };
  }
}

export class GetWateringRecordUseCase {
  constructor(private readonly repo: WateringRepository) {}

  async execute(recordId: number, userId: number): Promise<WateringItem> {
    const record = await this.repo.findById(recordId, userId);
    if (!record) throw new NotFoundError('Watering record');
    return toWateringItem(record);
  }
}

export class CreateWateringRecordUseCase {
  constructor(private readonly repo: WateringRepository) {}

  async execute(plantId: number, userId: number, input: unknown): Promise<WateringWriteResult> {
    const data = parseOrThrow(CreateWateringSchema, input, 'Invalid watering data');
    const tz = parseTzOffset(data.tz_offset);
    const epochSeconds = requireEpochSeconds(data.date ?? Date.now());

    // The repository inserts via "... WHERE EXISTS (plant owned by user)";
    // no row back means the plant does not exist or is not the caller's.
    const row = await this.repo.create(
      {
        plantId,
        date: epochSeconds,
        usedFertilizer: data.usedFertilizer,
        fertilizerTypeId: data.fertilizerTypeId ?? null,
      },
      userId,
    );
    if (!row) throw new NotFoundError('Plant');

    return { record: toWateringItem(row), summary: await summaryOf(this.repo, plantId, tz) };
  }
}

export class UpdateWateringRecordUseCase {
  constructor(private readonly repo: WateringRepository) {}

  async execute(recordId: number, userId: number, input: unknown): Promise<WateringWriteResult> {
    const data = parseOrThrow(UpdateWateringSchema, input, 'Invalid watering data');
    const tz = parseTzOffset(data.tz_offset);
    const dateSeconds = data.date !== undefined ? requireEpochSeconds(data.date) : undefined;

    const row = await this.repo.update(recordId, userId, {
      date: dateSeconds,
      usedFertilizer: data.usedFertilizer,
      fertilizerTypeId: data.fertilizerTypeId,
    });
    if (!row) throw new NotFoundError('Watering record');

    return { record: toWateringItem(row), summary: await summaryOf(this.repo, row.plant_id, tz) };
  }
}

export class DeleteWateringRecordUseCase {
  constructor(private readonly repo: WateringRepository) {}

  async execute(
    recordId: number,
    userId: number,
    rawTzOffset: unknown,
  ): Promise<{ summary: WateringSummary }> {
    const tz = parseTzOffset(rawTzOffset);
    const plantId = await this.repo.delete(recordId, userId);
    if (plantId === null) throw new NotFoundError('Watering record');
    return { summary: await summaryOf(this.repo, plantId, tz) };
  }
}

export class CreateWateringBatchUseCase {
  constructor(private readonly repo: WateringRepository) {}

  async execute(userId: number, input: unknown): Promise<WateringBatchResult> {
    const data = parseOrThrow(CreateWateringBatchSchema, input, 'Invalid watering batch');
    const tz = parseTzOffset(data.tz_offset);
    const epochSeconds = requireEpochSeconds(data.date ?? Date.now());
    const created = await this.repo.createMany(userId, data.entries, epochSeconds, tz);
    if (!created) throw new NotFoundError('Plant');
    return {
      records: created.records.map(toWateringItem),
      summaries: Object.fromEntries(created.summaries),
    };
  }
}

export class DeleteWateringBatchUseCase {
  constructor(private readonly repo: WateringRepository) {}

  async execute(userId: number, input: unknown): Promise<{ summaries: WateringSummaries }> {
    const data = parseOrThrow(DeleteWateringBatchSchema, input, 'Invalid watering batch');
    const tz = parseTzOffset(data.tz_offset);
    const summaries = await this.repo.deleteMany(userId, data.ids, tz);
    if (!summaries) throw new NotFoundError('Watering record');
    return { summaries: Object.fromEntries(summaries) };
  }
}
