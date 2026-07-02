/**
 * tests/unit/modules/watering.test.ts
 *
 * Tests for the watering application layer (WateringUseCases).
 * These rules previously lived inline in the router factory and were
 * only covered indirectly through integration tests.
 */

import { describe, it, expect, vi } from 'vitest';
import type { WateringRepository } from '../../../src/modules/watering/domain/WateringRecord';
import {
  toEpochSeconds,
  GetFertilizerTypesUseCase,
  GetWateringRecordsForPlantUseCase,
  GetWateringRecordUseCase,
  CreateWateringRecordUseCase,
  UpdateWateringRecordUseCase,
  DeleteWateringRecordUseCase,
} from '../../../src/modules/watering/application/WateringUseCases';
import {
  NotFoundError,
  ValidationError,
  InternalError,
} from '../../../src/core/errors';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const makeRecord = (overrides = {}) => ({
  record_id: 7,
  watering_date: '2024-06-01 10:00:00',
  used_fertilizer: 0,
  fertilizer_type_id: null,
  fertilizer_type: null,
  plant_id: 1,
  plant_name: 'Monstera deliciosa',
  ...overrides,
});

const makeMockRepo = (): WateringRepository => ({
  findByPlant: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
  findFertilizerTypes: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue(7),
  update: vi.fn().mockResolvedValue(true),
  delete: vi.fn().mockResolvedValue(true),
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
  it('returns the fertilizer type catalogue', async () => {
    const repo = makeMockRepo();
    asMock(repo.findFertilizerTypes).mockResolvedValue([{ id: 1, name: 'NPK' }]);

    const types = await new GetFertilizerTypesUseCase(repo).execute();
    expect(types).toHaveLength(1);
  });

  it('throws NotFoundError when the catalogue is empty (missing seed data)', async () => {
    const repo = makeMockRepo();
    await expect(new GetFertilizerTypesUseCase(repo).execute()).rejects.toThrow(NotFoundError);
  });
});

// ── GetWateringRecordsForPlantUseCase ─────────────────────────────────────────

describe('GetWateringRecordsForPlantUseCase', () => {
  it('returns an empty list without throwing (no history is valid)', async () => {
    const repo = makeMockRepo();
    const records = await new GetWateringRecordsForPlantUseCase(repo).execute(1, 2);
    expect(records).toEqual([]);
    expect(repo.findByPlant).toHaveBeenCalledWith(1, 2);
  });
});

// ── GetWateringRecordUseCase ──────────────────────────────────────────────────

describe('GetWateringRecordUseCase', () => {
  it('returns the record when found', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeRecord());
    const record = await new GetWateringRecordUseCase(repo).execute(7, 2);
    expect(record.record_id).toBe(7);
  });

  it('throws NotFoundError when the record does not exist or is foreign', async () => {
    const repo = makeMockRepo();
    await expect(new GetWateringRecordUseCase(repo).execute(999, 2)).rejects.toThrow(NotFoundError);
  });
});

// ── CreateWateringRecordUseCase ───────────────────────────────────────────────

describe('CreateWateringRecordUseCase', () => {
  it('creates a record and returns the full read-back resource', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeRecord());

    const record = await new CreateWateringRecordUseCase(repo).execute(1, 2, {
      date: '2024-06-01T10:00:00.000Z',
      usedFertilizer: true,
      fertilizerTypeId: 3,
    });

    expect(record.record_id).toBe(7);
    expect(repo.create).toHaveBeenCalledWith(
      { plantId: 1, date: 1717236000, usedFertilizer: true, fertilizerTypeId: 3 },
      2,
    );
    expect(repo.findById).toHaveBeenCalledWith(7, 2);
  });

  it('defaults usedFertilizer to false and date to now', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeRecord());
    const before = Math.floor(Date.now() / 1000);

    await new CreateWateringRecordUseCase(repo).execute(1, 2, {});

    const dto = asMock(repo.create).mock.calls[0][0];
    expect(dto.usedFertilizer).toBe(false);
    expect(dto.fertilizerTypeId).toBeNull();
    expect(dto.date).toBeGreaterThanOrEqual(before);
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

  it('throws ValidationError for a malformed body', async () => {
    const repo = makeMockRepo();
    await expect(
      new CreateWateringRecordUseCase(repo).execute(1, 2, { usedFertilizer: 'yes' }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError(Plant) when the insert matched no owned plant', async () => {
    const repo = makeMockRepo();
    asMock(repo.create).mockResolvedValue(0);
    await expect(
      new CreateWateringRecordUseCase(repo).execute(999, 2, {}),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws InternalError when the created record cannot be read back', async () => {
    const repo = makeMockRepo();
    // create succeeds (id 7), default findById resolves null
    await expect(
      new CreateWateringRecordUseCase(repo).execute(1, 2, {}),
    ).rejects.toThrow(InternalError);
  });
});

// ── UpdateWateringRecordUseCase ───────────────────────────────────────────────

describe('UpdateWateringRecordUseCase', () => {
  it('updates and returns the full read-back resource', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeRecord({ used_fertilizer: 1 }));

    const record = await new UpdateWateringRecordUseCase(repo).execute(7, 2, {
      usedFertilizer: true,
    });

    expect(repo.update).toHaveBeenCalledWith(7, 2, {
      date: undefined,
      usedFertilizer: true,
      fertilizerTypeId: undefined,
    });
    expect(record.used_fertilizer).toBe(1);
  });

  it('normalises a provided date to epoch seconds', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeRecord());

    await new UpdateWateringRecordUseCase(repo).execute(7, 2, {
      date: '2024-06-01T10:00:00.000Z',
    });

    expect(asMock(repo.update).mock.calls[0][2].date).toBe(1717236000);
  });

  it('throws ValidationError when no fields are provided', async () => {
    const repo = makeMockRepo();
    await expect(
      new UpdateWateringRecordUseCase(repo).execute(7, 2, {}),
    ).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError when the update matched nothing', async () => {
    const repo = makeMockRepo();
    asMock(repo.update).mockResolvedValue(false);
    await expect(
      new UpdateWateringRecordUseCase(repo).execute(999, 2, { usedFertilizer: false }),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── DeleteWateringRecordUseCase ───────────────────────────────────────────────

describe('DeleteWateringRecordUseCase', () => {
  it('deletes an existing record', async () => {
    const repo = makeMockRepo();
    await new DeleteWateringRecordUseCase(repo).execute(7, 2);
    expect(repo.delete).toHaveBeenCalledWith(7, 2);
  });

  it('throws NotFoundError when nothing was deleted', async () => {
    const repo = makeMockRepo();
    asMock(repo.delete).mockResolvedValue(false);
    await expect(new DeleteWateringRecordUseCase(repo).execute(999, 2)).rejects.toThrow(NotFoundError);
  });
});
