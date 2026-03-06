/**
 * tests/unit/modules/plants.test.ts
 *
 * Tests for Plant domain entity and use cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Plant } from '../../../src/modules/plants/domain/Plant';
import type { PlantRepository } from '../../../src/modules/plants/domain/Plant';
import {
  GetAllPlantsUseCase,
  GetPlantUseCase,
  CreatePlantUseCase,
  UpdatePlantUseCase,
  DeletePlantUseCase,
} from '../../../src/modules/plants/application/PlantUseCases';
import { NotFoundError, ValidationError } from '../../../src/core/errors';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const makePlantData = (overrides = {}) => ({
  plant_id: 1,
  plant_user_id: 2,
  plant_name: 'Monstera deliciosa',
  plant_species: 'Monstera deliciosa',
  is_public: true,
  plant_created_at: '2024-01-01',
  image_url: null,
  substrate: { substrate_id: 1, substrate_name: 'Aroid Mix' },
  images: [],
  ...overrides,
});

const makeMockRepo = (): PlantRepository => ({
  findAllPublic: vi.fn().mockResolvedValue([]),
  findAllByUser: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue(1),
  update: vi.fn().mockResolvedValue(true),
  delete: vi.fn().mockResolvedValue(true),
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

// ── GetAllPlantsUseCase ───────────────────────────────────────────────────────

describe('GetAllPlantsUseCase', () => {
  it('merges public and private plants, deduplicating', async () => {
    const plant1 = new Plant(makePlantData({ plant_id: 1 }));
    const plant2 = new Plant(makePlantData({ plant_id: 2, is_public: false }));
    const repo = makeMockRepo();
    (repo.findAllPublic as ReturnType<typeof vi.fn>).mockResolvedValue([plant1]);
    (repo.findAllByUser as ReturnType<typeof vi.fn>).mockResolvedValue([plant1, plant2]);

    const useCase = new GetAllPlantsUseCase(repo);
    const result = await useCase.execute(2);

    expect(result).toHaveLength(2); // plant1 deduped
    expect(result.map((p) => p.id)).toContain(1);
    expect(result.map((p) => p.id)).toContain(2);
  });

  it('returns only public plants when userId is null', async () => {
    const plant1 = new Plant(makePlantData());
    const repo = makeMockRepo();
    (repo.findAllPublic as ReturnType<typeof vi.fn>).mockResolvedValue([plant1]);

    const result = await new GetAllPlantsUseCase(repo).execute(null);
    expect(result).toHaveLength(1);
    expect(repo.findAllByUser).not.toHaveBeenCalled();
  });
});

// ── GetPlantUseCase ───────────────────────────────────────────────────────────

describe('GetPlantUseCase', () => {
  it('returns plant when found', async () => {
    const plant = new Plant(makePlantData());
    const repo = makeMockRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(plant);

    const result = await new GetPlantUseCase(repo).execute(1);
    expect(result.id).toBe(1);
  });

  it('throws NotFoundError when plant does not exist', async () => {
    const repo = makeMockRepo();
    await expect(new GetPlantUseCase(repo).execute(999)).rejects.toThrow(NotFoundError);
  });
});

// ── CreatePlantUseCase ────────────────────────────────────────────────────────

describe('CreatePlantUseCase', () => {
  const validInput = { name: 'Pothos', species: 'Epipremnum aureum', substrateId: 1, isPublic: false };

  it('creates plant with valid input', async () => {
    const repo = makeMockRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(42);

    const id = await new CreatePlantUseCase(repo).execute(validInput, 2);
    expect(id).toBe(42);
    expect(repo.create).toHaveBeenCalledWith({ ...validInput, userId: 2 });
  });

  it('throws ValidationError for missing name', async () => {
    const repo = makeMockRepo();
    await expect(
      new CreatePlantUseCase(repo).execute({ species: 'x', substrateId: 1 }, 2),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for missing species', async () => {
    const repo = makeMockRepo();
    await expect(
      new CreatePlantUseCase(repo).execute({ name: 'x', substrateId: 1 }, 2),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for non-integer substrateId', async () => {
    const repo = makeMockRepo();
    await expect(
      new CreatePlantUseCase(repo).execute({ name: 'x', species: 'x', substrateId: 1.5 }, 2),
    ).rejects.toThrow(ValidationError);
  });

  it('defaults isPublic to false', async () => {
    const repo = makeMockRepo();
    await new CreatePlantUseCase(repo).execute({ name: 'x', species: 'x', substrateId: 1 }, 2);
    const callArg = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.isPublic).toBe(false);
  });
});

// ── UpdatePlantUseCase ────────────────────────────────────────────────────────

describe('UpdatePlantUseCase', () => {
  it('updates plant with valid partial input', async () => {
    const repo = makeMockRepo();
    await new UpdatePlantUseCase(repo).execute(1, 2, { name: 'New Name' });
    expect(repo.update).toHaveBeenCalledWith(1, 2, { name: 'New Name' });
  });

  it('throws NotFoundError when update returns false', async () => {
    const repo = makeMockRepo();
    (repo.update as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(new UpdatePlantUseCase(repo).execute(999, 2, { name: 'x' })).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError when no fields provided', async () => {
    const repo = makeMockRepo();
    await expect(new UpdatePlantUseCase(repo).execute(1, 2, {})).rejects.toThrow(ValidationError);
  });
});

// ── DeletePlantUseCase ────────────────────────────────────────────────────────

describe('DeletePlantUseCase', () => {
  it('deletes existing plant', async () => {
    const repo = makeMockRepo();
    await new DeletePlantUseCase(repo).execute(1, 2);
    expect(repo.delete).toHaveBeenCalledWith(1, 2);
  });

  it('throws NotFoundError when delete returns false', async () => {
    const repo = makeMockRepo();
    (repo.delete as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(new DeletePlantUseCase(repo).execute(999, 2)).rejects.toThrow(NotFoundError);
  });
});
