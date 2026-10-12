/**
 * SQLiteSalesRepository against an in-memory database built by the migrations.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

process.env.DB_PATH = ':memory:';

import { initDatabase, closeDb, getSqlite } from '../../src/core/database/db';
import { getConfig } from '../../src/core/config';
import { decodeCursor, encodeCursor, type Cursor } from '../../src/core/pagination';
import { Sale, type SaleRow } from '../../src/modules/sales/domain/Sale';
import { SALES_CURSOR_TYPES, SALES_SORT } from '../../src/modules/sales/domain/SalesRepository';
import {
  PRICE_POINT_RETENTION_DAYS,
  SQLiteSalesRepository,
} from '../../src/modules/sales/infrastructure/SQLiteSalesRepository';

const DAY = 24 * 60 * 60 * 1000;
const repo = new SQLiteSalesRepository();

const link = (seller: string, n: number) => `https://${seller}.example/products/p-${n}`;

const sale = (
  seller: string,
  n: number,
  {
    price = 10,
    oldPrice = 20,
    scrapedAt = 1,
  }: { price?: number; oldPrice?: number | null; scrapedAt?: number } = {},
): Sale =>
  Sale.fromRaw(
    { name: `Plant ${n}`, link: link(seller, n), newPrice: price, oldPrice },
    seller,
    scrapedAt,
  )!;

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const snapshot = (seller: string, ns: number[], runAt: number, price = 10) =>
  repo.applySourceSnapshot(
    seller,
    seller,
    ns.map((n) => sale(seller, n, { price, scrapedAt: runAt })),
    runAt,
  );

const idOf = (seller: string, n: number) => sale(seller, n).sale_id;

const pointsOf = (saleId: string) =>
  getSqlite()
    .prepare(
      'SELECT observed_at, price FROM sales_price_points WHERE sale_id = ? ORDER BY observed_at',
    )
    .all(saleId) as { observed_at: number; price: number }[];

const activeIds = (seller: string) =>
  (
    getSqlite()
      .prepare('SELECT sale_id FROM sales_items WHERE source_key = ? AND active = 1')
      .all(seller) as { sale_id: string }[]
  ).map((r) => r.sale_id);

const walk = async (limit: number): Promise<SaleRow[]> => {
  const rows: SaleRow[] = [];
  let cursor: Cursor | null = null;
  for (;;) {
    const page = await repo.pageActive({ limit, cursor });
    rows.push(...page.items);
    if (!page.nextCursor) return rows;
    cursor = decodeCursor(page.nextCursor, SALES_SORT, SALES_CURSOR_TYPES);
  }
};

beforeAll(async () => {
  await initDatabase();
});

afterAll(async () => {
  await closeDb();
});

beforeEach(() => {
  getSqlite().exec(
    'DELETE FROM sales_price_points; DELETE FROM sales_items; DELETE FROM sales_source_state;',
  );
});

describe('applySourceSnapshot', () => {
  it('keeps first_seen_at across upserts and refreshes the other fields', async () => {
    const first = sale('alpha', 1, { price: 10, oldPrice: 20, scrapedAt: 900 });
    await repo.applySourceSnapshot('alpha', 'Alpha', [first], 1_000);

    const changed = Sale.fromRaw(
      {
        name: 'Renamed',
        link: link('alpha', 1),
        newPrice: 8,
        oldPrice: 16,
        img: 'https://img/1.jpg',
      },
      'alpha',
      1_900,
    )!;
    await repo.applySourceSnapshot('alpha', 'Alpha', [changed], 2_000);

    expect(await repo.findById(first.sale_id)).toEqual({
      sale_id: first.sale_id,
      source_key: 'alpha',
      seller: 'alpha',
      name: 'Renamed',
      link: link('alpha', 1),
      image_url: 'https://img/1.jpg',
      old_price: 16,
      new_price: 8,
      discount_pct: 50,
      first_seen_at: 1_000,
      last_seen_at: 2_000,
      scraped_at: 1_900,
      active: 1,
    });
    expect(await repo.findById('missing')).toBeNull();
  });

  it('adds a price point only when the price changes', async () => {
    const id = idOf('alpha', 1);
    await snapshot('alpha', [1], 1_000, 10);
    await snapshot('alpha', [1], 2_000, 10);
    await snapshot('alpha', [1], 3_000, 10);
    expect(pointsOf(id)).toEqual([{ observed_at: 1_000, price: 10 }]);

    const result = await snapshot('alpha', [1], 4_000, 7);
    expect(result.pricePointsAdded).toBe(1);
    await snapshot('alpha', [1], 5_000, 7);
    expect(await repo.history(id)).toEqual([
      { observed_at: 1_000, price: 10 },
      { observed_at: 4_000, price: 7 },
    ]);
  });

  it('trims the price points of an item to the configured cap', async () => {
    const cap = getConfig().sales.pricePointsMax;
    const runs = cap + 5;
    for (let run = 1; run <= runs; run++) await snapshot('alpha', [1, 2], run * 1_000, run);

    const points = pointsOf(idOf('alpha', 1));
    expect(points).toHaveLength(cap);
    expect(points[0].observed_at).toBe((runs - cap + 1) * 1_000);
    expect(points.at(-1)!.observed_at).toBe(runs * 1_000);
    expect(pointsOf(idOf('alpha', 2))).toHaveLength(cap);

    const history = await repo.history(idOf('alpha', 1));
    expect(history).toHaveLength(Math.min(cap, 30));
    expect(history.map((p) => p.observed_at)).toEqual(
      [...history.map((p) => p.observed_at)].sort((a, b) => a - b),
    );
    expect(history.at(-1)!.observed_at).toBe(runs * 1_000);
  });

  it('deactivates items missing from a snapshot and reactivates them when they return', async () => {
    await snapshot('alpha', [1, 2, 3], 1_000);
    const result = await snapshot('alpha', [1, 3], 2_000);

    expect(result).toEqual({ upserted: 2, pricePointsAdded: 0, deactivated: 1 });
    expect(activeIds('alpha').sort()).toEqual([idOf('alpha', 1), idOf('alpha', 3)].sort());
    expect((await repo.findById(idOf('alpha', 2)))!.active).toBe(0);
    expect((await walk(10)).map((r) => r.sale_id)).not.toContain(idOf('alpha', 2));

    await snapshot('alpha', [1, 2, 3], 3_000);
    const back = (await repo.findById(idOf('alpha', 2)))!;
    expect(back.active).toBe(1);
    expect(back.first_seen_at).toBe(1_000);
  });

  it('never deactivates anything on an empty snapshot', async () => {
    await snapshot('alpha', [1, 2], 1_000);
    const result = await repo.applySourceSnapshot('alpha', 'alpha', [], 2_000);

    expect(result).toEqual({ upserted: 0, pricePointsAdded: 0, deactivated: 0 });
    expect(activeIds('alpha')).toHaveLength(2);
  });

  it("stores each sale's own seller and ignores the seller argument", async () => {
    const item = sale('alpha', 1);
    await repo.applySourceSnapshot('alpha', 'Other Name', [item], 1_000);
    expect((await repo.findById(item.sale_id))!.seller).toBe('alpha');
  });

  it('keeps the first of duplicate sale ids and counts unique items', async () => {
    const first = sale('alpha', 1, { price: 10 });
    const duplicate = sale('alpha', 1, { price: 3 });
    const other = sale('alpha', 2);
    const result = await repo.applySourceSnapshot(
      'alpha',
      'alpha',
      [first, duplicate, other],
      1_000,
    );

    expect(result).toEqual({ upserted: 2, pricePointsAdded: 2, deactivated: 0 });
    expect((await repo.findById(first.sale_id))!.new_price).toBe(10);
    expect(pointsOf(first.sale_id)).toEqual([{ observed_at: 1_000, price: 10 }]);
  });

  it('ignores a price change at an already used runAt (callers guarantee a monotonic runAt)', async () => {
    const id = idOf('alpha', 1);
    await snapshot('alpha', [1], 1_000, 10);
    await snapshot('alpha', [1], 2_000, 7);

    const result = await snapshot('alpha', [1], 2_000, 5);

    expect(result.pricePointsAdded).toBe(0);
    expect(pointsOf(id)).toEqual([
      { observed_at: 1_000, price: 10 },
      { observed_at: 2_000, price: 7 },
    ]);
  });

  it('writes a 1,500 item snapshot with a constant number of statements', async () => {
    await snapshot('alpha', range(1, 1_400), 1_000, 10);
    const items = range(101, 1_600).map((n) =>
      sale('alpha', n, { price: n % 3 === 0 ? 7 : 10, scrapedAt: 2_000 }),
    );

    const sqlite = getSqlite();
    const prepare = sqlite.prepare.bind(sqlite);
    let statements = 0;
    const spy = vi.spyOn(sqlite, 'prepare').mockImplementation(((source: string) => {
      statements++;
      return prepare(source);
    }) as unknown as typeof sqlite.prepare);

    let result: Awaited<ReturnType<typeof repo.applySourceSnapshot>> | undefined;
    const started = performance.now();
    try {
      result = await repo.applySourceSnapshot('alpha', 'alpha', items, 2_000);
    } finally {
      spy.mockRestore();
    }
    const elapsed = performance.now() - started;

    expect(statements).toBeLessThanOrEqual(8);
    expect(elapsed).toBeLessThan(1_000);
    const changed = range(101, 1_400).filter((n) => n % 3 === 0).length;
    expect(result).toEqual({ upserted: 1_500, pricePointsAdded: changed + 200, deactivated: 100 });
    expect(activeIds('alpha')).toHaveLength(1_500);
  });

  it('upserts, records prices and deactivates a mixed large snapshot like single writes', async () => {
    const price = (n: number, run: number) => (run === 2 && n % 2 === 0 ? 9.99 : 19.95);
    const write = (ns: number[], run: number) =>
      repo.applySourceSnapshot(
        'alpha',
        'alpha',
        ns.map((n) => sale('alpha', n, { price: price(n, run), scrapedAt: run * 1_000 - 50 })),
        run * 1_000,
      );

    await write(range(1, 300), 1);
    const second = await write([...range(1, 200), ...range(301, 400)], 2);

    const changed = range(1, 200).filter((n) => n % 2 === 0);
    expect(second).toEqual({
      upserted: 300,
      pricePointsAdded: changed.length + 100,
      deactivated: 100,
    });

    const unchanged = (await repo.findById(idOf('alpha', 1)))!;
    expect(unchanged).toMatchObject({
      first_seen_at: 1_000,
      last_seen_at: 2_000,
      scraped_at: 1_950,
      new_price: 19.95,
      active: 1,
    });
    expect(pointsOf(idOf('alpha', 1))).toEqual([{ observed_at: 1_000, price: 19.95 }]);

    expect((await repo.findById(idOf('alpha', 2)))!.new_price).toBe(9.99);
    expect(pointsOf(idOf('alpha', 2))).toEqual([
      { observed_at: 1_000, price: 19.95 },
      { observed_at: 2_000, price: 9.99 },
    ]);

    expect(await repo.findById(idOf('alpha', 250))).toMatchObject({
      first_seen_at: 1_000,
      last_seen_at: 1_000,
      active: 0,
    });
    expect(await repo.findById(idOf('alpha', 350))).toMatchObject({
      first_seen_at: 2_000,
      last_seen_at: 2_000,
      active: 1,
    });
    expect(pointsOf(idOf('alpha', 350))).toEqual([{ observed_at: 2_000, price: 9.99 }]);
    expect(activeIds('alpha')).toHaveLength(300);
  });

  it('updates items but adds no price point when runAt collides on a large snapshot', async () => {
    await snapshot('alpha', range(1, 200), 1_000, 10);
    await snapshot('alpha', range(1, 200), 2_000, 7);

    const result = await snapshot('alpha', range(1, 200), 2_000, 5);

    expect(result).toEqual({ upserted: 200, pricePointsAdded: 0, deactivated: 0 });
    for (const n of [1, 100, 200]) {
      expect((await repo.findById(idOf('alpha', n)))!.new_price).toBe(5);
      expect(pointsOf(idOf('alpha', n))).toEqual([
        { observed_at: 1_000, price: 10 },
        { observed_at: 2_000, price: 7 },
      ]);
    }
  });

  it('compares against the newest observed point, not the last inserted one', async () => {
    await snapshot('alpha', [1, 2, 3], 500, 1);
    getSqlite().exec('DELETE FROM sales_price_points');
    const insert = getSqlite().prepare(
      'INSERT INTO sales_price_points (sale_id, observed_at, price) VALUES (?, ?, ?)',
    );
    const history: [number, [number, number][]][] = [
      [
        1,
        [
          [1_000, 5],
          [3_000, 9],
          [2_000, 7],
        ],
      ],
      [
        2,
        [
          [1_000, 5],
          [3_000, 9],
          [2_000, 7],
        ],
      ],
      [
        3,
        [
          [3_000, 4],
          [1_000, 9],
        ],
      ],
    ];
    for (const [n, points] of history) {
      for (const [at, price] of points) insert.run(idOf('alpha', n), at, price);
    }

    const result = await repo.applySourceSnapshot(
      'alpha',
      'alpha',
      [
        sale('alpha', 1, { price: 7 }),
        sale('alpha', 2, { price: 9 }),
        sale('alpha', 3, { price: 9 }),
      ],
      4_000,
    );

    expect(result.pricePointsAdded).toBe(2);
    expect(pointsOf(idOf('alpha', 1)).at(-1)).toEqual({ observed_at: 4_000, price: 7 });
    expect(pointsOf(idOf('alpha', 2)).at(-1)).toEqual({ observed_at: 3_000, price: 9 });
    expect(pointsOf(idOf('alpha', 3)).at(-1)).toEqual({ observed_at: 4_000, price: 9 });
  });

  it('trims only sales above the cap and keeps their newest points', async () => {
    const cap = getConfig().sales.pricePointsMax;
    await snapshot('alpha', range(1, 100), 500, 1);
    getSqlite().exec('DELETE FROM sales_price_points');
    const insert = getSqlite().prepare(
      'INSERT INTO sales_price_points (sale_id, observed_at, price) VALUES (?, ?, ?)',
    );
    for (const n of range(1, 100)) {
      const count = n <= 50 ? cap : cap - 1;
      for (let k = 1; k <= count; k++) insert.run(idOf('alpha', n), k * 1_000, k);
    }

    await snapshot('alpha', range(1, 100), 100_000, 0.5);

    const full = pointsOf(idOf('alpha', 10));
    expect(full).toHaveLength(cap);
    expect(full[0].observed_at).toBe(2_000);
    expect(full.at(-1)).toEqual({ observed_at: 100_000, price: 0.5 });
    const below = pointsOf(idOf('alpha', 60));
    expect(below).toHaveLength(cap);
    expect(below[0].observed_at).toBe(1_000);
  });

  it("never touches another source's items", async () => {
    await snapshot('alpha', [1, 2], 1_000);
    await snapshot('beta', [1, 2], 1_000);
    await snapshot('alpha', [1], 2_000);

    expect(activeIds('beta').sort()).toEqual([idOf('beta', 1), idOf('beta', 2)].sort());
    expect((await repo.findById(idOf('beta', 1)))!.last_seen_at).toBe(1_000);
  });
});

describe('pageActive', () => {
  it('walks more than 250 items with many equal first_seen_at values completely and in order', async () => {
    await snapshot('alpha', range(1, 160), 1_000);
    await snapshot('beta', range(1, 140), 1_000);
    await snapshot('gamma', range(1, 20), 2_000);
    await snapshot('alpha', range(1, 150), 3_000);

    const expected = (
      getSqlite()
        .prepare('SELECT sale_id, first_seen_at FROM sales_items WHERE active = 1')
        .all() as { sale_id: string; first_seen_at: number }[]
    ).sort((a, b) =>
      a.first_seen_at !== b.first_seen_at
        ? b.first_seen_at - a.first_seen_at
        : a.sale_id < b.sale_id
          ? 1
          : -1,
    );
    expect(expected).toHaveLength(310);

    for (const limit of [100, 7]) {
      const rows = await walk(limit);
      expect(rows.map((r) => r.sale_id)).toEqual(expected.map((r) => r.sale_id));
      expect(new Set(rows.map((r) => r.sale_id)).size).toBe(310);
    }
  });

  it('issues cursors carrying a numeric first_seen_at and a text sale_id', async () => {
    await snapshot('alpha', range(1, 3), 1_000);
    const page = await repo.pageActive({ limit: 2, cursor: null });
    expect(page.items).toHaveLength(2);

    const cursor = decodeCursor(page.nextCursor!, SALES_SORT, SALES_CURSOR_TYPES);
    expect(cursor).toEqual({ s: SALES_SORT, v: 1_000, id: page.items[1].sale_id });
    expect(encodeCursor(cursor)).toBe(page.nextCursor);

    const rest = await repo.pageActive({ limit: 2, cursor });
    expect(rest.items).toHaveLength(1);
    expect(rest.nextCursor).toBeNull();

    const numericId = encodeCursor({ s: SALES_SORT, v: 1_000, id: 5 });
    expect(() => decodeCursor(numericId, SALES_SORT, SALES_CURSOR_TYPES)).toThrow();
  });

  it('runs on idx_sales_active_first_seen without a temporary sort', async () => {
    for (let s = 0; s < 5; s++) await snapshot(`shop${s}`, range(1, 80), 1_000 + (s % 2) * 1_000);
    getSqlite().exec('ANALYZE');

    const sqlite = getSqlite();
    const prepare = sqlite.prepare.bind(sqlite);
    const captured: { sql: string; params: unknown[] }[] = [];
    const spy = vi.spyOn(sqlite, 'prepare').mockImplementation(((source: string) => {
      const statement = prepare(source);
      if (!source.includes('"sales_items"')) return statement;
      return new Proxy(statement, {
        get(target, prop) {
          if (prop === 'all') {
            return (...args: unknown[]) => {
              captured.push({ sql: source, params: args.flat() });
              return (target.all as (...a: unknown[]) => unknown[])(...args);
            };
          }
          const value: unknown = Reflect.get(target, prop, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    }) as unknown as typeof sqlite.prepare);

    try {
      const first = await repo.pageActive({ limit: 50, cursor: null });
      await repo.pageActive({
        limit: 50,
        cursor: decodeCursor(first.nextCursor!, SALES_SORT, SALES_CURSOR_TYPES),
      });
    } finally {
      spy.mockRestore();
    }

    expect(captured).toHaveLength(2);
    for (const { sql, params } of captured) {
      expect(sql).toMatch(/active = 1/);
      const detail = (prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { detail: string }[])
        .map((r) => r.detail)
        .join('\n');
      expect(detail).toMatch(/USING (COVERING )?INDEX idx_sales_active_first_seen\b/);
      expect(detail).not.toContain('TEMP B-TREE');
    }
  });
});

describe('summary', () => {
  it('counts active items, new ones since a time and the latest refresh', async () => {
    expect(await repo.summary(0)).toEqual({
      total: 0,
      new_since: 0,
      refreshed_at: null,
      latest_first_seen_at: null,
    });

    await snapshot('alpha', [1, 2, 3], 1_000);
    await snapshot('alpha', [1, 2], 1_500);
    await snapshot('beta', [1, 2], 3_000);

    expect(await repo.summary(1_000)).toEqual({
      total: 4,
      new_since: 2,
      refreshed_at: 3_000,
      latest_first_seen_at: 3_000,
    });
    expect((await repo.summary(0)).new_since).toBe(4);
    expect((await repo.summary(3_000)).new_since).toBe(0);

    await repo.setSourceState('alpha', { last_success_at: 2_500 });
    expect((await repo.summary(0)).refreshed_at).toBe(2_500);
  });

  it('falls back to the latest last_seen_at when state rows have no last_success_at', async () => {
    await snapshot('alpha', [1], 1_000);
    await snapshot('beta', [1], 3_000);
    await repo.setSourceState('alpha', { last_attempt_at: 9_000 });

    expect((await repo.summary(0)).refreshed_at).toBe(3_000);
  });
});

describe('pruneRetention', () => {
  it('deletes long inactive items with their price points and keeps active items', async () => {
    const now = 1_000 * DAY;
    const retention = getConfig().sales.retentionDays;
    const old = now - (retention + 10) * DAY;

    await snapshot('alpha', [1], now - (PRICE_POINT_RETENTION_DAYS + 20) * DAY, 5);
    await snapshot('alpha', [1, 2], old, 10);
    await snapshot('alpha', [1], old + DAY, 10);
    await snapshot('beta', [1, 2], now - 5 * DAY);
    await snapshot('beta', [1], now - DAY);

    const result = await repo.pruneRetention(now);

    expect(result).toEqual({ items: 1, pricePoints: 1 });
    expect(await repo.findById(idOf('alpha', 2))).toBeNull();
    expect(pointsOf(idOf('alpha', 2))).toEqual([]);
    expect((await repo.findById(idOf('alpha', 1)))!.active).toBe(1);
    expect(pointsOf(idOf('alpha', 1))).toEqual([{ observed_at: old, price: 10 }]);
    expect((await repo.findById(idOf('beta', 2)))!.active).toBe(0);
  });

  it("keeps each item's newest price point however old, and prunes only older ones", async () => {
    const now = 1_000 * DAY;
    const ancient = now - (PRICE_POINT_RETENTION_DAYS + 20) * DAY;

    await snapshot('alpha', [1, 2], ancient, 5);
    await snapshot('alpha', [1, 2], now - 10 * DAY, 5);
    await snapshot('alpha', [2], now - 5 * DAY, 6);

    const result = await repo.pruneRetention(now);

    expect(result).toEqual({ items: 0, pricePoints: 1 });
    expect(pointsOf(idOf('alpha', 1))).toEqual([{ observed_at: ancient, price: 5 }]);
    expect(pointsOf(idOf('alpha', 2))).toEqual([{ observed_at: now - 5 * DAY, price: 6 }]);
  });
});

describe('deactivateSource', () => {
  it('deactivates only the active items of that source and returns the count', async () => {
    await snapshot('alpha', [1, 2, 3], 1_000);
    await snapshot('alpha', [1, 2], 2_000);
    await snapshot('beta', [1, 2], 1_000);

    expect(await repo.deactivateSource('alpha')).toBe(2);
    expect(activeIds('alpha')).toEqual([]);
    expect(activeIds('beta')).toHaveLength(2);
    expect(await repo.deactivateSource('alpha')).toBe(0);
    expect(await repo.deactivateSource('unknown')).toBe(0);
  });
});

describe('source state', () => {
  it('creates the row on first write and patches only the given fields', async () => {
    expect(await repo.getSourceState('alpha')).toBeNull();

    await repo.setSourceState('alpha', { last_attempt_at: 1_000, next_due_at: 5_000 });
    expect(await repo.getSourceState('alpha')).toEqual({
      source_key: 'alpha',
      last_attempt_at: 1_000,
      last_success_at: null,
      consecutive_failures: 0,
      next_due_at: 5_000,
    });

    await repo.setSourceState('alpha', { consecutive_failures: 2, last_success_at: undefined });
    await repo.setSourceState('alpha', {});
    expect(await repo.getSourceState('alpha')).toEqual({
      source_key: 'alpha',
      last_attempt_at: 1_000,
      last_success_at: null,
      consecutive_failures: 2,
      next_due_at: 5_000,
    });
  });
});
