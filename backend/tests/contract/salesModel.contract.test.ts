import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SalesSource } from '../../src/modules/sales/domain/SalesSource';
import type { RawSaleItem } from '../../src/modules/sales/domain/Sale';
import type { SourceHealthTracker } from '../../src/core/scrapeHealth';
import { API, createContractApp, type ContractApp } from './harness';
import { parseSse, ticketFor } from './support';

type Mode = 'ok' | 'throw' | 'hang';

interface Controls {
  catalog: RawSaleItem[];
  mode: Mode;
  fetchCalls: number;
}

const CTL_SELLER = 'Ctl Plants';
const controls: Controls = { catalog: [], mode: 'ok', fetchCalls: 0 };

const raw = (n: number, newPrice = 10, oldPrice: number | null = 20): RawSaleItem => ({
  name: `Plant ${n}`,
  link: `https://shop.example/products/plant-${n}`,
  img: `https://shop.example/img/${n}.jpg`,
  oldPrice,
  newPrice,
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let app: ContractApp;
let tracker: SourceHealthTracker;

const createSources = (_cache: unknown, healthTracker: SourceHealthTracker): SalesSource[] => {
  tracker = healthTracker;
  return [
    {
      key: 'ctl',
      seller: CTL_SELLER,
      priority: 1,
      maxPages: 1,
      useChromium: false,
      fetchPage: async () => {
        controls.fetchCalls++;
        if (controls.mode === 'throw') throw new Error('boom');
        if (controls.mode === 'hang') return new Promise<RawSaleItem[]>(() => {});
        tracker.record({
          key: 'ctl',
          seller: CTL_SELLER,
          kind: 'sales',
          strategy: 'selector',
          usedFallback: false,
          itemCount: controls.catalog.length,
          error: null,
          issues: [],
        });
        return controls.catalog;
      },
    },
    {
      key: 'steady',
      seller: 'Steady Plants',
      priority: 2,
      maxPages: 1,
      useChromium: false,
      fetchPage: async () => {
        controls.fetchCalls++;
        return [raw(900, 5, 10)];
      },
    },
  ];
};

interface StreamedSale {
  sale_id: string;
  sale_name: string;
  sale_seller: string;
  sale_new_price: number;
  sale_first_seen_at: number;
  sale_scraped_at: number;
}

const replay = async (role: 'user' | 'guest' | 'admin' = 'user') => {
  const session = await app.signIn(role);
  const ticket = await ticketFor(app, session.auth);
  const res = await app.client.request({ method: 'get', url: `${API}/sales?ticket=${ticket}` });
  const frames = parseSse(res.text);
  return {
    res,
    frames,
    sales: frames.filter((f) => f.event === 'message').flatMap((f) => f.data as StreamedSale[]),
    done: frames.at(-1),
  };
};

const ctlSales = (sales: StreamedSale[]) => sales.filter((s) => s.sale_seller === CTL_SELLER);

const detail = async (id: string, role: 'user' | 'guest' | 'admin' = 'user') => {
  const session = await app.signIn(role);
  return app.client.request({ method: 'get', url: `${API}/sales/${id}`, headers: session.auth });
};

const summary = async (since?: number) => {
  const session = await app.signIn('user');
  const res = await app.client.request({
    method: 'get',
    url: `${API}/sales/summary${since === undefined ? '' : `?since=${since}`}`,
    headers: session.auth,
  });
  return res.body.data as {
    total: number;
    new_since: number;
    refreshed_at: number | null;
    latest_first_seen_at: number | null;
  };
};

const idOf = (name: string): string =>
  app.db.query<{ sale_id: string }>('SELECT sale_id FROM sales_items WHERE name = ?', [name])[0]
    ?.sale_id as string;

const rowOf = (name: string) =>
  app.db.query<{
    sale_id: string;
    active: number;
    new_price: number;
    first_seen_at: number;
    scraped_at: number;
  }>(
    'SELECT sale_id, active, new_price, first_seen_at, scraped_at FROM sales_items WHERE name = ?',
    [name],
  )[0];

const pointsOf = (name: string) =>
  app.db.query<{ observed_at: number; price: number }>(
    `SELECT observed_at, price FROM sales_price_points
     WHERE sale_id = (SELECT sale_id FROM sales_items WHERE name = ?) ORDER BY observed_at`,
    [name],
  );

const setCatalog = (...items: RawSaleItem[]) => {
  controls.catalog = items;
};

beforeAll(async () => {
  app = await createContractApp({ sales: { createSources } });
});
afterAll(() => app.close());

beforeEach(() => {
  app.db.execute('DELETE FROM sales_items');
  app.db.execute('DELETE FROM sales_source_state');
  controls.mode = 'ok';
  controls.catalog = [];
  controls.fetchCalls = 0;
});

describe('replay after a refresh', () => {
  it('delivers exactly the active items, newest first_seen then sale_id descending, then done with the total', async () => {
    setCatalog(raw(1), raw(2), raw(3));
    await app.refreshSales();
    await sleep(5);
    setCatalog(raw(1), raw(2), raw(3), raw(4), raw(5));
    await app.refreshSales();

    const { res, sales, done } = await replay();
    expect(res.status).toBe(200);
    expect(done).toEqual({ event: 'done', data: { total: sales.length } });
    expect(sales).toHaveLength(6);

    const stored = app.db.query<{ sale_id: string; first_seen_at: number }>(
      'SELECT sale_id, first_seen_at FROM sales_items WHERE active = 1',
    );
    const expected = [...stored].sort(
      (a, b) =>
        b.first_seen_at - a.first_seen_at ||
        (a.sale_id < b.sale_id ? 1 : a.sale_id > b.sale_id ? -1 : 0),
    );
    expect(sales.map((s) => s.sale_id)).toEqual(expected.map((r) => r.sale_id));

    const names = ctlSales(sales).map((s) => s.sale_name);
    expect(new Set(names.slice(0, 2))).toEqual(new Set(['Plant 4', 'Plant 5']));
    expect(sales.at(-1)!.sale_first_seen_at).toBeLessThan(sales[0].sale_first_seen_at);
  });

  it('streams first_seen_at and scraped_at as the stored epoch milliseconds', async () => {
    setCatalog(raw(1));
    const before = Date.now();
    await app.refreshSales();
    const { sales } = await replay();
    const sale = ctlSales(sales)[0];
    const row = rowOf('Plant 1');
    expect(sale.sale_first_seen_at).toBe(row.first_seen_at);
    expect(sale.sale_scraped_at).toBe(row.scraped_at);
    expect(sale.sale_first_seen_at).toBeGreaterThanOrEqual(before);
    expect(sale.sale_scraped_at).toBeGreaterThanOrEqual(before);
    expect(sale.sale_scraped_at).toBeLessThanOrEqual(Date.now());
  });
});

describe('price history', () => {
  it('adds exactly one price point on a change, keeps first_seen_at, and adds none when unchanged', async () => {
    setCatalog(raw(1, 10));
    await app.refreshSales();
    const firstSeen = rowOf('Plant 1').first_seen_at;
    const id = idOf('Plant 1');
    expect((await detail(id)).body.data.history.map((p: { price: number }) => p.price)).toEqual([
      10,
    ]);

    await sleep(5);
    setCatalog(raw(1, 8));
    await app.refreshSales();
    const changed = await detail(id);
    expect(changed.body.data.history.map((p: { price: number }) => p.price)).toEqual([10, 8]);
    expect(changed.body.data.sale_new_price).toBe(8);
    expect(changed.body.data.sale_first_seen_at).toBe(firstSeen);
    const scrapedAfterChange = changed.body.data.sale_scraped_at as number;

    await sleep(5);
    await app.refreshSales();
    const unchanged = await detail(id);
    expect(unchanged.body.data.history).toHaveLength(2);
    expect(unchanged.body.data.sale_first_seen_at).toBe(firstSeen);
    expect(unchanged.body.data.sale_scraped_at).toBeGreaterThan(scrapedAfterChange);
  });

  it('bounds the history in the detail to the latest 30 points, ascending, after many price changes', async () => {
    for (let i = 0; i < 35; i++) {
      setCatalog(raw(1, 100 - i));
      await app.refreshSales();
    }
    const res = await detail(idOf('Plant 1'));
    const history = res.body.data.history as Array<{ price: number; observed_at: number }>;
    expect(history).toHaveLength(30);
    const times = history.map((p) => p.observed_at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(30);
    expect(history.at(-1)!.price).toBe(100 - 34);
    expect(history[0].price).toBe(100 - 5);
  });
});

describe('source failures and snapshots', () => {
  it('keeps the items of a failing source active and updates them on a later success', async () => {
    setCatalog(raw(1, 10), raw(2, 10));
    await app.refreshSales();
    const before = (await replay()).sales.map((s) => s.sale_id);

    controls.mode = 'throw';
    const outcomes = await app.refreshSales();
    expect(outcomes.find((o) => o.sourceKey === 'ctl')!.status).toBe('failed');
    const during = await replay();
    expect(during.sales.map((s) => s.sale_id)).toEqual(before);
    expect(ctlSales(during.sales).every((s) => s.sale_new_price === 10)).toBe(true);
    expect(rowOf('Plant 1').active).toBe(1);

    controls.mode = 'ok';
    setCatalog(raw(1, 7), raw(2, 10));
    await app.refreshSales();
    const after = await replay();
    expect(ctlSales(after.sales).find((s) => s.sale_name === 'Plant 1')!.sale_new_price).toBe(7);
    expect(after.sales).toHaveLength(before.length);
  });

  it('deactivates items missing from a complete snapshot but still answers GET /sales/:id for them', async () => {
    setCatalog(raw(1), raw(2));
    await app.refreshSales();
    const goneId = idOf('Plant 2');

    setCatalog(raw(1));
    await app.refreshSales();
    const { sales, done } = await replay();
    expect(sales.map((s) => s.sale_id)).not.toContain(goneId);
    expect(done!.data).toEqual({ total: sales.length });
    expect(rowOf('Plant 2').active).toBe(0);

    const res = await detail(goneId, 'guest');
    expect(res.status).toBe(200);
    expect(res.body.data.sale_id).toBe(goneId);
    expect(res.body.data.history).toHaveLength(1);

    setCatalog(raw(1), raw(2));
    await app.refreshSales();
    expect(rowOf('Plant 2').active).toBe(1);
    expect((await replay()).sales.map((s) => s.sale_id)).toContain(goneId);
  });

  it('does not deactivate anything on an empty snapshot', async () => {
    setCatalog(raw(1), raw(2));
    await app.refreshSales();
    const before = (await replay()).sales.map((s) => s.sale_id);

    setCatalog();
    const outcomes = await app.refreshSales();
    expect(outcomes.find((o) => o.sourceKey === 'ctl')!.status).toBe('empty');
    expect((await replay()).sales.map((s) => s.sale_id)).toEqual(before);
    expect(rowOf('Plant 1').active).toBe(1);
  });
});

describe('GET /sales never scrapes', () => {
  it('answers within the request and makes zero fetchPage calls even when a source throws or hangs', async () => {
    setCatalog(raw(1));
    await app.refreshSales();
    const calls = controls.fetchCalls;
    const expected = (await replay()).sales.map((s) => s.sale_id);

    for (const mode of ['throw', 'hang'] as const) {
      controls.mode = mode;
      const started = Date.now();
      const { frames, sales } = await replay();
      expect(Date.now() - started).toBeLessThan(2000);
      expect(frames.some((f) => f.event === 'error')).toBe(false);
      expect(frames.at(-1)!.event).toBe('done');
      expect(sales.map((s) => s.sale_id)).toEqual(expected);
    }
    expect(controls.fetchCalls).toBe(calls);
  });

  it('answers an empty replay with only done when nothing has been refreshed yet', async () => {
    const { frames, sales } = await replay();
    expect(sales).toEqual([]);
    expect(frames).toEqual([{ event: 'done', data: { total: 0 } }]);
    expect(controls.fetchCalls).toBe(0);
  });
});

describe('summary', () => {
  it('counts items first seen after since and advances refreshed_at with a refresh', async () => {
    setCatalog(raw(1));
    await app.refreshSales();
    const first = await summary(0);
    expect(first).toMatchObject({ total: 2, new_since: 2 });
    expect(first.refreshed_at).toEqual(expect.any(Number));

    await sleep(10);
    const since = Date.now();
    await sleep(10);
    setCatalog(raw(1), raw(2), raw(3));
    await app.refreshSales();

    const second = await summary(since);
    expect(second).toMatchObject({ total: 4, new_since: 2 });
    expect(second.refreshed_at!).toBeGreaterThan(first.refreshed_at!);
    expect(second.latest_first_seen_at!).toBeGreaterThan(since);
    expect(await summary(second.latest_first_seen_at!)).toMatchObject({ new_since: 0 });
  });

  it('lets guests read summary, detail and replay but not recheck', async () => {
    setCatalog(raw(1));
    await app.refreshSales();
    const guest = await app.signIn('guest');
    const id = idOf('Plant 1');

    const sum = await app.client.request({
      method: 'get',
      url: `${API}/sales/summary`,
      headers: guest.auth,
    });
    expect(sum.status).toBe(200);
    expect((await detail(id, 'guest')).status).toBe(200);
    const streamed = await replay('guest');
    expect(streamed.res.status).toBe(200);
    expect(streamed.done!.event).toBe('done');

    const recheck = await app.client.request({
      method: 'post',
      url: `${API}/sales/health/ctl/check`,
      headers: guest.auth,
    });
    expect(recheck.status).toBe(403);
    expect(controls.fetchCalls).toBe(2);
  });
});

describe('admin recheck', () => {
  it('re-scrapes through the refresher, updates the stored items and keeps the health payload', async () => {
    setCatalog(raw(1, 10));
    await app.refreshSales();
    setCatalog(raw(1, 6), raw(2, 10));

    const admin = await app.signIn('admin');
    const res = await app.client.request({
      method: 'post',
      url: `${API}/sales/health/ctl/check`,
      headers: admin.auth,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      source_key: 'ctl',
      kind: 'sales',
      seller: CTL_SELLER,
      active_strategy: 'selector',
      last_item_count: 2,
      issues: [],
    });

    expect(rowOf('Plant 1').new_price).toBe(6);
    expect(pointsOf('Plant 1').map((p) => p.price)).toEqual([10, 6]);
    expect(rowOf('Plant 2').active).toBe(1);
    expect(
      ctlSales((await replay()).sales)
        .map((s) => s.sale_name)
        .sort(),
    ).toEqual(['Plant 1', 'Plant 2']);
  });

  it('answers 403 for users and guests without scraping', async () => {
    const calls = controls.fetchCalls;
    for (const role of ['user', 'guest'] as const) {
      const session = await app.signIn(role);
      const res = await app.client.request({
        method: 'post',
        url: `${API}/sales/health/ctl/check`,
        headers: session.auth,
      });
      expect(res.status, role).toBe(403);
    }
    expect(controls.fetchCalls).toBe(calls);
  });
});
