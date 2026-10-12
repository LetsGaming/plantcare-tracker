/**
 * Substrate read model against a real in-memory SQLite database: statement
 * budget, row budget, keyset walks, visibility and the query plans.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

process.env.DB_PATH = ':memory:';

import { initDatabase, closeDb, getKysely, getSqlite } from '../../src/core/database/db';
import { SQLiteSubstrateRepository } from '../../src/modules/substrate/infrastructure/SQLiteSubstrateRepository';
import { SQLiteComponentRepository } from '../../src/modules/components/infrastructure/SQLiteComponentRepository';
import { SQLiteUserRepository } from '../../src/modules/auth/infrastructure/SQLiteUserRepository';
import { SQLiteImageRepository } from '../../src/modules/images/infrastructure/SQLiteImageRepository';
import { decodeCursor } from '../../src/core/pagination';
import type {
  SubstrateListParams,
  SubstratePage,
} from '../../src/modules/substrate/domain/Substrate';

const users = new SQLiteUserRepository();
const substrates = new SQLiteSubstrateRepository();
const components = new SQLiteComponentRepository();
const images = new SQLiteImageRepository();

interface Recorded {
  sql: string;
  args: unknown[];
  rows: number;
}

/** Records every statement the callback prepares, with its bindings and result size. */
const recordStatements = async (run: () => Promise<unknown>): Promise<Recorded[]> => {
  const sqlite = getSqlite();
  const original = sqlite.prepare.bind(sqlite);
  const recorded: Recorded[] = [];
  const spy = vi.spyOn(sqlite, 'prepare').mockImplementation(((sql: string) => {
    const statement = original(sql);
    const entry: Recorded = { sql, args: [], rows: 0 };
    recorded.push(entry);
    return new Proxy(statement, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (prop === 'all') {
          return (...args: unknown[]) => {
            const result = (target.all as (...a: unknown[]) => unknown[])(...args);
            entry.args = args;
            entry.rows = result.length;
            return result;
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }) as unknown as typeof sqlite.prepare);
  try {
    await run();
  } finally {
    spy.mockRestore();
  }
  return recorded;
};

const params = (overrides: Partial<SubstrateListParams> = {}): SubstrateListParams => ({
  limit: 30,
  cursor: null,
  sort: 'created',
  q: null,
  componentId: null,
  ...overrides,
});

const walk = async (
  fetchPage: (cursor: SubstrateListParams['cursor']) => Promise<SubstratePage>,
  sort: 'created' | 'name',
): Promise<{ ids: number[]; pages: SubstratePage[] }> => {
  const pages: SubstratePage[] = [];
  const ids: number[] = [];
  let cursor: SubstrateListParams['cursor'] = null;
  do {
    const page: SubstratePage = await fetchPage(cursor);
    pages.push(page);
    ids.push(...page.items.map((i) => i.id));
    cursor = page.nextCursor
      ? decodeCursor(page.nextCursor, sort, {
          valueType: sort === 'name' ? 'string' : 'number',
          idType: 'number',
        })
      : null;
  } while (cursor);
  return { ids, pages };
};

let seq = 0;
const newUser = async () => (await users.create(`sub-list-${++seq}`, 'hash')).id;

let heavyUser: number;
let componentIds: number[];

beforeAll(async () => {
  await initDatabase();
  componentIds = [];
  for (let i = 0; i < 5; i++) componentIds.push(await components.create(`SL-Comp-${i}`, 1));

  heavyUser = await newUser();
  for (let s = 0; s < 20; s++) {
    const id = await substrates.create(
      `Heavy ${String(s).padStart(2, '0')}`,
      heavyUser,
      s % 2 === 0,
      componentIds.map((componentId) => ({ componentId, parts: 1 })),
    );
    for (let i = 0; i < 3; i++) {
      await images.create('substrate', id, `http://h/${id}-${i}.webp`, 1000 + i);
    }
  }
});

afterAll(async () => {
  await closeDb();
});

describe('substrate list statement and row budget', () => {
  it('lists 20 substrates with 5 components and 3 images each in at most 3 statements', async () => {
    let page!: SubstratePage;
    const statements = await recordStatements(async () => {
      page = await substrates.listMine(heavyUser, params());
    });

    expect(statements.length).toBeLessThanOrEqual(3);
    expect(page.items).toHaveLength(20);
    expect(page.total).toBe(20);
    const returnedRows = statements.reduce((sum, s) => sum + s.rows, 0);
    expect(returnedRows).toBeLessThanOrEqual(20 + 1 + 20);
    for (const item of page.items) {
      expect(item.component_count).toBe(5);
      expect(item.cover?.url).toMatch(/-2\.webp$/);
      expect(item).not.toHaveProperty('components');
      expect(item).not.toHaveProperty('images');
    }
  });

  it('builds a detail from three statements without multiplying rows', async () => {
    const [first] = (await substrates.listMine(heavyUser, params({ limit: 1 }))).items;
    let detail: Awaited<ReturnType<typeof substrates.findById>> = null;
    const statements = await recordStatements(async () => {
      detail = await substrates.findById(first.id);
    });

    expect(statements).toHaveLength(3);
    expect(statements.reduce((sum, s) => sum + s.rows, 0)).toBe(1 + 5 + 3);
    expect(detail!.components).toHaveLength(5);
    expect(detail!.images.map((i) => i.url.slice(-7))).toEqual(['-0.webp', '-1.webp', '-2.webp']);
    expect(detail!.cover?.id).toBe(detail!.images[2].id);
  });

  it('reports dates in epoch milliseconds in the list and the detail', async () => {
    const userId = await newUser();
    const id = await substrates.create('Dated', userId, false);
    const [item] = (await substrates.listMine(userId, params())).items;
    const detail = await substrates.findById(id);
    expect(Math.abs(Date.now() - item.created_at)).toBeLessThan(60_000);
    expect(detail!.substrate_created_at).toBe(item.created_at);
  });

  it('skips the cover statement when the page has no images', async () => {
    const userId = await newUser();
    await substrates.create('Bare', userId, false);
    const statements = await recordStatements(async () => {
      await substrates.listMine(userId, params());
    });
    expect(statements).toHaveLength(2);
  });

  it('sends total on the first page only', async () => {
    const first = await substrates.listMine(heavyUser, params({ limit: 8 }));
    expect(first.total).toBe(20);
    const next = await substrates.listMine(
      heavyUser,
      params({
        limit: 8,
        cursor: decodeCursor(first.nextCursor!, 'created', {
          valueType: 'number',
          idType: 'number',
        }),
      }),
    );
    expect(next.total).toBeUndefined();
  });
});

describe('writes', () => {
  it('creates a substrate and its mix together and rolls both back on an unknown component', async () => {
    const userId = await newUser();
    const id = await substrates.create('With mix', userId, false, [
      { componentId: componentIds[0], parts: 1.234 },
      { componentId: componentIds[1], parts: 2 },
    ]);
    const detail = await substrates.findById(id);
    expect(detail?.components.map((c) => [c.component_id, c.component_parts])).toEqual([
      [componentIds[0], 1.23],
      [componentIds[1], 2],
    ]);

    await expect(
      substrates.create('Broken mix', userId, false, [
        { componentId: componentIds[0], parts: 1 },
        { componentId: 987654, parts: 1 },
      ]),
    ).rejects.toThrow();
    const leftovers = await getKysely()
      .selectFrom('substrates')
      .select('id')
      .where('name', '=', 'Broken mix')
      .execute();
    expect(leftovers).toEqual([]);
  });

  it('replaces the mix and edits the fields in one update, rolling back on a bad component', async () => {
    const userId = await newUser();
    const id = await substrates.create('Mix', userId, false, [
      { componentId: componentIds[0], parts: 1 },
      { componentId: componentIds[1], parts: 1 },
      { componentId: componentIds[2], parts: 1 },
    ]);

    expect(
      await substrates.update(id, userId, {
        name: 'Renamed',
        isPublic: true,
        components: [
          { componentId: componentIds[0], parts: 4 },
          { componentId: componentIds[2], parts: 1 },
        ],
      }),
    ).toBe(true);
    const after = await substrates.findById(id);
    expect(after).toMatchObject({ substrate_name: 'Renamed', is_public: true });
    expect(after?.components.map((c) => [c.component_id, c.component_parts])).toEqual([
      [componentIds[0], 4],
      [componentIds[2], 1],
    ]);

    await expect(
      substrates.update(id, userId, {
        name: 'Never applied',
        components: [{ componentId: 987654, parts: 1 }],
      }),
    ).rejects.toThrow();
    const intact = await substrates.findById(id);
    expect(intact?.substrate_name).toBe('Renamed');
    expect(intact?.components).toHaveLength(2);
  });

  it('writes nothing and returns false for a foreign substrate', async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const id = await substrates.create('Mine', owner, false, [
      { componentId: componentIds[0], parts: 1 },
    ]);
    expect(await substrates.update(id, intruder, { name: 'x', components: [] })).toBe(false);
    expect(await substrates.update(id, intruder, { components: [] })).toBe(false);
    const detail = await substrates.findById(id);
    expect(detail?.substrate_name).toBe('Mine');
    expect(detail?.components).toHaveLength(1);
  });
});

describe('used-in filter', () => {
  it('only returns substrates the viewer may see', async () => {
    const owner = await newUser();
    const other = await newUser();
    const target = await components.create('Used-in target', 2);
    const mix = [{ componentId: target, parts: 1 }];
    const ownPrivate = await substrates.create('own private', owner, false, mix);
    const ownPublic = await substrates.create('own public', owner, true, mix);
    const foreignPrivate = await substrates.create('foreign private', other, false, mix);
    const foreignPublic = await substrates.create('foreign public', other, true, mix);
    await substrates.create('unrelated', owner, true, []);

    const mine = await substrates.listMine(owner, params({ componentId: target }));
    expect(mine.items.map((i) => i.id).sort()).toEqual([ownPrivate, ownPublic].sort());
    expect(mine.total).toBe(2);

    const pub = await substrates.listPublic(params({ componentId: target }));
    const publicIds = pub.items.map((i) => i.id);
    expect(publicIds).toContain(foreignPublic);
    expect(publicIds).toContain(ownPublic);
    expect(publicIds).not.toContain(foreignPrivate);
    expect(publicIds).not.toContain(ownPrivate);
  });

  it('matches names literally for q', async () => {
    const userId = await newUser();
    await substrates.create('50% bark', userId, false);
    await substrates.create('500 bark', userId, false);
    const page = await substrates.listMine(userId, params({ q: '50%' }));
    expect(page.items.map((i) => i.name)).toEqual(['50% bark']);
  });
});

describe('keyset walks', () => {
  it('visits every row once for both sorts, including ties and a mid-walk insert', async () => {
    const userId = await newUser();
    const names = ['beta', 'Alpha', 'alpha', 'Gamma', 'delta', 'Beta', 'epsilon', 'Zeta', 'eta'];
    const created: number[] = [];
    for (let i = 0; i < 25; i++) {
      created.push(await substrates.create(`${names[i % names.length]} ${i % 3}`, userId, false));
    }

    let existing = 25;
    for (const sort of ['created', 'name'] as const) {
      let inserted = false;
      const { ids, pages } = await walk(async (cursor) => {
        const page = await substrates.listMine(userId, params({ limit: 7, cursor, sort }));
        if (!inserted) {
          inserted = true;
          await substrates.create(`late ${sort}`, userId, false);
        }
        return page;
      }, sort);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(expect.arrayContaining(created));
      expect(pages[0].total).toBe(existing);
      existing += 1;
      expect(pages.slice(1).every((p) => p.total === undefined)).toBe(true);
    }

    const byName = await substrates.listMine(userId, params({ limit: 100, sort: 'name' }));
    const lowered = byName.items.map((i) => i.name.toLowerCase());
    expect(lowered).toEqual([...lowered].sort());
    const byCreated = await substrates.listMine(userId, params({ limit: 100 }));
    expect(byCreated.items.map((i) => i.id)).toEqual(
      [...byCreated.items]
        .sort((a, b) => b.created_at - a.created_at || b.id - a.id)
        .map((i) => i.id),
    );
  });

  it('never lists private substrates in the public scope', async () => {
    const userId = await newUser();
    const priv = await substrates.create('hidden', userId, false);
    const { ids } = await walk(
      (cursor) => substrates.listPublic(params({ limit: 7, cursor })),
      'created',
    );
    expect(ids).not.toContain(priv);
  });
});

describe('list query plans', () => {
  const plans = async (run: () => Promise<unknown>): Promise<Record<string, string[]>> => {
    const statements = await recordStatements(run);
    const sqlite = getSqlite();
    const main = statements.find((s) => s.sql.includes('cover_id'));
    expect(main).toBeDefined();
    const count = statements.find(
      (s) => s.sql.includes('COUNT(*) as "total"') || /count\(\*\) as "total"/i.test(s.sql),
    );
    const explain = (s: Recorded) =>
      (sqlite.prepare(`EXPLAIN QUERY PLAN ${s.sql}`).all(...s.args) as { detail: string }[]).map(
        (r) => r.detail,
      );
    return { main: explain(main!), ...(count ? { count: explain(count) } : {}) };
  };

  const expectIndexed = (plan: string[], index: string) => {
    expect(plan.join('\n')).toContain(index);
    expect(plan.join('\n')).not.toContain('USE TEMP B-TREE');
  };

  it('uses the user and public indexes for both sorts without a sort step', async () => {
    const mineCreated = await plans(() => substrates.listMine(heavyUser, params()));
    expectIndexed(mineCreated.main, 'idx_substrates_user_created');

    const mineName = await plans(() => substrates.listMine(heavyUser, params({ sort: 'name' })));
    expectIndexed(mineName.main, 'idx_substrates_user_name');

    const publicCreated = await plans(() => substrates.listPublic(params()));
    expectIndexed(publicCreated.main, 'idx_substrates_public_created');

    const publicName = await plans(() => substrates.listPublic(params({ sort: 'name' })));
    expectIndexed(publicName.main, 'idx_substrates_public_name');
  });

  it('keeps the index with a search term and a used-in filter', async () => {
    const filtered = await plans(() =>
      substrates.listMine(heavyUser, params({ q: 'heavy', componentId: componentIds[0] })),
    );
    expectIndexed(filtered.main, 'idx_substrates_user_created');
  });
});
