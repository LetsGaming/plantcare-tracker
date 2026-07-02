/**
 * tests/unit/modules/substrate.test.ts
 *
 * Tests for the substrate application layer (SubstrateUseCases).
 * Covers the merge/dedupe read rule, the ownership guard (404 for
 * missing, 403 for foreign), components parsing (single object vs
 * array), and the update orchestration.
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  SubstrateRepository,
  SubstrateData,
} from '../../../src/modules/substrate/domain/Substrate';
import {
  GetAllSubstratesUseCase,
  GetSubstrateUseCase,
  CreateSubstrateUseCase,
  UpdateSubstrateUseCase,
  AddSubstrateComponentsUseCase,
  UpsertSubstrateComponentsUseCase,
  DeleteSubstrateUseCase,
} from '../../../src/modules/substrate/application/SubstrateUseCases';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  InternalError,
} from '../../../src/core/errors';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const makeSubstrate = (overrides: Partial<SubstrateData> = {}): SubstrateData =>
  ({
    substrate_id: 1,
    substrate_name: 'Aroid Mix',
    substrate_user_id: 2,
    is_public: 1,
    components: [],
    ...overrides,
  }) as SubstrateData;

const makeMockRepo = (): SubstrateRepository => ({
  findAllPublic: vi.fn().mockResolvedValue([]),
  findAllByUser: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue(1),
  update: vi.fn().mockResolvedValue(true),
  addComponents: vi.fn().mockResolvedValue(undefined),
  upsertComponents: vi.fn().mockResolvedValue(undefined),
  deleteComponents: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(true),
});

const asMock = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;

// ── GetAllSubstratesUseCase ───────────────────────────────────────────────────

describe('GetAllSubstratesUseCase', () => {
  it('merges public and own substrates, deduplicating by substrate_id', async () => {
    const repo = makeMockRepo();
    const shared = makeSubstrate({ substrate_id: 1 });
    const own = makeSubstrate({ substrate_id: 2, is_public: 0 });
    asMock(repo.findAllPublic).mockResolvedValue([shared]);
    asMock(repo.findAllByUser).mockResolvedValue([shared, own]);

    const result = await new GetAllSubstratesUseCase(repo).execute(2);
    expect(result.map((s) => s.substrate_id)).toEqual([1, 2]);
  });

  it('skips the user query for anonymous callers', async () => {
    const repo = makeMockRepo();
    asMock(repo.findAllPublic).mockResolvedValue([makeSubstrate()]);

    const result = await new GetAllSubstratesUseCase(repo).execute(null);
    expect(result).toHaveLength(1);
    expect(repo.findAllByUser).not.toHaveBeenCalled();
  });
});

// ── GetSubstrateUseCase ───────────────────────────────────────────────────────

describe('GetSubstrateUseCase', () => {
  it('throws NotFoundError for a missing substrate', async () => {
    const repo = makeMockRepo();
    await expect(new GetSubstrateUseCase(repo).execute(999)).rejects.toThrow(NotFoundError);
  });
});

// ── CreateSubstrateUseCase ────────────────────────────────────────────────────

describe('CreateSubstrateUseCase', () => {
  it('creates and returns the full read-back resource', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeSubstrate({ substrate_id: 5 }));
    asMock(repo.create).mockResolvedValue(5);

    const substrate = await new CreateSubstrateUseCase(repo).execute(
      { name: 'Cactus Mix', isPublic: true },
      2,
    );

    expect(substrate.substrate_id).toBe(5);
    expect(repo.create).toHaveBeenCalledWith('Cactus Mix', 2, true);
  });

  it('throws ValidationError for a missing name', async () => {
    const repo = makeMockRepo();
    await expect(new CreateSubstrateUseCase(repo).execute({}, 2)).rejects.toThrow(ValidationError);
  });

  it('throws InternalError when the created substrate cannot be read back', async () => {
    const repo = makeMockRepo();
    await expect(
      new CreateSubstrateUseCase(repo).execute({ name: 'x' }, 2),
    ).rejects.toThrow(InternalError);
  });
});

// ── UpdateSubstrateUseCase ────────────────────────────────────────────────────

describe('UpdateSubstrateUseCase', () => {
  it('throws NotFoundError when the substrate does not exist', async () => {
    const repo = makeMockRepo();
    await expect(
      new UpdateSubstrateUseCase(repo).execute(999, 2, { name: 'x' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ForbiddenError when the substrate belongs to someone else', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeSubstrate({ substrate_user_id: 99 }));
    await expect(
      new UpdateSubstrateUseCase(repo).execute(1, 2, { name: 'x' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ValidationError when no fields are provided', async () => {
    const repo = makeMockRepo();
    await expect(new UpdateSubstrateUseCase(repo).execute(1, 2, {})).rejects.toThrow(ValidationError);
  });

  it('updates metadata without touching components when none are removed', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeSubstrate());

    await new UpdateSubstrateUseCase(repo).execute(1, 2, { name: 'Renamed' });

    expect(repo.update).toHaveBeenCalledWith(1, 2, { name: 'Renamed', isPublic: undefined });
    expect(repo.deleteComponents).not.toHaveBeenCalled();
  });

  it('removes components without a metadata update when only removedComponents is set', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeSubstrate());

    await new UpdateSubstrateUseCase(repo).execute(1, 2, { removedComponents: [3, 4] });

    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.deleteComponents).toHaveBeenCalledWith(1, [3, 4]);
  });
});

// ── Add/Upsert components ─────────────────────────────────────────────────────

describe('AddSubstrateComponentsUseCase', () => {
  it('accepts an index-keyed components object (ensureArray normalisation)', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeSubstrate());

    // Some form serializers send arrays as index-keyed objects —
    // ensureArray turns { 0: {...} } into [{...}] via Object.values.
    await new AddSubstrateComponentsUseCase(repo).execute(1, 2, {
      components: { 0: { componentId: 3, parts: '2' } },
    });

    expect(repo.addComponents).toHaveBeenCalledWith(1, [{ componentId: 3, parts: 2 }]);
  });

  it('throws ValidationError for an empty components payload', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeSubstrate());
    await expect(
      new AddSubstrateComponentsUseCase(repo).execute(1, 2, { components: [] }),
    ).rejects.toThrow(ValidationError);
  });

  it('enforces ownership before parsing', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeSubstrate({ substrate_user_id: 99 }));
    await expect(
      new AddSubstrateComponentsUseCase(repo).execute(1, 2, { components: [] }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe('UpsertSubstrateComponentsUseCase', () => {
  it('upserts parsed components and returns the read-back substrate', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeSubstrate());

    const result = await new UpsertSubstrateComponentsUseCase(repo).execute(1, 2, {
      components: [{ componentId: 3, parts: 1 }],
    });

    expect(repo.upsertComponents).toHaveBeenCalledWith(1, [{ componentId: 3, parts: 1 }]);
    expect(result.substrate_id).toBe(1);
  });
});

// ── DeleteSubstrateUseCase ────────────────────────────────────────────────────

describe('DeleteSubstrateUseCase', () => {
  it('answers missing and foreign substrates uniformly with NotFoundError', async () => {
    const repo = makeMockRepo();
    asMock(repo.delete).mockResolvedValue(false);
    await expect(new DeleteSubstrateUseCase(repo).execute(1, 2)).rejects.toThrow(NotFoundError);
  });
});
