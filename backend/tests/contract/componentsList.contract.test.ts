import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, createContractApp, type ContractApp } from './harness';

type Signed = Awaited<ReturnType<ContractApp['signIn']>>;

let app: ContractApp;
let admin: Signed;
let user: Signed;

const mk = async (name: string, fineness = 1) => {
  const res = await app.client.request({
    method: 'post',
    url: `${API}/components`,
    headers: admin.auth,
    json: { name, fineness },
  });
  if (res.status !== 201) throw new Error(`create failed ${res.status} ${res.text}`);
  return res.body.data as { id: number; name: string };
};

const get = (url: string, auth = user.auth, headers: Record<string, string> = {}) =>
  app.client.request({ method: 'get', url: `${API}${url}`, headers: { ...auth, ...headers } });

beforeAll(async () => {
  app = await createContractApp();
  admin = await app.signIn('admin');
  user = await app.signIn('user');
});
afterAll(() => app.close());

describe('component list walk', () => {
  it('walks by name case-insensitively with equal names tied by id', async () => {
    const names = ['cw-b', 'CW-a', 'cw-B', 'cw-a', 'CW-C', 'cw-b', 'cw-A', 'cw-d', 'CW-D'];
    const created: { id: number; name: string }[] = [];
    for (const name of names) created.push(await mk(name));
    const expected = [...created].sort(
      (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id - b.id,
    );
    const got: number[] = [];
    const totals: unknown[] = [];
    let cursor: string | null = null;
    do {
      const res = await get(`/components?q=cw-&limit=4${cursor ? `&cursor=${cursor}` : ''}`);
      totals.push(res.body.data.total);
      got.push(...res.body.data.items.map((i: { id: number }) => i.id));
      cursor = res.body.data.next_cursor;
    } while (cursor);
    expect(got).toEqual(expected.map((e) => e.id));
    expect(totals).toEqual([names.length, undefined, undefined]);
  });

  it('escapes % and _ in q', async () => {
    await mk('esc 100% pumice');
    await mk('esc_under');
    await mk('escXunder');
    const names = async (q: string) =>
      (await get(`/components?q=${encodeURIComponent(q)}`)).body.data.items.map(
        (i: { name: string }) => i.name,
      );
    expect(await names('%')).toEqual(['esc 100% pumice']);
    expect(await names('c_u')).toEqual(['esc_under']);
  });

  it('answers 304 for a matching ETag', async () => {
    await mk('etag-comp');
    const first = await get('/components?q=etag-comp');
    const tag = first.headers.etag as string;
    expect(tag).toBeTruthy();
    expect((await get('/components?q=etag-comp', user.auth, { 'if-none-match': tag })).status).toBe(
      304,
    );
  });
});

describe('component list items', () => {
  it('has no images array and a cover for a component with images', async () => {
    const withImages = await mk('cover-yes');
    const without = await mk('cover-no');
    for (const [url, date] of [
      ['/uploads/component/a.webp', 1000],
      ['/uploads/component/b.webp', 2000],
    ] as const) {
      app.db.execute(
        "INSERT INTO images (image_url, entity_type, entity_id, upload_date, variants) VALUES (?, 'component', ?, ?, 1)",
        [url, withImages.id, date],
      );
    }
    const res = await get('/components?q=cover-&sort=name');
    const items = res.body.data.items as Record<string, any>[];
    for (const item of items) expect(item).not.toHaveProperty('images');
    const yes = items.find((i) => i.id === withImages.id)!;
    expect(yes.cover).toMatchObject({ url: expect.stringMatching(/b\.webp$/), date: 2000 });
    expect(yes.cover.srcset).toContain('b-160.webp 160w');
    expect(items.find((i) => i.id === without.id)!.cover).toBeNull();
  });
});

describe('component writes', () => {
  it('answers 403 for a user and succeeds for an admin on every write', async () => {
    const target = await mk('write-target');
    for (const [method, url, json] of [
      ['post', '/components', { name: 'nope', fineness: 1 }],
      ['put', `/components/${target.id}`, { name: 'nope' }],
      ['delete', `/components/${target.id}`, undefined],
    ] as const) {
      const res = await app.client.request({
        method,
        url: `${API}${url}`,
        headers: user.auth,
        json,
      });
      expect(res.status, `${method} ${url}`).toBe(403);
    }
    expect((await get(`/components/${target.id}`)).body.data.name).toBe('write-target');
    expect((await get('/components?q=nope')).body.data.items).toEqual([]);
  });
});

describe('fineness levels', () => {
  it('sends a one hour private cache header and an identical body every time', async () => {
    const first = await get('/components/fineness-levels');
    expect(first.headers['cache-control']).toBe('private, max-age=3600');
    await mk('fineness-noise');
    const second = await get('/components/fineness-levels');
    expect(second.headers['cache-control']).toBe('private, max-age=3600');
    expect(second.body).toEqual(first.body);
    expect(first.body.data).toHaveLength(3);
  });
});

describe('deleting a component', () => {
  it('removes it from the component lists of substrates', async () => {
    const keep = await mk('cascade-keep');
    const drop = await mk('cascade-drop');
    const res = await app.client.request({
      method: 'post',
      url: `${API}/substrates`,
      headers: user.auth,
      json: {
        name: 'cascade-mix',
        components: [
          { componentId: keep.id, parts: 1 },
          { componentId: drop.id, parts: 2 },
        ],
      },
    });
    const id = res.body.data.substrate_id as number;
    const del = await app.client.request({
      method: 'delete',
      url: `${API}/components/${drop.id}`,
      headers: admin.auth,
    });
    expect(del.status).toBe(204);
    const detail = await app.client.request({
      method: 'get',
      url: `${API}/substrates/${id}`,
      headers: user.auth,
    });
    expect(
      detail.body.data.components.map((c: { component_id: number }) => c.component_id),
    ).toEqual([keep.id]);
    const summary = await app.client.request({
      method: 'get',
      url: `${API}/substrates?q=cascade-mix`,
      headers: user.auth,
    });
    expect(summary.body.data.items[0].component_count).toBe(1);
    const used = await app.client.request({
      method: 'get',
      url: `${API}/substrates?component_id=${drop.id}`,
      headers: user.auth,
    });
    expect(used.body.data.items).toEqual([]);
  });
});
