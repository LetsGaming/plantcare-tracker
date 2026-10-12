/**
 * The plant read model against a real in-memory SQLite database: keyset
 * paging, watering summaries, cover images and the query plans of the SQL
 * the repository generates.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.DB_PATH = ':memory:';

import { initDatabase, closeDb, getSqlite } from '../../src/core/database/db';
import { decodeCursor, type Cursor } from '../../src/core/pagination';
import { SQLitePlantRepository } from '../../src/modules/plants/infrastructure/SQLitePlantRepository';
import { SQLiteSpeciesCatalog } from '../../src/modules/plants/infrastructure/SQLiteSpeciesCatalog';
import { SpeciesResolver } from '../../src/modules/plants/domain/SpeciesResolver';
import { ListPlantsUseCase } from '../../src/modules/plants/application/PlantUseCases';
import type {
  PlantListItem,
  PlantListQuery,
  PlantSort,
} from '../../src/modules/plants/domain/Plant';
import { loadSummaries } from '../../src/modules/watering/infrastructure/wateringSummary';

const plants = new SQLitePlantRepository((db) => new SpeciesResolver(new SQLiteSpeciesCatalog(db)));

const DAY = 86400;
const BASE = 1_700_000_000;
const at = (month: number, day: number, hour = 12, minute = 0) =>
  Date.UTC(2026, month - 1, day, hour, minute) / 1000;

let userSeq = 0;
const newUser = (): number => {
  const result = getSqlite()
    .prepare('INSERT INTO users (username, password) VALUES (?, ?)')
    .run(`list-user-${++userSeq}`, 'hash');
  return Number(result.lastInsertRowid);
};

interface PlantSeed {
  isPublic?: boolean;
  createdAt?: number;
}
const addPlant = (userId: number, name: string, seed: PlantSeed = {}): number => {
  const result = getSqlite()
    .prepare('INSERT INTO plants (name, user_id, is_public, created_at) VALUES (?, ?, ?, ?)')
    .run(name, userId, seed.isPublic ? 1 : 0, seed.createdAt ?? BASE);
  return Number(result.lastInsertRowid);
};
const water = (plantId: number, date: number, fertilized = false) => {
  getSqlite()
    .prepare('INSERT INTO watering_records (plant_id, date, used_fertilizer) VALUES (?, ?, ?)')
    .run(plantId, date, fertilized ? 1 : 0);
};
const addImage = (plantId: number, url: string, uploadDate: number): number => {
  const result = getSqlite()
    .prepare(
      "INSERT INTO images (image_url, entity_type, entity_id, upload_date) VALUES (?, 'plant', ?, ?)",
    )
    .run(url, plantId, uploadDate);
  return Number(result.lastInsertRowid);
};

const query = (overrides: Partial<PlantListQuery> = {}): PlantListQuery => ({
  limit: 30,
  cursor: null,
  q: null,
  sort: 'created',
  ...overrides,
});

const summaryOf = async (userId: number, plantId: number, tz = 0) => {
  const page = await plants.listMine(userId, query({ limit: 100 }), tz);
  return page.items.find((item) => item.plant_id === plantId)!.watering!;
};

const CURSOR_TYPES = {
  created: { valueType: 'number', idType: 'number' },
  name: { valueType: 'string', idType: 'number' },
} as const;

const walk = async (
  load: (q: PlantListQuery) => Promise<{ items: PlantListItem[]; nextCursor: string | null }>,
  sort: PlantSort,
  limit: number,
): Promise<number[]> => {
  const ids: number[] = [];
  let cursor: Cursor | null = null;
  for (let guard = 0; guard < 1000; guard++) {
    const page = await load(query({ sort, limit, cursor }));
    ids.push(...page.items.map((item) => item.plant_id));
    if (page.nextCursor === null) return ids;
    cursor = decodeCursor(page.nextCursor, sort, CURSOR_TYPES[sort]);
  }
  throw new Error('pagination did not terminate');
};

beforeAll(async () => {
  await initDatabase();
});

afterAll(async () => {
  await closeDb();
});

describe('watering summary on the list', () => {
  it('counts two records on the same local day once', async () => {
    const owner = newUser();
    const plant = addPlant(owner, 'SameDay');
    water(plant, at(3, 1, 8));
    water(plant, at(3, 1, 20));
    water(plant, at(3, 4, 12));

    const summary = await summaryOf(owner, plant);
    expect(summary.avg_interval_days).toBe(3);
    expect(summary.last_watered_at).toBe(at(3, 4, 12) * 1000);
  });

  it('moves a late-evening record to the next local day with tz_offset', async () => {
    const owner = newUser();
    const plant = addPlant(owner, 'LateEvening');
    water(plant, at(3, 1, 23, 30));
    water(plant, at(3, 2, 12));

    expect((await summaryOf(owner, plant, 0)).avg_interval_days).toBe(1);
    expect((await summaryOf(owner, plant, 60)).avg_interval_days).toBeNull();
    expect((await summaryOf(owner, plant, -300)).avg_interval_days).toBe(1);
  });

  it('has no average with fewer than two distinct days and nulls without records', async () => {
    const owner = newUser();
    const empty = addPlant(owner, 'Never');
    const once = addPlant(owner, 'Once');
    water(once, at(3, 1));
    water(once, at(3, 1, 18));

    expect(await summaryOf(owner, empty)).toEqual({
      last_watered_at: null,
      last_fertilized_at: null,
      avg_interval_days: null,
    });
    const single = await summaryOf(owner, once);
    expect(single.avg_interval_days).toBeNull();
    expect(single.last_watered_at).toBe(at(3, 1, 18) * 1000);
  });

  it('reports the last fertilized watering separately', async () => {
    const owner = newUser();
    const plant = addPlant(owner, 'Fed');
    water(plant, at(3, 1), true);
    water(plant, at(3, 5), false);
    water(plant, at(3, 8), false);

    const summary = await summaryOf(owner, plant);
    expect(summary.last_fertilized_at).toBe(at(3, 1) * 1000);
    expect(summary.last_watered_at).toBe(at(3, 8) * 1000);
  });

  it('is null for public items and for plants the viewer does not own', async () => {
    const owner = newUser();
    const plant = addPlant(owner, 'Shown', { isPublic: true });
    water(plant, at(3, 1));
    const page = await plants.listPublic(query({ limit: 100 }));
    expect(page.items.find((item) => item.plant_id === plant)!.watering).toBeNull();
    expect((await plants.findById(plant, newUser(), 0))!.watering).toBeNull();
    expect((await plants.findById(plant, null, 0))!.watering).toBeNull();
    expect((await plants.findById(plant, owner, 0))!.watering!.last_watered_at).toBe(
      at(3, 1) * 1000,
    );
  });

  it('loads summaries for many plants in one statement', async () => {
    const owner = newUser();
    const a = addPlant(owner, 'BatchA');
    const b = addPlant(owner, 'BatchB');
    water(a, at(3, 1));
    water(a, at(3, 3));
    water(b, at(3, 9));

    const map = await loadSummaries([a, b, 999999], 0);
    expect(map.get(a)).toEqual({
      last_watered_at: at(3, 3) * 1000,
      last_fertilized_at: null,
      avg_interval_days: 2,
    });
    expect(map.get(b)!.avg_interval_days).toBeNull();
    expect(map.has(999999)).toBe(false);
    expect((await loadSummaries([], 0)).size).toBe(0);
  });
});

describe('cover and image count', () => {
  it('uses the newest image as cover, breaking date ties by id, and counts all images', async () => {
    const owner = newUser();
    const plant = addPlant(owner, 'Covered');
    const none = addPlant(owner, 'Bare');
    addImage(plant, '/uploads/plant/old.webp', 100);
    const tieFirst = addImage(plant, '/uploads/plant/tie-a.webp', 300);
    const tieLast = addImage(plant, '/uploads/plant/tie-b.webp', 300);
    addImage(plant, '/uploads/plant/mid.webp', 200);

    const page = await plants.listMine(owner, query(), 0);
    const covered = page.items.find((item) => item.plant_id === plant)!;
    expect(covered.cover?.id).toBe(tieLast);
    expect(covered.cover?.id).not.toBe(tieFirst);
    expect(covered.cover?.url).toMatch(/\/uploads\/plant\/tie-b\.webp$/);
    expect(covered.cover?.date).toBe(300);
    expect(covered.image_count).toBe(4);
    const bare = page.items.find((item) => item.plant_id === none)!;
    expect(bare.cover).toBeNull();
    expect(bare.image_count).toBe(0);
  });

  it('serves the detail with images oldest first and the newest as cover', async () => {
    const owner = newUser();
    const plant = addPlant(owner, 'Detail');
    addImage(plant, '/uploads/plant/c.webp', 300);
    addImage(plant, '/uploads/plant/a.webp', 100);
    addImage(plant, '/uploads/plant/b.webp', 200);

    const detail = (await plants.findById(plant, owner, 0))!;
    expect(detail.images.map((image) => image.date)).toEqual([100, 200, 300]);
    expect(detail.cover?.date).toBe(300);
    expect(detail.imageCount).toBe(3);
    expect(detail.toJSON().created_at).toBe(BASE * 1000);
  });
});

describe('scopes and search', () => {
  it('never lists private plants in public and lists only own plants in mine', async () => {
    const owner = newUser();
    const other = newUser();
    const mineOpen = addPlant(owner, 'ScopeOpen', { isPublic: true });
    const minePrivate = addPlant(owner, 'ScopePrivate');
    const theirPrivate = addPlant(other, 'ScopeTheirs');
    const theirOpen = addPlant(other, 'ScopeTheirOpen', { isPublic: true });

    const mine = (await plants.listMine(owner, query({ limit: 100 }), 0)).items.map(
      (item) => item.plant_id,
    );
    expect(mine.sort()).toEqual([mineOpen, minePrivate].sort());

    const everyone = (await plants.listPublic(query({ limit: 100, q: 'Scope' }))).items.map(
      (item) => item.plant_id,
    );
    expect(everyone).toContain(mineOpen);
    expect(everyone).toContain(theirOpen);
    expect(everyone).not.toContain(minePrivate);
    expect(everyone).not.toContain(theirPrivate);
  });

  it('answers scope mine for a viewer without an account as an empty page', async () => {
    const useCase = new ListPlantsUseCase(plants);
    expect(await useCase.execute('mine', query(), null, 0)).toEqual({
      items: [],
      nextCursor: null,
      total: 0,
    });
  });

  it('matches the name, and the species name for mine only, with wildcards taken literally', async () => {
    const owner = newUser();
    const species = await plants.create({
      name: 'Fern A',
      species: 'Nephrolepis exaltata',
      isPublic: true,
      userId: owner,
    });
    const percent = addPlant(owner, '100% green', { isPublic: true });
    addPlant(owner, '100 plain', { isPublic: true });

    const byName = await plants.listMine(owner, query({ q: 'fern' }), 0);
    expect(byName.items.map((item) => item.plant_id)).toEqual([species]);
    const bySpecies = await plants.listMine(owner, query({ q: 'nephrolepis' }), 0);
    expect(bySpecies.items.map((item) => item.plant_id)).toEqual([species]);
    expect(bySpecies.total).toBe(1);

    const publicBySpecies = await plants.listPublic(query({ q: 'nephrolepis' }));
    expect(publicBySpecies.items).toEqual([]);

    const literal = await plants.listMine(owner, query({ q: '100%' }), 0);
    expect(literal.items.map((item) => item.plant_id)).toEqual([percent]);
  });

  it('sends total on the first page only', async () => {
    const owner = newUser();
    for (let i = 0; i < 5; i++) addPlant(owner, `Total ${i}`, { createdAt: BASE + i });
    const first = await plants.listMine(owner, query({ limit: 2 }), 0);
    expect(first.total).toBe(5);
    const cursor = decodeCursor(first.nextCursor!, 'created', CURSOR_TYPES.created);
    const second = await plants.listMine(owner, query({ limit: 2, cursor }), 0);
    expect(second).not.toHaveProperty('total');
  });

  it('keeps the stored seconds in the cursor while the item carries milliseconds', async () => {
    const owner = newUser();
    addPlant(owner, 'CursorA', { createdAt: BASE + 2 });
    addPlant(owner, 'CursorB', { createdAt: BASE + 1 });
    const page = await plants.listMine(owner, query({ limit: 1 }), 0);
    expect(page.items[0].created_at).toBe((BASE + 2) * 1000);
    const cursor = decodeCursor(page.nextCursor!, 'created', CURSOR_TYPES.created);
    expect(cursor.v).toBe(BASE + 2);
  });
});

describe('keyset walks', () => {
  const ASCII_NAMES = ['alpha', 'Alpha', 'ALPHA', 'beta', 'Beta', 'gamma', 'delta', 'Delta'];

  it.each(['created', 'name'] as const)(
    'walks mine and public in %s order to exactly the full set, including ties',
    async (sort) => {
      const owner = newUser();
      const other = newUser();
      const seeded: {
        id: number;
        name: string;
        createdAt: number;
        mine: boolean;
        open: boolean;
      }[] = [];
      for (let i = 0; i < 40; i++) {
        const name = ASCII_NAMES[i % ASCII_NAMES.length];
        const createdAt = BASE + 5000 + Math.floor(i / 4);
        const open = i % 3 === 0;
        const user = i % 5 === 0 ? other : owner;
        const id = addPlant(user, name, { isPublic: open, createdAt });
        seeded.push({ id, name, createdAt, mine: user === owner, open });
      }
      const order = (a: (typeof seeded)[number], b: (typeof seeded)[number]): number =>
        sort === 'created'
          ? b.createdAt - a.createdAt || b.id - a.id
          : a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id - b.id;

      const expectedMine = seeded
        .filter((p) => p.mine)
        .sort(order)
        .map((p) => p.id);
      const walkedMine = await walk((q) => plants.listMine(owner, q, 0), sort, 7);
      expect(walkedMine).toEqual(expectedMine);

      const expectedPublic = seeded
        .filter((p) => p.open)
        .sort(order)
        .map((p) => p.id);
      const walkedPublic = (await walk((q) => plants.listPublic(q), sort, 7)).filter((id) =>
        expectedPublic.includes(id),
      );
      expect(walkedPublic).toEqual(expectedPublic);
    },
  );

  it('does not skip or repeat rows when a plant is inserted between pages', async () => {
    const owner = newUser();
    for (let i = 0; i < 6; i++) addPlant(owner, `Stable ${i}`, { createdAt: BASE + 9000 + i });
    const first = await plants.listMine(owner, query({ limit: 3 }), 0);
    addPlant(owner, 'Late arrival', { createdAt: BASE + 9999 });
    const cursor = decodeCursor(first.nextCursor!, 'created', CURSOR_TYPES.created);
    const second = await plants.listMine(owner, query({ limit: 3, cursor }), 0);
    const names = [...first.items, ...second.items].map((item) => item.plant_name);
    expect(names).toEqual(['Stable 5', 'Stable 4', 'Stable 3', 'Stable 2', 'Stable 1', 'Stable 0']);
  });
});

describe('query plans and speed', () => {
  const PLANTS = 2000;
  const RECORDS = 20;
  let perfUser = 0;

  beforeAll(() => {
    const sqlite = getSqlite();
    perfUser = newUser();
    const otherUser = newUser();
    const insertPlant = sqlite.prepare(
      'INSERT INTO plants (name, user_id, is_public, created_at) VALUES (?, ?, ?, ?)',
    );
    const insertRecord = sqlite.prepare(
      'INSERT INTO watering_records (plant_id, date, used_fertilizer) VALUES (?, ?, ?)',
    );
    const insertImage = sqlite.prepare(
      "INSERT INTO images (image_url, entity_type, entity_id, upload_date) VALUES (?, 'plant', ?, ?)",
    );
    sqlite.transaction(() => {
      for (let i = 1; i <= PLANTS; i++) {
        const owner = i % 2 === 0 ? perfUser : otherUser;
        const id = Number(
          insertPlant.run(`Plant ${i}`, owner, i % 3 === 0 ? 1 : 0, BASE + i).lastInsertRowid,
        );
        for (let r = 0; r < RECORDS; r++) {
          insertRecord.run(id, BASE + r * DAY * 3 + i, r % 5 === 0 ? 1 : 0);
        }
        if (i % 4 === 0) insertImage.run(`/uploads/plant/${i}.webp`, id, BASE + i);
      }
    })();
    sqlite.exec('ANALYZE');
  });

  interface Captured {
    sql: string;
    params: unknown[];
  }

  /** Runs `action` and records every statement the driver executes. */
  const capture = async (action: () => Promise<unknown>): Promise<Captured[]> => {
    const sqlite = getSqlite();
    const original = sqlite.prepare.bind(sqlite);
    const captured: Captured[] = [];
    (sqlite as { prepare: unknown }).prepare = (source: string) => {
      const statement = original(source);
      const all = statement.all.bind(statement);
      (statement as { all: unknown }).all = (...args: unknown[]) => {
        captured.push({ sql: source, params: args.flat() });
        return all(...args);
      };
      return statement;
    };
    try {
      await action();
    } finally {
      (sqlite as { prepare: unknown }).prepare = original;
    }
    return captured;
  };

  const planOf = (statement: Captured): string =>
    (
      getSqlite()
        .prepare(`EXPLAIN QUERY PLAN ${statement.sql}`)
        .all(...statement.params) as { detail: string }[]
    )
      .map((row) => row.detail)
      .join('\n');

  const cursorFor = (sort: PlantSort): Cursor =>
    sort === 'created'
      ? { s: 'created', v: BASE + 1000, id: 1000 }
      : { s: 'name', v: 'plant 5', id: 500 };

  const INDEX = {
    'mine/created': 'idx_plants_user_created',
    'mine/name': 'idx_plants_user_name',
    'public/created': 'idx_plants_public_created',
    'public/name': 'idx_plants_public_name',
  } as const;

  const cases = (['mine', 'public'] as const).flatMap((scope) =>
    (['created', 'name'] as const).flatMap((sort) =>
      [false, true].map((withCursor) => ({ scope, sort, withCursor })),
    ),
  );

  it.each(cases)(
    'serves $scope by $sort (cursor: $withCursor) from the 0006 index without a sort step',
    async ({ scope, sort, withCursor }) => {
      const q = query({ sort, limit: 30, cursor: withCursor ? cursorFor(sort) : null });
      const statements = await capture(() =>
        scope === 'mine' ? plants.listMine(perfUser, q, 0) : plants.listPublic(q),
      );
      const main = statements.find((s) => s.sql.includes('"plant_id"'))!;
      const plan = planOf(main);
      const index = INDEX[`${scope}/${sort}`];
      expect(plan).toMatch(new RegExp(`USING (COVERING )?INDEX ${index}\\b`));
      expect(plan).not.toContain('USE TEMP B-TREE FOR ORDER BY');
      expect(plan).not.toMatch(/SCAN (p|wh|i)\b(?! USING)/);
      if (withCursor && sort === 'name') expect(plan).toContain('name>?');

      const covers = statements.filter((s) => s.sql.includes('from "images"'));
      expect(covers.length).toBeLessThanOrEqual(1);
      for (const cover of covers) expect(planOf(cover)).toContain('INTEGER PRIMARY KEY');

      if (!withCursor) {
        const count = statements.find((s) => s.sql.includes('COUNT(*)'))!;
        expect(planOf(count)).toMatch(/USING (COVERING )?INDEX idx_plants_/);
      }
    },
  );

  it('reads the watering aggregates through idx_watering_history only', async () => {
    const statements = await capture(() => loadSummaries([2, 4, 6], 0));
    expect(statements).toHaveLength(1);
    const plan = planOf(statements[0]);
    expect(plan).toContain('idx_watering_history');
    expect(plan).not.toMatch(/SCAN wh\b/);
    expect(plan).toContain('CORRELATED SCALAR SUBQUERY');
  });

  it('lists the first page of 2,000 plants with 20 records each in well under 50 ms', async () => {
    await plants.listMine(perfUser, query({ limit: 100 }), 0);
    const started = performance.now();
    const page = await plants.listMine(perfUser, query({ limit: 100 }), 60);
    const elapsed = performance.now() - started;
    expect(page.items).toHaveLength(100);
    expect(page.total).toBe(PLANTS / 2);
    expect(page.items[0].watering?.avg_interval_days).toBe(3);
    expect(elapsed).toBeLessThan(50);
  });
});
