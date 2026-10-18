import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SalesSource } from '../../src/modules/sales/domain/SalesSource';
import type { RawSaleItem } from '../../src/modules/sales/domain/Sale';
import type { SalesRefresher } from '../../src/modules/sales/application/SalesRefresher';
import { API, createContractApp, type ContractApp } from './harness';
import { parseSse, ticketFor } from './support';

/** 'ok' answers the items, 'throw' rejects, 'hang' never settles. */
type SourceMode = 'ok' | 'throw' | 'hang';
let mode: SourceMode = 'ok';
let fetchCalls = 0;

const fakeSource = (
  key: string,
  seller: string,
  items: RawSaleItem[],
  options: { fail?: boolean; maxPages?: number } = {},
): SalesSource => ({
  key,
  seller,
  priority: 1,
  maxPages: options.maxPages ?? 1,
  useChromium: false,
  fetchPage: async () => {
    fetchCalls++;
    if (options.fail || mode === 'throw') throw new Error('boom');
    if (mode === 'hang') return new Promise<RawSaleItem[]>(() => {});
    return items;
  },
});

const item = (n: number, extra: Partial<RawSaleItem> = {}): RawSaleItem => ({
  name: `Plant ${n}`,
  link: `https://shop.example/products/plant-${n}`,
  img: `https://shop.example/img/${n}.jpg`,
  oldPrice: 20,
  newPrice: 10,
  ...extra,
});

/** Opens the stream the way the client does: ticket first, then GET with ?ticket=. */
const openStream = async (role: 'user' | 'guest' | 'admin' = 'user') => {
  const session = await app.signIn(role);
  const ticket = await ticketFor(app, session.auth);
  return app.client.request({ method: 'get', url: `${API}/sales?ticket=${ticket}` });
};

const salesIn = (text: string) =>
  parseSse(text)
    .filter((f) => f.event === 'message')
    .flatMap((f) => f.data as Array<Record<string, unknown>>);

const activeIds = () =>
  app.db
    .query<{
      sale_id: string;
    }>('SELECT sale_id FROM sales_items WHERE active = 1 ORDER BY first_seen_at DESC, sale_id DESC')
    .map((r) => r.sale_id);

const insertSale = (
  saleId: string,
  { active = 1, firstSeenAt = 1_000 }: { active?: number; firstSeenAt?: number } = {},
) =>
  app.db.execute(
    `INSERT INTO sales_items (sale_id, source_key, seller, name, link, image_url, old_price,
       new_price, discount_pct, first_seen_at, last_seen_at, scraped_at, active)
     VALUES (?, 'fixture', 'Fixture Plants', ?, ?, NULL, NULL, 5, NULL, ?, ?, ?, ?)`,
    [
      saleId,
      `Fixture ${saleId}`,
      `https://fixture.example/${saleId}`,
      firstSeenAt,
      firstSeenAt,
      firstSeenAt,
      active,
    ],
  );

let app: ContractApp;
let refresher: SalesRefresher;

beforeAll(async () => {
  app = await createContractApp({
    sales: {
      onRefresher: (built) => {
        refresher = built;
      },
      createSources: (_cache, tracker) => [
        fakeSource('alpha', 'Alpha Plants', [
          item(1),
          item(2),
          item(2),
          item(3, { link: null }),
          item(4, { newPrice: null }),
          item(6, { newPrice: Number.POSITIVE_INFINITY }),
        ]),
        fakeSource('beta', 'Beta Plants', [item(1), item(5)]),
        fakeSource('broken', 'Broken Plants', [], { fail: true }),
        {
          ...fakeSource('reporting', 'Reporting Plants', []),
          fetchPage: async () => {
            tracker.record({
              key: 'reporting',
              seller: 'Reporting Plants',
              kind: 'sales',
              strategy: 'selector',
              usedFallback: true,
              itemCount: 0,
              error: 'shopifyJson: unexpected response',
              issues: [{ code: 'images_missing', affected: 1, total: 2 }],
            });
            return [];
          },
        },
      ],
    },
  });
  await app.refreshSales();
});
afterAll(() => app.close());

