/**
 * tests/unit/modules/plants.test.ts
 *
 * Tests for Plant domain entity and use cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Plant } from '../../../src/modules/plants/domain/Plant';
import type { PlantListQuery, PlantRepository } from '../../../src/modules/plants/domain/Plant';
import {
  parseTzOffset,
  toWateringSummary,
} from '../../../src/modules/plants/domain/wateringSummary';
import {
  ListPlantsUseCase,
  GetPlantUseCase,
  CreatePlantUseCase,
  UpdatePlantUseCase,
  DeletePlantUseCase,
} from '../../../src/modules/plants/application/PlantUseCases';
import { NotFoundError, ValidationError, InternalError } from '../../../src/core/errors';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const makePlantData = (overrides = {}) => ({
  plant_id: 1,
  plant_name: 'Monstera deliciosa',
  user_id: 2,
  is_public: true,
  created_at: 1704067200000,
  species_name: 'Monstera deliciosa',
  substrate: { substrate_id: 1, substrate_name: 'Aroid Mix' },
  cover: null,
  image_count: 0,
  watering: null,
  images: [],
  ...overrides,
});

const query: PlantListQuery = { limit: 30, cursor: null, q: null, sort: 'created' };
const emptyPage = { items: [], nextCursor: null };

const makeMockRepo = (): PlantRepository => ({
  listMine: vi.fn().mockResolvedValue(emptyPage),
  listPublic: vi.fn().mockResolvedValue(emptyPage),
  findById: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue(1),
  update: vi.fn().mockResolvedValue(true),
  delete: vi.fn().mockResolvedValue(true),
  isSubstrateUsableBy: vi.fn().mockResolvedValue(true),
});

// ── Plant entity ──────────────────────────────────────────────────────────────

describe('Plant entity', () => {
  it('constructs from PlantData', () => {
    const data = makePlantData();
    const plant = new Plant(data);
    expect(plant.id).toBe(1);
    expect(plant.name).toBe('Monstera deliciosa');
    expect(plant.isPublic).toBe(true);
  });

  it('converts numeric is_public to boolean', () => {
    const plant = new Plant(makePlantData({ is_public: 0 }));
    expect(plant.isPublic).toBe(false);
  });

  it('toJSON() round-trips to PlantData', () => {
    const data = makePlantData();
    const plant = new Plant(data);
    expect(plant.toJSON().plant_id).toBe(data.plant_id);
    expect(plant.toJSON().plant_name).toBe(data.plant_name);
  });

  it('handles null substrate', () => {
    const plant = new Plant(makePlantData({ substrate: null }));
    expect(plant.substrate).toBeNull();
  });
});

// ── ListPlantsUseCase ─────────────────────────────────────────────────────────

describe('ListPlantsUseCase', () => {
  it('lists the viewer own plants for scope mine with the timezone', async () => {
    const repo = makeMockRepo();
    const page = { items: [], nextCursor: 'abc', total: 5 };
    (repo.listMine as ReturnType<typeof vi.fn>).mockResolvedValue(page);

    const result = await new ListPlantsUseCase(repo).execute('mine', query, 2, 120);
    expect(result).toBe(page);
    expect(repo.listMine).toHaveBeenCalledWith(2, query, 120);
    expect(repo.listPublic).not.toHaveBeenCalled();
  });

  it('lists public plants for scope public even for a signed-in viewer', async () => {
    const repo = makeMockRepo();
    await new ListPlantsUseCase(repo).execute('public', query, 2, 0);
    expect(repo.listPublic).toHaveBeenCalledWith(query);
    expect(repo.listMine).not.toHaveBeenCalled();
  });

  it('answers scope mine without a viewer with an empty page and no query', async () => {
    const repo = makeMockRepo();
    const first = await new ListPlantsUseCase(repo).execute('mine', query, null, 0);
    expect(first).toEqual({ items: [], nextCursor: null, total: 0 });
    const later = await new ListPlantsUseCase(repo).execute(
      'mine',
      { ...query, cursor: { s: 'created', v: 1, id: 1 } },
      null,
      0,
    );
    expect(later).toEqual({ items: [], nextCursor: null });
    expect(repo.listMine).not.toHaveBeenCalled();
  });
});

// ── Watering summary ──────────────────────────────────────────────────────────

describe('toWateringSummary', () => {
  const day = (n: number, hour = 12) => Date.UTC(2026, 2, n, hour) / 1000;
  const base = {
    lastWateredSec: null,
    lastFertilizedSec: null,
    firstWateredSec: null,
    distinctLocalDays: 0,
  };

  it('is all null without records', () => {
    expect(toWateringSummary(base, 0)).toEqual({
      last_watered_at: null,
      last_fertilized_at: null,
      avg_interval_days: null,
    });
  });

  it('reports epoch milliseconds', () => {
    const summary = toWateringSummary(
      { ...base, lastWateredSec: 1700000000, lastFertilizedSec: 1600000000, distinctLocalDays: 1 },
      0,
    );
    expect(summary.last_watered_at).toBe(1700000000000);
    expect(summary.last_fertilized_at).toBe(1600000000000);
  });

  it('has no average below two distinct local days', () => {
    const summary = toWateringSummary(
      { ...base, lastWateredSec: day(5), firstWateredSec: day(5), distinctLocalDays: 1 },
      0,
    );
    expect(summary.avg_interval_days).toBeNull();
  });

  it('divides the calendar span by the number of gaps without rounding', () => {
    const summary = toWateringSummary(
      { ...base, lastWateredSec: day(10), firstWateredSec: day(1), distinctLocalDays: 4 },
      0,
    );
    expect(summary.avg_interval_days).toBe(3);
    const uneven = toWateringSummary(
      { ...base, lastWateredSec: day(9), firstWateredSec: day(1), distinctLocalDays: 4 },
      0,
    );
    expect(uneven.avg_interval_days).toBeCloseTo(8 / 3, 10);
  });

  it('counts the span in local days: an evening record moves to the next day east of UTC', () => {
    const agg = {
      ...base,
      lastWateredSec: day(2, 12),
      firstWateredSec: day(1, 23),
      distinctLocalDays: 2,
    };
    expect(toWateringSummary(agg, 0).avg_interval_days).toBe(1);
    expect(toWateringSummary(agg, 120).avg_interval_days).toBe(0);
  });
});

describe('parseTzOffset', () => {
  it('defaults to UTC and accepts the full range', () => {
    expect(parseTzOffset(undefined)).toBe(0);
    expect(parseTzOffset('-840')).toBe(-840);
    expect(parseTzOffset('840')).toBe(840);
    expect(parseTzOffset('330')).toBe(330);
  });

  it.each(['841', '-841', '1.5', 'abc', '1e2x'])('rejects %s', (raw) => {
    expect(() => parseTzOffset(raw)).toThrow(ValidationError);
  });
});

// ── GetPlantUseCase ───────────────────────────────────────────────────────────

describe('GetPlantUseCase', () => {
  it('returns plant when found', async () => {
    const plant = new Plant(makePlantData());
    const repo = makeMockRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(plant);

    const result = await new GetPlantUseCase(repo).execute(1, null, 0);
    expect(result.id).toBe(1);
    expect(repo.findById).toHaveBeenCalledWith(1, null, 0);
  });

  it('throws NotFoundError when plant does not exist', async () => {
    const repo = makeMockRepo();
    await expect(new GetPlantUseCase(repo).execute(999, null, 0)).rejects.toThrow(NotFoundError);
  });

  it('answers a private plant like a missing one for other viewers', async () => {
    const repo = makeMockRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Plant(makePlantData({ is_public: false })),
    );
    await expect(new GetPlantUseCase(repo).execute(1, 99, 0)).rejects.toThrow(NotFoundError);
    await expect(new GetPlantUseCase(repo).execute(1, 2, 0)).resolves.toBeDefined();
  });
});

// ── CreatePlantUseCase ────────────────────────────────────────────────────────

describe('CreatePlantUseCase', () => {
  const validInput = {
    name: 'Pothos',
    species: 'Epipremnum aureum',
    substrateId: 1,
    isPublic: false,
  };

  it('creates plant and returns the full read-back resource', async () => {
    const repo = makeMockRepo();
    const created = new Plant(makePlantData({ plant_id: 42, plant_name: 'Pothos' }));
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(42);
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    const plant = await new CreatePlantUseCase(repo).execute(validInput, 2, 60);
    expect(plant.id).toBe(42);
    expect(plant.name).toBe('Pothos');
    expect(repo.create).toHaveBeenCalledWith({ ...validInput, userId: 2 });
    expect(repo.findById).toHaveBeenCalledWith(42, 2, 60);
  });

  it('throws InternalError when the created plant cannot be read back', async () => {
    const repo = makeMockRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(42);
    // default findById mock resolves null → read-back fails

    await expect(new CreatePlantUseCase(repo).execute(validInput, 2, 0)).rejects.toThrow(
      InternalError,
    );
  });

  it('throws ValidationError for missing name', async () => {
    const repo = makeMockRepo();
    await expect(
      new CreatePlantUseCase(repo).execute({ species: 'x', substrateId: 1 }, 2, 0),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for a species over 100 characters', async () => {
    const repo = makeMockRepo();
    await expect(
      new CreatePlantUseCase(repo).execute({ name: 'x', species: 'x'.repeat(101) }, 2, 0),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for non-integer substrateId', async () => {
    const repo = makeMockRepo();
    await expect(
      new CreatePlantUseCase(repo).execute({ name: 'x', species: 'x', substrateId: 1.5 }, 2, 0),
    ).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError for a substrate the user may not use, without writing', async () => {
    const repo = makeMockRepo();
    (repo.isSubstrateUsableBy as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(
      new CreatePlantUseCase(repo).execute({ name: 'x', substrateId: 7 }, 2, 0),
    ).rejects.toThrow(NotFoundError);
    expect(repo.isSubstrateUsableBy).toHaveBeenCalledWith(7, 2);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('skips the substrate check when no substrate is given', async () => {
    const repo = makeMockRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(new Plant(makePlantData()));
    await new CreatePlantUseCase(repo).execute({ name: 'x', substrateId: null }, 2, 0);
    expect(repo.isSubstrateUsableBy).not.toHaveBeenCalled();
  });

  it('defaults isPublic to false', async () => {
    const repo = makeMockRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(new Plant(makePlantData()));
    await new CreatePlantUseCase(repo).execute({ name: 'x', species: 'x', substrateId: 1 }, 2, 0);
    const callArg = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.isPublic).toBe(false);
  });
});

// ── UpdatePlantUseCase ────────────────────────────────────────────────────────

describe('UpdatePlantUseCase', () => {
  it('updates plant and returns the full read-back resource', async () => {
    const repo = makeMockRepo();
    const updatedPlant = new Plant(makePlantData({ plant_name: 'New Name' }));
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(updatedPlant);

    const plant = await new UpdatePlantUseCase(repo).execute(1, 2, { name: 'New Name' }, 0);
    expect(repo.update).toHaveBeenCalledWith(1, 2, { name: 'New Name' });
    expect(plant.name).toBe('New Name');
  });

  it('throws NotFoundError when update returns false', async () => {
    const repo = makeMockRepo();
    (repo.update as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(new UpdatePlantUseCase(repo).execute(999, 2, { name: 'x' }, 0)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('throws NotFoundError for a substrate the user may not use, without writing', async () => {
    const repo = makeMockRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(new Plant(makePlantData()));
    (repo.isSubstrateUsableBy as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(new UpdatePlantUseCase(repo).execute(1, 2, { substrateId: 7 }, 0)).rejects.toThrow(
      'Substrate not found',
    );
    expect(repo.isSubstrateUsableBy).toHaveBeenCalledWith(7, 2);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('skips the substrate check when the plant keeps its substrate', async () => {
    const repo = makeMockRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(new Plant(makePlantData()));
    (repo.isSubstrateUsableBy as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await new UpdatePlantUseCase(repo).execute(1, 2, { name: 'Renamed', substrateId: 1 }, 0);
    expect(repo.isSubstrateUsableBy).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith(1, 2, { name: 'Renamed', substrateId: 1 });
  });

  it("throws Plant not found for someone else's plant without checking or writing", async () => {
    const repo = makeMockRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(new Plant(makePlantData()));
    await expect(
      new UpdatePlantUseCase(repo).execute(1, 99, { substrateId: 7 }, 0),
    ).rejects.toThrow('Plant not found');
    expect(repo.isSubstrateUsableBy).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('throws ValidationError when no fields provided', async () => {
    const repo = makeMockRepo();
    await expect(new UpdatePlantUseCase(repo).execute(1, 2, {}, 0)).rejects.toThrow(
      ValidationError,
    );
  });
});

// ── DeletePlantUseCase ────────────────────────────────────────────────────────

describe('DeletePlantUseCase', () => {
  const images = { removeAll: vi.fn().mockResolvedValue(undefined) };
  beforeEach(() => images.removeAll.mockClear());

  it('deletes existing plant and its images', async () => {
    const repo = makeMockRepo();
    await new DeletePlantUseCase(repo, images).execute(1, 2);
    expect(repo.delete).toHaveBeenCalledWith(1, 2);
    expect(images.removeAll).toHaveBeenCalledWith('plant', 1);
  });

  it('throws NotFoundError and keeps the images when delete returns false', async () => {
    const repo = makeMockRepo();
    (repo.delete as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(new DeletePlantUseCase(repo, images).execute(999, 2)).rejects.toThrow(
      NotFoundError,
    );
    expect(images.removeAll).not.toHaveBeenCalled();
  });
});
