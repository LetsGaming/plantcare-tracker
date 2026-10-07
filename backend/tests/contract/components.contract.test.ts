import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, createContractApp, type ContractApp } from './harness';
import { createComponent } from './support';

let app: ContractApp;
let admin: Awaited<ReturnType<ContractApp['signIn']>>;
let user: Awaited<ReturnType<ContractApp['signIn']>>;

beforeAll(async () => {
  app = await createContractApp();
  admin = await app.signIn('admin');
  user = await app.signIn('user');
});
afterAll(() => app.close());

describe('GET /components', () => {
  it('lists components with fineness and images for any authenticated user', async () => {
    const created = await createComponent(app, admin.auth, 'Pumice');
    const res = await app.client.request({
      method: 'get',
      url: `${API}/components`,
      headers: user.auth,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toContainEqual({
      component_id: created.component_id,
      component_name: 'Pumice',
      fineness_id: 1,
      component_fineness: 'coarse',
      image_url: null,
      images: [],
    });
  });

  it('requires authentication', async () => {
    expect((await app.client.request({ method: 'get', url: `${API}/components` })).status).toBe(
      401,
    );
  });
});

describe('GET /components/fineness-levels', () => {
  it('lists the seeded fineness levels', async () => {
    const res = await app.client.request({
      method: 'get',
      url: `${API}/components/fineness-levels`,
      headers: user.auth,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { fineness_id: 1, fineness_name: 'coarse' },
      { fineness_id: 2, fineness_name: 'medium' },
      { fineness_id: 3, fineness_name: 'fine' },
    ]);
  });
});

describe('GET /components/:id', () => {
  it('returns one component or 404', async () => {
    const created = await createComponent(app, admin.auth, 'Bark');
    const ok = await app.client.request({
      method: 'get',
      url: `${API}/components/${created.component_id}`,
      headers: user.auth,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.component_name).toBe('Bark');
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
    expect(res.headers.location).toBe(`/components/${res.body.data.component_id}`);
    expect(res.body.data).toMatchObject({
      component_name: 'Zeolite',
      component_fineness: 'medium',
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
    const created = await createComponent(app, admin.auth, 'Sand');
    const res = await app.client.request({
      method: 'put',
      url: `${API}/components/${created.component_id}`,
      headers: admin.auth,
      json: { name: 'Fine sand', fineness: 3 },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      component_name: 'Fine sand',
      component_fineness: 'fine',
    });
  });

  it('rejects an empty PUT with 400 and an unknown id with 404', async () => {
    const created = await createComponent(app, admin.auth, 'Gravel');
    const empty = await app.client.request({
      method: 'put',
      url: `${API}/components/${created.component_id}`,
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
    const created = await createComponent(app, admin.auth, 'Charcoal');
    const res = await app.client.request({
      method: 'delete',
      url: `${API}/components/${created.component_id}`,
      headers: admin.auth,
    });
    expect(res.status).toBe(204);
    expect(
      (
        await app.client.request({
          method: 'delete',
          url: `${API}/components/${created.component_id}`,
          headers: admin.auth,
        })
      ).status,
    ).toBe(404);
  });

  it('answers 403 for non-admin users on every mutation', async () => {
    const created = await createComponent(app, admin.auth, 'Moss');
    for (const [method, url, json] of [
      ['post', `${API}/components`, { name: 'x', fineness: 1 }],
      ['put', `${API}/components/${created.component_id}`, { name: 'x' }],
      ['delete', `${API}/components/${created.component_id}`, undefined],
    ] as const) {
      const res = await app.client.request({ method, url, headers: user.auth, json });
      expect(res.status, `${method} ${url}`).toBe(403);
      expect(res.body.error.message).toBe('Admin access required');
    }
  });
});