describe('GET /sales (SSE replay)', () => {
  it('streams the stored active sales followed by a done event with the total', async () => {
    const res = await openStream();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['x-accel-buffering']).toBe('no');

    const frames = parseSse(res.text);
    const done = frames.at(-1)!;
    expect(done.event).toBe('done');
    const sales = salesIn(res.text);
    expect(done.data).toEqual({ total: sales.length });
    expect(sales.map((s) => `${s.sale_seller}:${s.sale_name}`).sort()).toEqual([
      'Alpha Plants:Plant 1',
      'Alpha Plants:Plant 2',
      'Beta Plants:Plant 1',
      'Beta Plants:Plant 5',
    ]);
    expect(sales.map((s) => s.sale_id)).toEqual(activeIds());
  });

  it('shapes each sale as the stored DTO with epoch millisecond times', async () => {
    const res = await openStream();
    const first = salesIn(res.text).find((s) => s.sale_name === 'Plant 2')!;
    expect(first).toEqual({
      sale_id: expect.stringMatching(/^[0-9a-f]{40}$/),
      sale_name: 'Plant 2',
      sale_seller: 'Alpha Plants',
      sale_link: 'https://shop.example/products/plant-2',
      sale_image_url: 'https://shop.example/img/2.jpg',
      sale_old_price: 20,
      sale_new_price: 10,
      sale_discount_pct: 50,
      sale_first_seen_at: expect.any(Number),
      sale_scraped_at: expect.any(Number),
    });
    expect(first.sale_first_seen_at as number).toBeGreaterThan(1_600_000_000_000);
    expect(first.sale_scraped_at as number).toBeGreaterThan(1_600_000_000_000);
    const again = await openStream();
    expect(salesIn(again.text).map((s) => s.sale_id)).toContain(first.sale_id);
  });

  it('never scrapes during the request, even when every source throws or hangs', async () => {
    const before = fetchCalls;
    const spy = vi.spyOn(refresher, 'refreshSource');
    try {
      for (const next of ['throw', 'hang'] as const) {
        mode = next;
        const res = await openStream();
        const frames = parseSse(res.text);
        expect(frames.some((f) => f.event === 'error')).toBe(false);
        expect(frames.at(-1)!.event).toBe('done');
        expect(salesIn(res.text).map((s) => s.sale_id)).toEqual(activeIds());
      }
      expect(fetchCalls).toBe(before);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      mode = 'ok';
      spy.mockRestore();
    }
  });

  it('pages through more rows than one replay page, newest first and without inactive rows', async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `bulk-${String(i).padStart(3, '0')}`);
    // Every tenth row shares one first_seen_at so ties cross page boundaries.
    ids.forEach((id, i) =>
      insertSale(id, { firstSeenAt: i % 10 === 0 ? 5_000 : 10_000 + i, active: i % 7 ? 1 : 0 }),
    );
    try {
      const res = await openStream();
      const streamed = salesIn(res.text).map((s) => s.sale_id as string);
      const expected = activeIds();
      expect(streamed).toEqual(expected);
      expect(new Set(streamed).size).toBe(streamed.length);
      expect(streamed.some((id) => ids.filter((_, i) => i % 7 === 0).includes(id))).toBe(false);
      expect(parseSse(res.text).at(-1)!.data).toEqual({ total: expected.length });
    } finally {
      app.db.execute(`DELETE FROM sales_items WHERE sale_id LIKE 'bulk-%'`);
    }
  });
});

