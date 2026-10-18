/**
 * tests/unit/modules/components.test.ts
 *
 * Tests for the components application layer (ComponentUseCases) and the
 * SQLite repository over an in-memory database.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { decodeCursor } from '../../../src/core/pagination';
import type { Database } from '../../../src/core/database/schema';
import type { ComponentRepository } from '../../../src/modules/components/domain/Component';
import { SQLiteComponentRepository } from '../../../src/modules/components/infrastructure/SQLiteComponentRepository';
import {
  FINENESS_LEVELS_TTL_MS,
  ListComponentsUseCase,
  GetFinenessLevelsUseCase,
  GetComponentUseCase,
  CreateComponentUseCase,
  UpdateComponentUseCase,
  DeleteComponentUseCase,
} from '../../../src/modules/components/application/ComponentUseCases';
import { NotFoundError, ValidationError, InternalError } from '../../../src/core/errors';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../src/core/database/db', async (importActual) => ({
  ...(await importActual<typeof import('../../../src/core/database/db')>()),
  getKysely: () => holder.db,
}));

// ── Test fixtures ─────────────────────────────────────────────────────────────

const makeComponent = (overrides = {}) => ({
  id: 3,
  name: 'Perlite',
  fineness_id: 2,
  fineness_name: 'medium',
  cover: null,
  images: [],
  ...overrides,
});

const makeMockRepo = (): ComponentRepository => ({
  findPage: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  count: vi.fn().mockResolvedValue(0),
  findById: vi.fn().mockResolvedValue(null),
  findFinenessLevels: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue(3),
  update: vi.fn().mockResolvedValue(true),
  delete: vi.fn().mockResolvedValue(true),
});

const asMock = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;

// ── Read use cases ────────────────────────────────────────────────────────────

describe('ListComponentsUseCase', () => {
  it('counts on the first page only', async () => {
    const repo = makeMockRepo();
    asMock(repo.count).mockResolvedValue(42);
    const useCase = new ListComponentsUseCase(repo);

    const first = await useCase.execute({ limit: 30, cursor: null, q: 'per' }, 'name');
    expect(first.total).toBe(42);
    expect(repo.count).toHaveBeenCalledWith('per');

    asMock(repo.count).mockClear();
    const next = await useCase.execute({ limit: 30, cursor: { v: 'a', id: 1 }, q: null }, 'name');
    expect(next.total).toBeUndefined();
    expect(repo.count).not.toHaveBeenCalled();
  });
});

describe('GetFinenessLevelsUseCase', () => {
  const levels = [{ fineness_id: 1, fineness_name: 'coarse' }];

  it('reads the database once across ten requests', async () => {
    const repo = makeMockRepo();
    asMock(repo.findFinenessLevels).mockResolvedValue(levels);
    const useCase = new GetFinenessLevelsUseCase(repo);
    for (let i = 0; i < 10; i += 1) await expect(useCase.execute()).resolves.toEqual(levels);
    expect(repo.findFinenessLevels).toHaveBeenCalledTimes(1);
  });

  it('reads again after the entry expired', async () => {
    const repo = makeMockRepo();
    asMock(repo.findFinenessLevels).mockResolvedValue(levels);
    let now = 1_000;
    const useCase = new GetFinenessLevelsUseCase(repo, () => now);
    await useCase.execute();
    now += FINENESS_LEVELS_TTL_MS - 1;
    await useCase.execute();
    expect(repo.findFinenessLevels).toHaveBeenCalledTimes(1);
    now += 1;
    await useCase.execute();
    expect(repo.findFinenessLevels).toHaveBeenCalledTimes(2);
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

    expect(component.id).toBe(3);
    expect(repo.create).toHaveBeenCalledWith('Perlite', 2);
  });

  it('throws ValidationError for a missing name', async () => {
    const repo = makeMockRepo();
    await expect(new CreateComponentUseCase(repo).execute({ fineness: 1 })).rejects.toThrow(
      ValidationError,
    );
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
    asMock(repo.findById).mockResolvedValue(makeComponent({ name: 'Pumice' }));

    const component = await new UpdateComponentUseCase(repo).execute(3, { name: 'Pumice' });
    expect(repo.update).toHaveBeenCalledWith(3, { name: 'Pumice', fineness: undefined });
    expect(component.name).toBe('Pumice');
  });

  it('throws ValidationError when no fields are provided', async () => {
    const repo = makeMockRepo();
    await expect(new UpdateComponentUseCase(repo).execute(3, {})).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError when the update matched nothing', async () => {
    const repo = makeMockRepo();
    asMock(repo.update).mockResolvedValue(false);
    await expect(new UpdateComponentUseCase(repo).execute(999, { name: 'x' })).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ── DeleteComponentUseCase ────────────────────────────────────────────────────

describe('DeleteComponentUseCase', () => {
  const images = { removeAll: vi.fn().mockResolvedValue(undefined) };
  beforeEach(() => images.removeAll.mockClear());

  it('throws NotFoundError when nothing was deleted', async () => {
    const repo = makeMockRepo();
    asMock(repo.delete).mockResolvedValue(false);
    await expect(new DeleteComponentUseCase(repo, images).execute(999)).rejects.toThrow(
      NotFoundError,
    );
    expect(images.removeAll).not.toHaveBeenCalled();
  });

  it('removes the images of a deleted component', async () => {
    const repo = makeMockRepo();
    asMock(repo.delete).mockResolvedValue(true);
    await new DeleteComponentUseCase(repo, images).execute(7);
    expect(images.removeAll).toHaveBeenCalledWith('component', 7);
  });
});

// ── SQLiteComponentRepository (real SQLite, in memory) ────────────────────────

describe('SQLiteComponentRepository', () => {
  const sqlite = new BetterSqlite3(':memory:');
  const repo = new SQLiteComponentRepository();
  const executed: { sql: string; params: unknown[] }[] = [];

  const add = (name: string, fineness = 1): number =>
    Number(
      sqlite.prepare('INSERT INTO components (name, fineness_id) VALUES (?, ?)').run(name, fineness)
        .lastInsertRowid,
    );
  const addImage = (componentId: number, file: string, uploadDate: number, variants = 0): number =>
    Number(
      sqlite
        .prepare(
          "INSERT INTO images (image_url, entity_type, entity_id, upload_date, variants) VALUES (?, 'component', ?, ?, ?)",
        )
        .run(file, componentId, uploadDate, variants).lastInsertRowid,
    );
  const walk = async (limit: number, q: string | null = null): Promise<string[]> => {
    const names: string[] = [];
    let cursor: { v: string | number; id: string | number } | null = null;
    for (let guard = 0; guard < 100; guard += 1) {
      const page = await repo.findPage({ limit, cursor, q }, 'name');
      names.push(...page.items.map((i) => i.name));
      if (!page.nextCursor) return names;
      const decoded = decodeCursor(page.nextCursor, 'name', {
        valueType: 'string',
        idType: 'number',
      });
      cursor = { v: decoded.v, id: decoded.id };
    }
    throw new Error('walk did not terminate');
  };

  beforeAll(async () => {
    const actual = await vi.importActual<typeof import('../../../src/core/database/db')>(
      '../../../src/core/database/db',
    );
    const db = new Kysely<Database>({
      dialect: new SqliteDialect({ database: sqlite }),
      log: (event) => {
        if (event.level === 'query') {
          executed.push({ sql: event.query.sql, params: [...event.query.parameters] });
        }
      },
    });
    await actual.applyMigrations(db);
    holder.db = db;
  });
  afterAll(() => sqlite.close());
  beforeEach(() => {
    sqlite.exec('DELETE FROM images; DELETE FROM components');
  });

  it('walks the whole catalogue once and orders names that differ only by case by id', async () => {
    for (const name of ['Sand', 'bark', 'Perlite', 'BARK', 'Coir', 'Bark', 'pumice']) add(name);
    const names = await walk(2);
    expect(names.map((n) => n.toLowerCase())).toEqual([
      'bark',
      'bark',
      'bark',
      'coir',
      'perlite',
      'pumice',
      'sand',
    ]);
    expect(names.slice(0, 3)).toEqual(['bark', 'BARK', 'Bark']);
    expect(await walk(100)).toEqual(names);
  });

  it('matches q case-insensitively', async () => {
    add('Perlite');
    add('Pumice');
    add('Coco peat');
    expect(await walk(10, 'PER')).toEqual(['Perlite']);
    expect(await walk(10, 'u')).toEqual(['Pumice']);
  });

  it('treats % and _ in q literally', async () => {
    add('100% bark');
    add('Bark');
    add('Bar_k');
    add('Barxk');
    expect(await walk(10, '%')).toEqual(['100% bark']);
    expect(await walk(10, 'r_k')).toEqual(['Bar_k']);
    expect(await repo.count('%')).toBe(1);
    expect(await repo.count(null)).toBe(4);
  });

  it('returns items without an images array and the newest image as cover', async () => {
    const withImages = add('Bark', 2);
    const plain = add('Coir');
    addImage(withImages, '/uploads/component/old.webp', 100, 1);
    const sameDateFirst = addImage(withImages, '/uploads/component/new.webp', 200, 1);
    const sameDateLast = addImage(withImages, '/uploads/component/tie.jpg', 200);

    const { items } = await repo.findPage({ limit: 10, cursor: null, q: null }, 'name');
    const bark = items.find((i) => i.id === withImages)!;
    expect(Object.keys(bark).sort()).toEqual([
      'cover',
      'fineness_id',
      'fineness_name',
      'id',
      'name',
    ]);
    expect(bark.fineness_name).toBe('medium');
    expect(bark.cover).toMatchObject({ id: sameDateLast, date: 200 });
    expect(bark.cover!.id).toBeGreaterThan(sameDateFirst);
    expect(items.find((i) => i.id === plain)!.cover).toBeNull();
  });

  it('serves detail images oldest first with srcset only for webp variants', async () => {
    const id = add('Bark');
    const first = addImage(id, '/uploads/component/a.webp', 100, 1);
    const second = addImage(id, '/uploads/component/b.jpg', 200);
    const detail = await repo.findById(id);
    expect(detail!.images.map((i) => i.id)).toEqual([first, second]);
    expect(detail!.images[0].srcset).toContain('160w');
    expect(detail!.images[1].srcset).toBeNull();
    expect(detail!.cover!.id).toBe(second);
    expect(await repo.findById(999)).toBeNull();
  });

  it('orders and seeks through idx_components_name in the generated SQL', async () => {
    for (const name of ['Bark', 'Coir', 'Perlite']) add(name);
    executed.length = 0;
    const firstPage = await repo.findPage({ limit: 1, cursor: null, q: null }, 'name');
    await repo.findPage({ limit: 1, cursor: { v: 'Bark', id: 1 }, q: null }, 'name');
    expect(firstPage.nextCursor).not.toBeNull();

    const listQueries = executed.filter(
      (e) => /order by/i.test(e.sql) && /"components"/.test(e.sql),
    );
    expect(listQueries).toHaveLength(2);
    for (const query of listQueries) {
      const rows = sqlite.prepare(`EXPLAIN QUERY PLAN ${query.sql}`).all(...query.params) as {
        detail: string;
      }[];
      const detail = rows.map((r) => r.detail).join('\n');
      expect(detail).toMatch(/USING (COVERING )?INDEX idx_components_name\b/);
      expect(detail).not.toMatch(/USE TEMP B-TREE FOR ORDER BY/);
    }
  });
});
