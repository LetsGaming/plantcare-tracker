/**
 * tests/unit/modules/components.test.ts
 *
 * Tests for the components application layer (ComponentUseCases).
 */

import { describe, it, expect, vi } from 'vitest';
import type { ComponentRepository } from '../../../src/modules/components/domain/Component';
import {
  GetAllComponentsUseCase,
  GetFinenessLevelsUseCase,
  GetComponentUseCase,
  CreateComponentUseCase,
  UpdateComponentUseCase,
  DeleteComponentUseCase,
} from '../../../src/modules/components/application/ComponentUseCases';
import {
  NotFoundError,
  ValidationError,
  InternalError,
} from '../../../src/core/errors';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const makeComponent = (overrides = {}) => ({
  component_id: 3,
  component_name: 'Perlite',
  fineness_id: 2,
  fineness: 'medium',
  ...overrides,
});

const makeMockRepo = (): ComponentRepository => ({
  findAll: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
  findFinenessLevels: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue(3),
  update: vi.fn().mockResolvedValue(true),
  delete: vi.fn().mockResolvedValue(true),
});

const asMock = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;

// ── Read use cases ────────────────────────────────────────────────────────────

describe('GetAllComponentsUseCase', () => {
  it('returns an empty catalogue without throwing', async () => {
    const repo = makeMockRepo();
    await expect(new GetAllComponentsUseCase(repo).execute()).resolves.toEqual([]);
  });
});

describe('GetFinenessLevelsUseCase', () => {
  it('returns an empty list without throwing', async () => {
    const repo = makeMockRepo();
    await expect(new GetFinenessLevelsUseCase(repo).execute()).resolves.toEqual([]);
  });
});

describe('GetComponentUseCase', () => {
  it('throws NotFoundError for a missing component', async () => {
    const repo = makeMockRepo();
    await expect(new GetComponentUseCase(repo).execute(999)).rejects.toThrow(NotFoundError);
  });
});

// ── CreateComponentUseCase ────────────────────────────────────────────────────

describe('CreateComponentUseCase', () => {
  it('creates and returns the full read-back resource, coercing fineness', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeComponent());

    const component = await new CreateComponentUseCase(repo).execute({
      name: 'Perlite',
      fineness: '2', // form-encoded clients send strings
    });

    expect(component.component_id).toBe(3);
    expect(repo.create).toHaveBeenCalledWith('Perlite', 2);
  });

  it('throws ValidationError for a missing name', async () => {
    const repo = makeMockRepo();
    await expect(
      new CreateComponentUseCase(repo).execute({ fineness: 1 }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws InternalError when the created component cannot be read back', async () => {
    const repo = makeMockRepo();
    await expect(
      new CreateComponentUseCase(repo).execute({ name: 'x', fineness: 1 }),
    ).rejects.toThrow(InternalError);
  });
});

// ── UpdateComponentUseCase ────────────────────────────────────────────────────

describe('UpdateComponentUseCase', () => {
  it('updates and returns the full read-back resource', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeComponent({ component_name: 'Pumice' }));

    const component = await new UpdateComponentUseCase(repo).execute(3, { name: 'Pumice' });
    expect(repo.update).toHaveBeenCalledWith(3, { name: 'Pumice', fineness: undefined });
    expect(component.component_name).toBe('Pumice');
  });

  it('throws ValidationError when no fields are provided', async () => {
    const repo = makeMockRepo();
    await expect(new UpdateComponentUseCase(repo).execute(3, {})).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError when the update matched nothing', async () => {
    const repo = makeMockRepo();
    asMock(repo.update).mockResolvedValue(false);
    await expect(
      new UpdateComponentUseCase(repo).execute(999, { name: 'x' }),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── DeleteComponentUseCase ────────────────────────────────────────────────────

describe('DeleteComponentUseCase', () => {
  it('throws NotFoundError when nothing was deleted', async () => {
    const repo = makeMockRepo();
    asMock(repo.delete).mockResolvedValue(false);
    await expect(new DeleteComponentUseCase(repo).execute(999)).rejects.toThrow(NotFoundError);
  });
});