describe('GET /sales/summary', () => {
  it('answers the counts and refresh times with a private revalidation header', async () => {
    const user = await app.signIn('user');
    const res = await app.client.request({
      method: 'get',
      url: `${API}/sales/summary`,
      headers: user.auth,
    });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-cache');
    expect(res.body).toEqual({
      data: {
        total: 4,
        new_since: 4,
        refreshed_at: expect.any(Number),
        latest_first_seen_at: expect.any(Number),
      },
    });

    const later = await app.client.request({
      method: 'get',
      url: `${API}/sales/summary?since=${res.body.data.latest_first_seen_at}`,
      headers: user.auth,
    });
    expect(later.body.data).toMatchObject({ total: 4, new_since: 0 });
  });

  it('rejects a since that is not a non-negative integer', async () => {
    const user = await app.signIn('user');
    for (const since of ['-1', 'abc', '1.5', '', '1e3', '99999999999999999999']) {
      const res = await app.client.request({
        method: 'get',
        url: `${API}/sales/summary?since=${encodeURIComponent(since)}`,
        headers: user.auth,
      });
      expect(res.status, since).toBe(400);
    }
  });

  it('lets guests read it and answers 401 without a token', async () => {
    const guest = await app.signIn('guest');
    const res = await app.client.request({
      method: 'get',
      url: `${API}/sales/summary`,
      headers: guest.auth,
    });
    expect(res.status).toBe(200);
    expect((await app.client.request({ method: 'get', url: `${API}/sales/summary` })).status).toBe(
      401,
    );
  });
});

