/**
 * tests/unit/modules/substrate.test.ts
 *
 * Tests for the substrate application layer (SubstrateUseCases).
 * Covers list scopes and parameters, the ownership guard (404 for missing
 * and foreign substrates), components parsing (single object vs array),
 * and the create/update orchestration.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import type {
  SubstrateRepository,
  SubstrateData,
} from '../../../src/modules/substrate/domain/Substrate';
import {
  ListSubstratesUseCase,
  GetSubstrateUseCase,
  CreateSubstrateUseCase,
  UpdateSubstrateUseCase,
  AddSubstrateComponentsUseCase,
  ReplaceSubstrateComponentsUseCase,
  DeleteSubstrateUseCase,
} from '../../../src/modules/substrate/application/SubstrateUseCases';
import { NotFoundError, ValidationError, InternalError } from '../../../src/core/errors';

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
  listMine: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  listPublic: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  findById: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue(1),
  update: vi.fn().mockResolvedValue(true),
  addComponents: vi.fn().mockResolvedValue(undefined),
  upsertComponents: vi.fn().mockResolvedValue(undefined),
  replaceComponents: vi.fn().mockResolvedValue(true),
  deleteComponents: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(true),
});

const asMock = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;

// ── ListSubstratesUseCase ─────────────────────────────────────────────────────

describe('ListSubstratesUseCase', () => {
  const user = { id: 2, isGuest: false };
  const guest = { id: 9, isGuest: true };

  it('lists the caller own substrates by default with the default sort and limit', async () => {
    const repo = makeMockRepo();
    await new ListSubstratesUseCase(repo).execute({}, user);
    expect(repo.listMine).toHaveBeenCalledWith(2, {
      limit: 30,
      cursor: null,
      sort: 'created',
      q: null,
      componentId: null,
    });
    expect(repo.listPublic).not.toHaveBeenCalled();
  });

  it('passes scope, q, sort, limit and the used-in component through', async () => {
    const repo = makeMockRepo();
    await new ListSubstratesUseCase(repo).execute(
      { scope: 'public', q: ' coir ', sort: 'name', limit: '5', component_id: '7' },
      user,
    );
    expect(repo.listPublic).toHaveBeenCalledWith({
      limit: 5,
      cursor: null,
      sort: 'name',
      q: 'coir',
      componentId: 7,
    });
    expect(repo.listMine).not.toHaveBeenCalled();
  });

  it('answers an empty page for a guest asking for mine and defaults guests to public', async () => {
    const repo = makeMockRepo();
    const useCase = new ListSubstratesUseCase(repo);
    expect(await useCase.execute({ scope: 'mine' }, guest)).toEqual({
      items: [],
      nextCursor: null,
      total: 0,
    });
    await useCase.execute({}, guest);
    expect(repo.listMine).not.toHaveBeenCalled();
    expect(repo.listPublic).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid scope, sort, cursor and component id with ValidationError', async () => {
    const useCase = new ListSubstratesUseCase(makeMockRepo());
    for (const query of [
      { scope: 'all' },
      { sort: 'oldest' },
      { cursor: 'garbage' },
      { component_id: 'abc' },
      { component_id: '0' },
      { q: 'x'.repeat(101) },
    ]) {
      await expect(useCase.execute(query, user)).rejects.toThrow(ValidationError);
    }
  });
});

// ── GetSubstrateUseCase ───────────────────────────────────────────────────────

describe('GetSubstrateUseCase', () => {
  it('throws NotFoundError for a missing substrate', async () => {
    const repo = makeMockRepo();
    await expect(new GetSubstrateUseCase(repo).execute(999, null)).rejects.toThrow(NotFoundError);
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

  it('creates the substrate and its mix in one repository call', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeSubstrate({ substrate_id: 5 }));
    asMock(repo.create).mockResolvedValue(5);

    await new CreateSubstrateUseCase(repo).execute(
      { name: 'Mix', components: { 0: { componentId: 3, parts: '2' } } },
      2,
    );

    expect(repo.create).toHaveBeenCalledWith('Mix', 2, false, [{ componentId: 3, parts: 2 }]);
    expect(repo.addComponents).not.toHaveBeenCalled();
  });

  it('rejects duplicate components and non-positive parts on create', async () => {
    const repo = makeMockRepo();
    const useCase = new CreateSubstrateUseCase(repo);
    await expect(
      useCase.execute(
        {
          name: 'x',
          components: [
            { componentId: 3, parts: 1 },
            { componentId: 3, parts: 2 },
          ],
        },
        2,
      ),
    ).rejects.toThrow(ValidationError);
    await expect(
      useCase.execute({ name: 'x', components: [{ componentId: 3, parts: 0 }] }, 2),
    ).rejects.toThrow(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('throws ValidationError for a missing name', async () => {
    const repo = makeMockRepo();
    await expect(new CreateSubstrateUseCase(repo).execute({}, 2)).rejects.toThrow(ValidationError);
  });

  it('throws InternalError when the created substrate cannot be read back', async () => {
    const repo = makeMockRepo();
    await expect(new CreateSubstrateUseCase(repo).execute({ name: 'x' }, 2)).rejects.toThrow(
      InternalError,
    );
  });
});

// ── UpdateSubstrateUseCase ────────────────────────────────────────────────────

describe('UpdateSubstrateUseCase', () => {
  it('throws NotFoundError when the repository reports nothing was updated', async () => {
    const repo = makeMockRepo();
    asMock(repo.update).mockResolvedValue(false);
    await expect(new UpdateSubstrateUseCase(repo).execute(999, 2, { name: 'x' })).rejects.toThrow(
      NotFoundError,
    );
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('throws ValidationError when no fields are provided', async () => {
    const repo = makeMockRepo();
    await expect(new UpdateSubstrateUseCase(repo).execute(1, 2, {})).rejects.toThrow(
      ValidationError,
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('rejects components together with removedComponents', async () => {
    const repo = makeMockRepo();
    await expect(
      new UpdateSubstrateUseCase(repo).execute(1, 2, { components: [], removedComponents: [3] }),
    ).rejects.toThrow(ValidationError);
  });

  it('updates fields and the replacement mix in one repository call', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeSubstrate());

    await new UpdateSubstrateUseCase(repo).execute(1, 2, {
      name: 'Renamed',
      components: [{ componentId: 3, parts: '1.5' }],
    });

    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledWith(1, 2, {
      name: 'Renamed',
      components: [{ componentId: 3, parts: 1.5 }],
    });
    expect(repo.replaceComponents).not.toHaveBeenCalled();
  });

  it('accepts an empty components list as a clear and rejects a null one', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeSubstrate());
    const useCase = new UpdateSubstrateUseCase(repo);
    await useCase.execute(1, 2, { components: [] });
    expect(repo.update).toHaveBeenCalledWith(1, 2, { components: [] });
    await expect(useCase.execute(1, 2, { components: null })).rejects.toThrow(ValidationError);
  });

  it.each([0, -1])('rejects parts %s with ValidationError', async (parts) => {
    const repo = makeMockRepo();
    await expect(
      new UpdateSubstrateUseCase(repo).execute(1, 2, { components: [{ componentId: 3, parts }] }),
    ).rejects.toThrow(ValidationError);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('removes components without a field update when only removedComponents is set', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeSubstrate());

    await new UpdateSubstrateUseCase(repo).execute(1, 2, { removedComponents: [3, 4] });

    expect(repo.update).toHaveBeenCalledWith(1, 2, { removedComponents: [3, 4] });
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

  it('answers a foreign substrate with NotFoundError before parsing', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeSubstrate({ substrate_user_id: 99 }));
    await expect(
      new AddSubstrateComponentsUseCase(repo).execute(1, 2, { components: [] }),
    ).rejects.toThrow(NotFoundError);
    expect(repo.addComponents).not.toHaveBeenCalled();
  });

  it.each([0, -1])('rejects parts %s with ValidationError', async (parts) => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeSubstrate());
    await expect(
      new AddSubstrateComponentsUseCase(repo).execute(1, 2, {
        components: [{ componentId: 3, parts }],
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('ReplaceSubstrateComponentsUseCase', () => {
  it('replaces with the parsed list and returns the read-back substrate', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeSubstrate());

    const result = await new ReplaceSubstrateComponentsUseCase(repo).execute(1, 2, {
      components: [{ componentId: 3, parts: 1 }],
    });

    expect(repo.replaceComponents).toHaveBeenCalledWith(1, 2, [{ componentId: 3, parts: 1 }]);
    expect(result.substrate_id).toBe(1);
  });

  it('accepts an empty list to clear the mix', async () => {
    const repo = makeMockRepo();
    asMock(repo.findById).mockResolvedValue(makeSubstrate());
    await new ReplaceSubstrateComponentsUseCase(repo).execute(1, 2, { components: [] });
    expect(repo.replaceComponents).toHaveBeenCalledWith(1, 2, []);
  });

  it.each([0, -1])('rejects parts %s without touching the repository', async (parts) => {
    const repo = makeMockRepo();
    await expect(
      new ReplaceSubstrateComponentsUseCase(repo).execute(1, 2, {
        components: [{ componentId: 3, parts }],
      }),
    ).rejects.toThrow(ValidationError);
    expect(repo.replaceComponents).not.toHaveBeenCalled();
  });

  it('rejects a missing components field and duplicate ids without touching the repository', async () => {
    const repo = makeMockRepo();
    const useCase = new ReplaceSubstrateComponentsUseCase(repo);
    await expect(useCase.execute(1, 2, {})).rejects.toThrow(ValidationError);
    await expect(
      useCase.execute(1, 2, {
        components: [
          { componentId: 3, parts: 1 },
          { componentId: 3, parts: 2 },
        ],
      }),
    ).rejects.toThrow(ValidationError);
    expect(repo.replaceComponents).not.toHaveBeenCalled();
  });

  it('answers NotFoundError when the repository reports the substrate is not owned', async () => {
    const repo = makeMockRepo();
    asMock(repo.replaceComponents).mockResolvedValue(false);
    await expect(
      new ReplaceSubstrateComponentsUseCase(repo).execute(1, 9, { components: [] }),
    ).rejects.toThrow(NotFoundError);
    expect(repo.findById).not.toHaveBeenCalled();
  });
});

describe('SQLiteSubstrateRepository.replaceComponents', () => {
  type Repo =
    import('../../../src/modules/substrate/infrastructure/SQLiteSubstrateRepository').SQLiteSubstrateRepository;
  let repo: Repo;
  let db: typeof import('../../../src/core/database/db');
  let ownerId: number;
  let otherId: number;
  let compIds: number[];

  beforeAll(async () => {
    process.env.DB_PATH = ':memory:';
    db = await import('../../../src/core/database/db');
    await db.initDatabase();
    const { SQLiteSubstrateRepository } =
      await import('../../../src/modules/substrate/infrastructure/SQLiteSubstrateRepository');
    repo = new SQLiteSubstrateRepository();
    const { SQLiteUserRepository } =
      await import('../../../src/modules/auth/infrastructure/SQLiteUserRepository');
    const { SQLiteComponentRepository } =
      await import('../../../src/modules/components/infrastructure/SQLiteComponentRepository');
    const users = new SQLiteUserRepository();
    const components = new SQLiteComponentRepository();
    ownerId = (await users.create('replace-owner', 'hash')).id;
    otherId = (await users.create('replace-other', 'hash')).id;
    compIds = [];
    for (const name of ['R-A', 'R-B', 'R-C']) compIds.push(await components.create(name, 1));
  });

  afterAll(async () => {
    await db.closeDb();
  });

  const mix = async (id: number) =>
    Object.fromEntries(
      ((await repo.findById(id))?.components ?? []).map((c) => [c.component_id, c.component_parts]),
    );

  it('deletes rows missing from the list, updates parts and inserts new rows', async () => {
    const id = await repo.create('Mix', ownerId, false);
    await repo.addComponents(id, [
      { componentId: compIds[0], parts: 1 },
      { componentId: compIds[1], parts: 1 },
    ]);

    expect(
      await repo.replaceComponents(id, ownerId, [
        { componentId: compIds[1], parts: 3 },
        { componentId: compIds[2], parts: 2 },
      ]),
    ).toBe(true);
    expect(await mix(id)).toEqual({ [compIds[1]]: 3, [compIds[2]]: 2 });
  });

  it('deletes every row for an empty list', async () => {
    const id = await repo.create('Mix', ownerId, false);
    await repo.addComponents(id, [{ componentId: compIds[0], parts: 1 }]);
    expect(await repo.replaceComponents(id, ownerId, [])).toBe(true);
    expect(await mix(id)).toEqual({});
  });

  it('changes nothing and returns false for a substrate owned by someone else', async () => {
    const id = await repo.create('Mix', ownerId, false);
    await repo.addComponents(id, [{ componentId: compIds[0], parts: 1 }]);
    expect(await repo.replaceComponents(id, otherId, [])).toBe(false);
    expect(await mix(id)).toEqual({ [compIds[0]]: 1 });
  });

  it('leaves other substrates untouched', async () => {
    const a = await repo.create('A', ownerId, false);
    const b = await repo.create('B', ownerId, false);
    await repo.addComponents(a, [{ componentId: compIds[0], parts: 1 }]);
    await repo.addComponents(b, [{ componentId: compIds[0], parts: 5 }]);
    await repo.replaceComponents(a, ownerId, []);
    expect(await mix(b)).toEqual({ [compIds[0]]: 5 });
  });
});

// ── DeleteSubstrateUseCase ────────────────────────────────────────────────────

describe('DeleteSubstrateUseCase', () => {
  const images = { removeAll: vi.fn().mockResolvedValue(undefined) };
  beforeEach(() => images.removeAll.mockClear());

  it('answers missing and foreign substrates uniformly with NotFoundError', async () => {
    const repo = makeMockRepo();
    asMock(repo.delete).mockResolvedValue(false);
    await expect(new DeleteSubstrateUseCase(repo, images).execute(1, 2)).rejects.toThrow(
      NotFoundError,
    );
    expect(images.removeAll).not.toHaveBeenCalled();
  });

  it('removes the images of a deleted substrate', async () => {
    const repo = makeMockRepo();
    asMock(repo.delete).mockResolvedValue(true);
    await new DeleteSubstrateUseCase(repo, images).execute(3, 2);
    expect(images.removeAll).toHaveBeenCalledWith('substrate', 3);
  });
});
