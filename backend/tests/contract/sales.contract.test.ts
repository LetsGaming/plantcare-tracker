import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SalesSource } from '../../src/modules/sales/domain/SalesSource';
import type { RawSaleItem } from '../../src/modules/sales/domain/Sale';
import { API, createContractApp, type ContractApp } from './harness';
import { parseSse, ticketFor } from './support';

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
    if (options.fail) throw new Error('boom');
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

let app: ContractApp;

beforeAll(async () => {
  app = await createContractApp({
    sales: {
      createSources: (_cache, tracker) => [
        fakeSource('alpha', 'Alpha Plants', [
          item(1),
          item(2),
          item(2),
          item(3, { link: null }),
          item(4, { newPrice: null }),
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
            });
            return [];
          },
        },
      ],
    },
  });
});
afterAll(() => app.close());

describe('GET /sales (SSE)', () => {
  it('streams deduplicated sale batches followed by a done event with the total', async () => {
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
  });

  it('shapes each sale with a stable id and seller', async () => {
    const res = await openStream();
    const first = salesIn(res.text).find((s) => s.sale_name === 'Plant 2')!;
    expect(first).toEqual({
      sale_id: expect.stringMatching(/^[0-9a-f]+$/),
      sale_name: 'Plant 2',
      sale_seller: 'Alpha Plants',
      sale_link: 'https://shop.example/products/plant-2',
      sale_image_url: 'https://shop.example/img/2.jpg',
      sale_old_price: 20,
      sale_new_price: 10,
      sale_scraped_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    const again = await openStream();
    expect(salesIn(again.text).map((s) => s.sale_id)).toContain(first.sale_id);
  });

  it('keeps streaming when one source fails', async () => {
    const res = await openStream();
    const frames = parseSse(res.text);
    expect(frames.some((f) => f.event === 'error')).toBe(false);
    expect(frames.at(-1)!.event).toBe('done');
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
  it('re-scrapes one source and answers its updated health row', async () => {
    const admin = await app.signIn('admin');
    const res = await app.client.request({
      method: 'post',
      url: `${API}/sales/health/reporting/check`,
      headers: admin.auth,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      source_key: 'reporting',
      status: 'degraded',
      active_strategy: 'selector',
      last_error: 'shopifyJson: unexpected response',
    });
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

  it('answers 403 for non-admins', async () => {
    const user = await app.signIn('user');
    const res = await app.client.request({
      method: 'post',
      url: `${API}/sales/health/alpha/check`,
      headers: user.auth,
    });
    expect(res.status).toBe(403);
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
