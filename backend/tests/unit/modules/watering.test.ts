/**
 * tests/unit/modules/watering.test.ts
 *
 * Tests for the watering application layer (WateringUseCases).
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  WateringRepository,
  WateringRecordRow,
} from '../../../src/modules/watering/domain/WateringRecord';
import type { WateringSummary } from '../../../src/modules/plants/domain/wateringSummary';
import {
  toEpochSeconds,
  GetFertilizerTypesUseCase,
  GetWateringHistoryUseCase,
  GetWateringRecordUseCase,
  CreateWateringRecordUseCase,
  UpdateWateringRecordUseCase,
  DeleteWateringRecordUseCase,
  CreateWateringBatchUseCase,
  DeleteWateringBatchUseCase,
} from '../../../src/modules/watering/application/WateringUseCases';
import { decodeCursor } from '../../../src/core/pagination';
import { NotFoundError, ValidationError } from '../../../src/core/errors';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const makeRow = (overrides: Partial<WateringRecordRow> = {}): WateringRecordRow => ({
  id: 7,
  plant_id: 1,
  date: 1717236000,
  used_fertilizer: false,
  fertilizer_type_id: null,
  ...overrides,
});

const makeSummary = (overrides: Partial<WateringSummary> = {}): WateringSummary => ({
  last_watered_at: 1717236000000,
  last_fertilized_at: null,
  avg_interval_days: null,
  ...overrides,
});

const makeMockRepo = (): WateringRepository => ({
  findHistory: vi.fn().mockResolvedValue({ rows: [] }),
  findById: vi.fn().mockResolvedValue(null),
  findFertilizerTypes: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue(makeRow()),
  update: vi.fn().mockResolvedValue(makeRow()),
  delete: vi.fn().mockResolvedValue(1),
  createMany: vi.fn().mockResolvedValue({
    records: [makeRow()],
    summaries: new Map([[1, makeSummary()]]),
  }),
  deleteMany: vi.fn().mockResolvedValue(new Map([[1, makeSummary()]])),
  summariesFor: vi.fn().mockResolvedValue(new Map([[1, makeSummary()]])),
});

const asMock = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;

// ── toEpochSeconds ────────────────────────────────────────────────────────────

describe('toEpochSeconds', () => {
  it('converts an ISO string to epoch seconds', () => {
    expect(toEpochSeconds('2024-06-01T10:00:00.000Z')).toBe(1717236000);
  });

  it('treats large numbers as epoch milliseconds', () => {
    expect(toEpochSeconds(1717236000000)).toBe(1717236000);
  });

  it('passes through epoch seconds unchanged', () => {
    expect(toEpochSeconds(1717236000)).toBe(1717236000);
  });

  it('returns null for an unparsable string', () => {
    expect(toEpochSeconds('not-a-date')).toBeNull();
  });

  it('returns null for NaN input', () => {
    expect(toEpochSeconds(NaN)).toBeNull();
  });
});

// ── GetFertilizerTypesUseCase ─────────────────────────────────────────────────

describe('GetFertilizerTypesUseCase', () => {
  it('returns the fertilizer type catalogue and reads it from the database once', async () => {
    const repo = makeMockRepo();
    asMock(repo.findFertilizerTypes).mockResolvedValue([
      { fertilizer_id: 1, fertilizer_name: 'NPK' },
    ]);

    const useCase = new GetFertilizerTypesUseCase(repo);
    expect(await useCase.execute()).toHaveLength(1);
    expect(await useCase.execute()).toHaveLength(1);
    expect(repo.findFertilizerTypes).toHaveBeenCalledTimes(1);
  });

  it('throws NotFoundError when the catalogue is empty (missing seed data) and retries next time', async () => {
    const repo = makeMockRepo();
    const useCase = new GetFertilizerTypesUseCase(repo);
    await expect(useCase.execute()).rejects.toThrow(NotFoundError);
    await expect(useCase.execute()).rejects.toThrow(NotFoundError);
    expect(repo.findFertilizerTypes).toHaveBeenCalledTimes(2);
  });
});

// ── GetWateringHistoryUseCase ─────────────────────────────────────────────────

describe('GetWateringHistoryUseCase', () => {
  const rowsOf = (count: number): WateringRecordRow[] =>
    Array.from({ length: count }, (_, i) =>
      makeRow({ id: 100 - i, date: 1_700_000_000 - Math.floor(i / 2) }),
    );

  it('answers an empty first page with total 0 (no history is valid)', async () => {
    const repo = makeMockRepo();
    asMock(repo.findHistory).mockResolvedValue({ rows: [], total: 0 });
    const page = await new GetWateringHistoryUseCase(repo).execute(1, 2, {
      limit: 50,
      cursor: null,
    });
    expect(page).toEqual({ items: [], nextCursor: null, total: 0 });
    expect(repo.findHistory).toHaveBeenCalledWith(1, 2, {
      limit: 50,
      cursor: null,
      withTotal: true,
    });
  });

  it('trims the probe row, issues a cursor on the raw seconds and converts dates to ms', async () => {
    const repo = makeMockRepo();
    asMock(repo.findHistory).mockResolvedValue({ rows: rowsOf(4), total: 4 });
    const page = await new GetWateringHistoryUseCase(repo).execute(1, 2, {
      limit: 3,
      cursor: null,
    });
    expect(page.items.map((i) => i.id)).toEqual([100, 99, 98]);
    expect(page.items[0].date).toBe(1_700_000_000 * 1000);
    expect(page.items[0]).not.toHaveProperty('plant_name');
    expect(page.items[0]).not.toHaveProperty('owner_id');
    const cursor = decodeCursor(page.nextCursor!, 'date', {
      valueType: 'number',
      idType: 'number',
    });
    expect(cursor).toMatchObject({ v: 1_700_000_000 - 1, id: 98 });
  });

  it('asks for the total on the first page only', async () => {
    const repo = makeMockRepo();
    const cursor = { s: 'date', v: 5, id: 9 };
    const page = await new GetWateringHistoryUseCase(repo).execute(1, 2, { limit: 50, cursor });
    expect(repo.findHistory).toHaveBeenCalledWith(1, 2, { limit: 50, cursor, withTotal: false });
    expect(page).not.toHaveProperty('total');
  });

  it("throws NotFoundError when the plant is not the caller's", async () => {
    const repo = makeMockRepo();
    asMock(repo.findHistory).mockResolvedValue(null);
    await expect(
      new GetWateringHistoryUseCase(repo).execute(1, 2, { limit: 50, cursor: null }),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── GetWateringRecordUseCase ──────────────────────────────────────────────────

describe('GetWateringRecordUseCase', () => {
  it('returns the record as a wire item when found', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeRow());
    const record = await new GetWateringRecordUseCase(repo).execute(7, 2);
    expect(record).toEqual({
      id: 7,
      plant_id: 1,
      date: 1717236000000,
      used_fertilizer: false,
      fertilizer_type_id: null,
    });
  });

  it('throws NotFoundError when the record does not exist or is foreign', async () => {
    const repo = makeMockRepo();
    await expect(new GetWateringRecordUseCase(repo).execute(999, 2)).rejects.toThrow(NotFoundError);
  });
});

// ── CreateWateringRecordUseCase ───────────────────────────────────────────────

describe('CreateWateringRecordUseCase', () => {
  it('creates a record and answers it with the plant summary without reading it back', async () => {
    const repo = makeMockRepo();

    const result = await new CreateWateringRecordUseCase(repo).execute(1, 2, {
      date: '2024-06-01T10:00:00.000Z',
      usedFertilizer: true,
      fertilizerTypeId: 3,
      tz_offset: 120,
    });

    expect(result.record.id).toBe(7);
    expect(result.summary).toEqual(makeSummary());
    expect(repo.create).toHaveBeenCalledWith(
      { plantId: 1, date: 1717236000, usedFertilizer: true, fertilizerTypeId: 3 },
      2,
    );
    expect(repo.summariesFor).toHaveBeenCalledWith([1], 120);
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('defaults usedFertilizer to false, date to now and tz_offset to 0', async () => {
    const repo = makeMockRepo();
    const before = Math.floor(Date.now() / 1000);

    await new CreateWateringRecordUseCase(repo).execute(1, 2, {});

    const dto = asMock(repo.create).mock.calls[0][0];
    expect(dto.usedFertilizer).toBe(false);
    expect(dto.fertilizerTypeId).toBeNull();
    expect(dto.date).toBeGreaterThanOrEqual(before);
    expect(repo.summariesFor).toHaveBeenCalledWith([1], 0);
  });

  it('throws a field-scoped ValidationError for an invalid date', async () => {
    const repo = makeMockRepo();
    try {
      await new CreateWateringRecordUseCase(repo).execute(1, 2, { date: 'garbage' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).fields).toHaveProperty('date');
    }
  });

  it('rejects an invalid tz_offset before writing anything', async () => {
    const repo = makeMockRepo();
    await expect(
      new CreateWateringRecordUseCase(repo).execute(1, 2, { tz_offset: 9999 }),
    ).rejects.toThrow(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('throws ValidationError for a malformed body', async () => {
    const repo = makeMockRepo();
    await expect(
      new CreateWateringRecordUseCase(repo).execute(1, 2, { usedFertilizer: 'yes' }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError(Plant) when the insert matched no owned plant', async () => {
    const repo = makeMockRepo();
    asMock(repo.create).mockResolvedValue(null);
    await expect(new CreateWateringRecordUseCase(repo).execute(999, 2, {})).rejects.toThrow(
      NotFoundError,
    );
    expect(repo.summariesFor).not.toHaveBeenCalled();
  });
});

// ── UpdateWateringRecordUseCase ───────────────────────────────────────────────

describe('UpdateWateringRecordUseCase', () => {
  it('updates and answers the record with the summary of its plant', async () => {
    const repo = makeMockRepo();
    asMock(repo.update).mockResolvedValue(makeRow({ used_fertilizer: true, plant_id: 1 }));

    const result = await new UpdateWateringRecordUseCase(repo).execute(7, 2, {
      usedFertilizer: true,
      tz_offset: -60,
    });

    expect(repo.update).toHaveBeenCalledWith(7, 2, {
      date: undefined,
      usedFertilizer: true,
      fertilizerTypeId: undefined,
    });
    expect(result.record.used_fertilizer).toBe(true);
    expect(repo.summariesFor).toHaveBeenCalledWith([1], -60);
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('normalises a provided date to epoch seconds', async () => {
    const repo = makeMockRepo();

    await new UpdateWateringRecordUseCase(repo).execute(7, 2, {
      date: '2024-06-01T10:00:00.000Z',
    });

    expect(asMock(repo.update).mock.calls[0][2].date).toBe(1717236000);
  });

  it('throws ValidationError when no fields are provided', async () => {
    const repo = makeMockRepo();
    await expect(new UpdateWateringRecordUseCase(repo).execute(7, 2, {})).rejects.toThrow(
      ValidationError,
    );
    await expect(
      new UpdateWateringRecordUseCase(repo).execute(7, 2, { tz_offset: 0 }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError when the update matched nothing', async () => {
    const repo = makeMockRepo();
    asMock(repo.update).mockResolvedValue(null);
    await expect(
      new UpdateWateringRecordUseCase(repo).execute(999, 2, { usedFertilizer: false }),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── DeleteWateringRecordUseCase ───────────────────────────────────────────────

describe('DeleteWateringRecordUseCase', () => {
  it('deletes a record and answers the summary of its plant', async () => {
    const repo = makeMockRepo();
    const result = await new DeleteWateringRecordUseCase(repo).execute(7, 2, '30');
    expect(repo.delete).toHaveBeenCalledWith(7, 2);
    expect(repo.summariesFor).toHaveBeenCalledWith([1], 30);
    expect(result).toEqual({ summary: makeSummary() });
  });

  it('rejects an invalid tz_offset before deleting', async () => {
    const repo = makeMockRepo();
    await expect(new DeleteWateringRecordUseCase(repo).execute(7, 2, 'abc')).rejects.toThrow(
      ValidationError,
    );
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when nothing was deleted', async () => {
    const repo = makeMockRepo();
    asMock(repo.delete).mockResolvedValue(null);
    await expect(new DeleteWateringRecordUseCase(repo).execute(999, 2, undefined)).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ── Batches ───────────────────────────────────────────────────────────────────

describe('CreateWateringBatchUseCase', () => {
  it('answers the inserted records and a summary per plant', async () => {
    const repo = makeMockRepo();
    asMock(repo.createMany).mockResolvedValue({
      records: [makeRow({ id: 1, plant_id: 1 }), makeRow({ id: 2, plant_id: 5 })],
      summaries: new Map([
        [1, makeSummary()],
        [5, makeSummary({ last_watered_at: 5 })],
      ]),
    });

    const result = await new CreateWateringBatchUseCase(repo).execute(2, {
      entries: [
        { plantId: 1, usedFertilizer: false },
        { plantId: 5, usedFertilizer: true, fertilizerTypeId: 1 },
      ],
      tz_offset: 60,
    });

    expect(result.records.map((r) => r.id)).toEqual([1, 2]);
    expect(result.summaries).toEqual({ 1: makeSummary(), 5: makeSummary({ last_watered_at: 5 }) });
    expect(repo.createMany).toHaveBeenCalledWith(2, expect.any(Array), expect.any(Number), 60);
    expect(repo.summariesFor).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when a plant is foreign (repository inserted nothing)', async () => {
    const repo = makeMockRepo();
    asMock(repo.createMany).mockResolvedValue(null);
    await expect(
      new CreateWateringBatchUseCase(repo).execute(2, {
        entries: [{ plantId: 1, usedFertilizer: false }],
      }),
    ).rejects.toThrow(NotFoundError);
    expect(repo.summariesFor).not.toHaveBeenCalled();
  });

  it('rejects duplicates, empty and oversized batches', async () => {
    const repo = makeMockRepo();
    const useCase = new CreateWateringBatchUseCase(repo);
    const entry = { plantId: 1, usedFertilizer: false };
    await expect(useCase.execute(2, { entries: [entry, entry] })).rejects.toThrow(ValidationError);
    await expect(useCase.execute(2, { entries: [] })).rejects.toThrow(ValidationError);
    await expect(
      useCase.execute(2, {
        entries: Array.from({ length: 201 }, (_, i) => ({ plantId: i + 1, usedFertilizer: false })),
      }),
    ).rejects.toThrow(ValidationError);
    expect(repo.createMany).not.toHaveBeenCalled();
  });
});

describe('DeleteWateringBatchUseCase', () => {
  it('answers the summaries of the plants whose records were deleted', async () => {
    const repo = makeMockRepo();
    asMock(repo.deleteMany).mockResolvedValue(
      new Map([
        [1, makeSummary()],
        [5, makeSummary()],
      ]),
    );

    const result = await new DeleteWateringBatchUseCase(repo).execute(2, { ids: [10, 11] });

    expect(repo.deleteMany).toHaveBeenCalledWith(2, [10, 11], 0);
    expect(repo.summariesFor).not.toHaveBeenCalled();
    expect(Object.keys(result.summaries)).toEqual(['1', '5']);
  });

  it('throws NotFoundError when any id is foreign', async () => {
    const repo = makeMockRepo();
    asMock(repo.deleteMany).mockResolvedValue(null);
    await expect(new DeleteWateringBatchUseCase(repo).execute(2, { ids: [10] })).rejects.toThrow(
      NotFoundError,
    );
  });
});