describe('GET /sales/:id', () => {
  it('answers the sale with its price history', async () => {
    const [id] = activeIds();
    const user = await app.signIn('user');
    const res = await app.client.request({
      method: 'get',
      url: `${API}/sales/${id}`,
      headers: user.auth,
    });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-cache');
    expect(res.body.data).toEqual({
      sale_id: id,
      sale_name: expect.any(String),
      sale_seller: expect.any(String),
      sale_link: expect.any(String),
      sale_image_url: expect.any(String),
      sale_old_price: 20,
      sale_new_price: 10,
      sale_discount_pct: 50,
      sale_first_seen_at: expect.any(Number),
      sale_scraped_at: expect.any(Number),
      history: [{ price: 10, observed_at: expect.any(Number) }],
    });
  });

  it('includes inactive sales and bounds the history to the latest 30 points, oldest first', async () => {
    insertSale('inactive-fixture', { active: 0 });
    for (let i = 1; i <= 40; i++) {
      app.db.execute(
        'INSERT INTO sales_price_points (sale_id, observed_at, price) VALUES (?, ?, ?)',
        ['inactive-fixture', i * 1_000, 50 - i],
      );
    }
    try {
      const guest = await app.signIn('guest');
      const res = await app.client.request({
        method: 'get',
        url: `${API}/sales/inactive-fixture`,
        headers: guest.auth,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.sale_id).toBe('inactive-fixture');
      const history = res.body.data.history as Array<{ price: number; observed_at: number }>;
      expect(history).toHaveLength(30);
      expect(history.map((p) => p.observed_at)).toEqual(
        Array.from({ length: 30 }, (_, i) => (i + 11) * 1_000),
      );
      expect(history[0].price).toBe(39);
    } finally {
      app.db.execute(`DELETE FROM sales_items WHERE sale_id = 'inactive-fixture'`);
    }
  });

  it('answers 404 for an unknown sale and 401 without a token', async () => {
    const user = await app.signIn('user');
    const res = await app.client.request({
      method: 'get',
      url: `${API}/sales/${'0'.repeat(40)}`,
      headers: user.auth,
    });
    expect(res.status).toBe(404);
    expect((await app.client.request({ method: 'get', url: `${API}/sales/abc` })).status).toBe(401);
  });
});

describe('GET /sales/health', () => {
  it('lists every source with its health for an admin', async () => {
    const admin = await app.signIn('admin');
    const res = await app.client.request({
      method: 'get',
      url: `${API}/sales/health`,
      headers: admin.auth,
    });
    expect(res.status).toBe(200);
    const keys = res.body.data.map((r: { source_key: string }) => r.source_key);
    expect(keys).toEqual(expect.arrayContaining(['alpha', 'beta', 'broken', 'reporting']));
    const alpha = res.body.data.find((r: { source_key: string }) => r.source_key === 'alpha');
    expect(alpha).toEqual({
      source_key: 'alpha',
      kind: 'sales',
      seller: 'Alpha Plants',
      status: 'unknown',
      active_strategy: null,
      last_item_count: null,
      consecutive_failures: 0,
      last_success_at: null,
      last_failure_at: null,
      last_error: null,
      issues: [],
      updated_at: expect.any(String),
    });
  });

  it('answers 401 without a token and 403 for non-admins', async () => {
    expect((await app.client.request({ method: 'get', url: `${API}/sales/health` })).status).toBe(
      401,
    );
    const user = await app.signIn('user');
    const res = await app.client.request({
      method: 'get',
      url: `${API}/sales/health`,
      headers: user.auth,
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /sales/health/:key/check', () => {
  it('re-scrapes one source through the refresher and answers its updated health row', async () => {
    const spy = vi.spyOn(refresher, 'refreshSource');
    try {
      const admin = await app.signIn('admin');
      const res = await app.client.request({
        method: 'post',
        url: `${API}/sales/health/reporting/check`,
        headers: admin.auth,
      });
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('reporting');
      expect(res.body.data).toMatchObject({
        source_key: 'reporting',
        status: 'degraded',
        active_strategy: 'selector',
        last_error: 'shopifyJson: unexpected response',
        issues: [{ code: 'images_missing', affected: 1, total: 2 }],
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('answers 502 when the source fails and never recorded a health row', async () => {
    const admin = await app.signIn('admin');
    const res = await app.client.request({
      method: 'post',
      url: `${API}/sales/health/broken/check`,
      headers: admin.auth,
    });
    expect(res.status).toBe(502);
  });

  it('answers 404 for unknown and search keys', async () => {
    const admin = await app.signIn('admin');
    for (const key of ['nope', 'search:jungleLeaves']) {
      const res = await app.client.request({
        method: 'post',
        url: `${API}/sales/health/${encodeURIComponent(key)}/check`,
        headers: admin.auth,
      });
      expect(res.status, key).toBe(404);
    }
  });

  it('answers 403 for non-admins and guests', async () => {
    for (const role of ['user', 'guest'] as const) {
      const session = await app.signIn(role);
      const res = await app.client.request({
        method: 'post',
        url: `${API}/sales/health/alpha/check`,
        headers: session.auth,
      });
      expect(res.status, role).toBe(403);
    }
  });
});

describe('ticket authentication', () => {
  it('answers 401 without a ticket', async () => {
    const res = await app.client.request({ method: 'get', url: `${API}/sales` });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('No authentication ticket provided');
  });

  it('answers 401 for an unknown ticket', async () => {
    const res = await app.client.request({ method: 'get', url: `${API}/sales?ticket=nope` });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid or expired ticket');
  });

  it('burns the ticket on first use', async () => {
    const session = await app.signIn('user');
    const ticket = await ticketFor(app, session.auth);
    const url = `${API}/sales?ticket=${ticket}`;
    expect((await app.client.request({ method: 'get', url })).status).toBe(200);
    expect((await app.client.request({ method: 'get', url })).status).toBe(401);
  });

  it('lets guests stream with their ticket', async () => {
    const res = await openStream('guest');
    expect(res.status).toBe(200);
    expect(parseSse(res.text).at(-1)!.event).toBe('done');
  });

  it('lets the seeded guest with user id 0 stream', async () => {
    const guest = app.session({ id: 0, username: 'guest', role: 'guest' });
    const ticket = await ticketFor(app, guest.auth);
    const res = await app.client.request({ method: 'get', url: `${API}/sales?ticket=${ticket}` });
    expect(res.status).toBe(200);
  });
});
