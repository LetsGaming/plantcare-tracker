import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, createContractApp, type ContractApp } from './harness';

let app: ContractApp;

const createComponent = async (auth: Record<string, string>, name: string) => {
  const res = await app.client.request({
    method: 'post',
    url: `${API}/components`,
    headers: auth,
    json: { name, fineness: 1 },
  });
  if (res.status !== 201) throw new Error(`createComponent failed: ${res.status} ${res.text}`);
  return res.body.data as { id: number; name: string };
};
let admin: Awaited<ReturnType<ContractApp['signIn']>>;
let user: Awaited<ReturnType<ContractApp['signIn']>>;

beforeAll(async () => {
  app = await createContractApp();
  admin = await app.signIn('admin');
  user = await app.signIn('user');
});
afterAll(() => app.close());

describe('GET /components', () => {
  it('lists components as a paged envelope without image arrays', async () => {
    const created = await createComponent(admin.auth, 'Pumice');
    const res = await app.client.request({
      method: 'get',
      url: `${API}/components?q=pumice`,
      headers: user.auth,
    });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-cache');
    expect(res.body.data.next_cursor).toBeNull();
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items).toContainEqual({
      id: created.id,
      name: 'Pumice',
      fineness_id: 1,
      fineness_name: 'coarse',
      cover: null,
    });
    for (const item of res.body.data.items) expect(item).not.toHaveProperty('images');
  });

  it('walks the catalogue by name with a cursor and total on the first page only', async () => {
    for (const name of ['walk-b', 'WALK-a', 'walk-c', 'walk-A']) {
      await createComponent(admin.auth, name);
    }
    const names: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = `${API}/components?q=walk-&limit=3${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await app.client.request({ method: 'get', url, headers: user.auth });
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(pages === 0 ? 4 : undefined);
      names.push(...res.body.data.items.map((i: { name: string }) => i.name));
      cursor = res.body.data.next_cursor;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(2);
    expect(names).toEqual(['WALK-a', 'walk-A', 'walk-b', 'walk-c']);
  });

  it('matches q case-insensitively and literally for % and _', async () => {
    await createComponent(admin.auth, '5% Moss');
    await createComponent(admin.auth, 'Moss_x');
    await createComponent(admin.auth, 'MossYx');
    const names = async (q: string) =>
      (
        await app.client.request({
          method: 'get',
          url: `${API}/components?q=${encodeURIComponent(q)}`,
          headers: user.auth,
        })
      ).body.data.items.map((i: { name: string }) => i.name);
    expect(await names('%')).toEqual(['5% Moss']);
    expect(await names('s_x')).toEqual(['Moss_x']);
    expect(await names('MOSSY')).toEqual(['MossYx']);
  });

  it('rejects a malformed cursor, an unknown sort and an oversized q with 400', async () => {
    for (const query of ['cursor=not-a-cursor', 'sort=created', `q=${'x'.repeat(101)}`]) {
      const res = await app.client.request({
        method: 'get',
        url: `${API}/components?${query}`,
        headers: user.auth,
      });
      expect(res.status, query).toBe(400);
    }
  });

  it('requires authentication', async () => {
    expect((await app.client.request({ method: 'get', url: `${API}/components` })).status).toBe(
      401,
    );
  });
});

describe('GET /components/fineness-levels', () => {
  it('lists the seeded fineness levels with a one hour private cache', async () => {
    const res = await app.client.request({
      method: 'get',
      url: `${API}/components/fineness-levels`,
      headers: user.auth,
    });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=3600');
    expect(res.body.data).toEqual([
      { fineness_id: 1, fineness_name: 'coarse' },
      { fineness_id: 2, fineness_name: 'medium' },
      { fineness_id: 3, fineness_name: 'fine' },
    ]);
  });

  it('serves the memoized levels on repeated requests', async () => {
    const bodies = [];
    for (let i = 0; i < 10; i += 1) {
      const res = await app.client.request({
        method: 'get',
        url: `${API}/components/fineness-levels`,
        headers: user.auth,
      });
      bodies.push(res.body.data);
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });
});

describe('GET /components/:id', () => {
  it('returns one component or 404', async () => {
    const created = await createComponent(admin.auth, 'Bark');
    const ok = await app.client.request({
      method: 'get',
      url: `${API}/components/${created.id}`,
      headers: user.auth,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ name: 'Bark', images: [], cover: null });
    const missing = await app.client.request({
      method: 'get',
      url: `${API}/components/999999`,
      headers: user.auth,
    });
    expect(missing.status).toBe(404);
  });
});

describe('admin mutations', () => {
  it('creates a component with 201 and Location', async () => {
    const res = await app.client.request({
      method: 'post',
      url: `${API}/components`,
      headers: admin.auth,
      json: { name: 'Zeolite', fineness: '2' },
    });
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/components/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({
      name: 'Zeolite',
      fineness_name: 'medium',
    });
  });

  it('rejects invalid input with a per-field 400', async () => {
    const res = await app.client.request({
      method: 'post',
      url: `${API}/components`,
      headers: admin.auth,
      json: { name: '', fineness: 'x' },
    });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['fineness', 'name']);
  });

  it('updates with PUT', async () => {
    const created = await createComponent(admin.auth, 'Sand');
    const res = await app.client.request({
      method: 'put',
      url: `${API}/components/${created.id}`,
      headers: admin.auth,
      json: { name: 'Fine sand', fineness: 3 },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: 'Fine sand',
      fineness_name: 'fine',
    });
  });

  it('rejects an empty PUT with 400 and an unknown id with 404', async () => {
    const created = await createComponent(admin.auth, 'Gravel');
    const empty = await app.client.request({
      method: 'put',
      url: `${API}/components/${created.id}`,
      headers: admin.auth,
      json: {},
    });
    expect(empty.status).toBe(400);
    const missing = await app.client.request({
      method: 'put',
      url: `${API}/components/999999`,
      headers: admin.auth,
      json: { name: 'x' },
    });
    expect(missing.status).toBe(404);
  });

  it('deletes with 204 and then answers 404', async () => {
    const created = await createComponent(admin.auth, 'Charcoal');
    const res = await app.client.request({
      method: 'delete',
      url: `${API}/components/${created.id}`,
      headers: admin.auth,
    });
    expect(res.status).toBe(204);
    expect(
      (
        await app.client.request({
          method: 'delete',
          url: `${API}/components/${created.id}`,
          headers: admin.auth,
        })
      ).status,
    ).toBe(404);
  });

  it('answers 403 for non-admin users on every mutation', async () => {
    const created = await createComponent(admin.auth, 'Moss');
    for (const [method, url, json] of [
      ['post', `${API}/components`, { name: 'x', fineness: 1 }],
      ['put', `${API}/components/${created.id}`, { name: 'x' }],
      ['delete', `${API}/components/${created.id}`, undefined],
    ] as const) {
      const res = await app.client.request({ method, url, headers: user.auth, json });
      expect(res.status, `${method} ${url}`).toBe(403);
      expect(res.body.error.message).toBe('Admin access required');
    }
  });
});
