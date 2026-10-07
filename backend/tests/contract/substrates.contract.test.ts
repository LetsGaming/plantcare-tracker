import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, createContractApp, type ContractApp } from './harness';
import { createComponent, createSubstrate } from './support';

let app: ContractApp;
let componentA: { component_id: number; component_name: string };
let componentB: { component_id: number; component_name: string };

beforeAll(async () => {
  app = await createContractApp();
  const admin = await app.signIn('admin');
  componentA = await createComponent(app, admin.auth, 'Perlite');
  componentB = await createComponent(app, admin.auth, 'Coco coir');
});
afterAll(() => app.close());

describe('POST /substrates', () => {
  it('creates a substrate, answers 201 with Location and the full resource', async () => {
    const owner = await app.signIn('user');
    const res = await app.client.request({
      method: 'post',
      url: `${API}/substrates`,
      headers: owner.auth,
      json: { name: 'Aroid Mix', isPublic: true },
    });
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/substrates/${res.body.data.substrate_id}`);
    expect(res.body.data).toEqual({
      substrate_id: expect.any(Number),
      substrate_user_id: owner.user.id,
      substrate_name: 'Aroid Mix',
      is_public: true,
      substrate_created_at: expect.any(Number),
      image_url: null,
      images: [],
      components: [],
    });
  });

  it('rejects a missing name with 400', async () => {
    const owner = await app.signIn('user');
    const res = await app.client.request({
      method: 'post',
      url: `${API}/substrates`,
      headers: owner.auth,
      json: { isPublic: true },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('name');
  });

  it('answers 401 without a token and 403 for a guest', async () => {
    expect(
      (await app.client.request({ method: 'post', url: `${API}/substrates`, json: {} })).status,
    ).toBe(401);
    const guest = await app.signIn('guest');
    const res = await app.client.request({
      method: 'post',
      url: `${API}/substrates`,
      headers: guest.auth,
      json: { name: 'x' },
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /substrates', () => {
  it('lists public substrates plus the caller own, without duplicates', async () => {
    const owner = await app.signIn('user');
    const other = await app.signIn('user');
    const pub = await createSubstrate(app, owner.auth, { name: 'public', isPublic: true });
    const mine = await createSubstrate(app, owner.auth, { name: 'mine', isPublic: false });
    const theirs = await createSubstrate(app, other.auth, { name: 'theirs', isPublic: false });
    const res = await app.client.request({
      method: 'get',
      url: `${API}/substrates`,
      headers: owner.auth,
    });
    const ids: number[] = res.body.data.map((s: { substrate_id: number }) => s.substrate_id);
    expect(ids).toEqual(expect.arrayContaining([pub.substrate_id, mine.substrate_id]));
    expect(ids).not.toContain(theirs.substrate_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('requires authentication', async () => {
    expect((await app.client.request({ method: 'get', url: `${API}/substrates` })).status).toBe(
      401,
    );
  });

  it('answers 404 for an unknown id', async () => {
    const owner = await app.signIn('user');
    const res = await app.client.request({
      method: 'get',
      url: `${API}/substrates/999999`,
      headers: owner.auth,
    });
    expect(res.status).toBe(404);
  });
});

describe('component composition', () => {
  it('adds components with 201 and rounds parts to two decimals', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const res = await app.client.request({
      method: 'post',
      url: `${API}/substrates/${substrate.substrate_id}/components`,
      headers: owner.auth,
      json: { components: [{ componentId: componentA.component_id, parts: 2.456 }] },
    });
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/substrates/${substrate.substrate_id}`);
    expect(res.body.data.components).toEqual([
      {
        component_id: componentA.component_id,
        component_name: 'Perlite',
        component_fineness: 'coarse',
        component_parts: 2.46,
      },
    ]);
  });

  it('accepts an index-keyed object as produced by form serializers', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const res = await app.client.request({
      method: 'post',
      url: `${API}/substrates/${substrate.substrate_id}/components`,
      headers: owner.auth,
      json: {
        components: {
          0: { componentId: componentA.component_id, parts: 1 },
          1: { componentId: componentB.component_id, parts: 2 },
        },
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.components).toHaveLength(2);
  });

  it('rejects a bare component object with 400', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const res = await app.client.request({
      method: 'post',
      url: `${API}/substrates/${substrate.substrate_id}/components`,
      headers: owner.auth,
      json: { components: { componentId: componentA.component_id, parts: 1 } },
    });
    expect(res.status).toBe(400);
  });

  it('upserts components idempotently with PATCH', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const url = `${API}/substrates/${substrate.substrate_id}/components`;
    await app.client.request({
      method: 'patch',
      url,
      headers: owner.auth,
      json: { components: [{ componentId: componentA.component_id, parts: 1 }] },
    });
    const res = await app.client.request({
      method: 'patch',
      url,
      headers: owner.auth,
      json: {
        components: [
          { componentId: componentA.component_id, parts: 3 },
          { componentId: componentB.component_id, parts: 1 },
        ],
      },
    });
    expect(res.status).toBe(200);
    const parts = Object.fromEntries(
      res.body.data.components.map((c: { component_id: number; component_parts: number }) => [
        c.component_id,
        c.component_parts,
      ]),
    );
    expect(parts).toEqual({ [componentA.component_id]: 3, [componentB.component_id]: 1 });
  });

  it('rejects an empty or invalid components payload with 400', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const url = `${API}/substrates/${substrate.substrate_id}/components`;
    const empty = await app.client.request({
      method: 'post',
      url,
      headers: owner.auth,
      json: { components: [] },
    });
    expect(empty.status).toBe(400);
    const bad = await app.client.request({
      method: 'post',
      url,
      headers: owner.auth,
      json: { components: [{ componentId: -1, parts: 0 }] },
    });
    expect(bad.status).toBe(400);
  });

  it("answers 403 when editing someone else's substrate", async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const intruder = await app.signIn('user');
    const res = await app.client.request({
      method: 'post',
      url: `${API}/substrates/${substrate.substrate_id}/components`,
      headers: intruder.auth,
      json: { components: [{ componentId: componentA.component_id, parts: 1 }] },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Unauthorized to update this substrate');
  });
});

describe('GET /substrates/:id visibility', () => {
  it("answers 404 for another user's private substrate", async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth, { isPublic: false });
    const intruder = await app.signIn('user');
    const res = await app.client.request({
      method: 'get',
      url: `${API}/substrates/${substrate.substrate_id}`,
      headers: intruder.auth,
    });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Substrate not found');
  });

  it('shows a private substrate to its owner and a public one to everyone', async () => {
    const owner = await app.signIn('user');
    const priv = await createSubstrate(app, owner.auth, { isPublic: false });
    const pub = await createSubstrate(app, owner.auth, { isPublic: true });
    const other = await app.signIn('user');
    const own = await app.client.request({
      method: 'get',
      url: `${API}/substrates/${priv.substrate_id}`,
      headers: owner.auth,
    });
    const shared = await app.client.request({
      method: 'get',
      url: `${API}/substrates/${pub.substrate_id}`,
      headers: other.auth,
    });
    expect(own.status).toBe(200);
    expect(shared.status).toBe(200);
  });
});

describe('PATCH /substrates/:id', () => {
  it('updates name and visibility and removes components', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    await app.client.request({
      method: 'post',
      url: `${API}/substrates/${substrate.substrate_id}/components`,
      headers: owner.auth,
      json: {
        components: [
          { componentId: componentA.component_id, parts: 1 },
          { componentId: componentB.component_id, parts: 2 },
        ],
      },
    });
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/substrates/${substrate.substrate_id}`,
      headers: owner.auth,
      json: { name: 'Updated', isPublic: true, removedComponents: [componentA.component_id] },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ substrate_name: 'Updated', is_public: true });
    expect(res.body.data.components.map((c: { component_id: number }) => c.component_id)).toEqual([
      componentB.component_id,
    ]);
  });

  it('rejects an empty update with 400 and a foreign substrate with 403', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const empty = await app.client.request({
      method: 'patch',
      url: `${API}/substrates/${substrate.substrate_id}`,
      headers: owner.auth,
      json: {},
    });
    expect(empty.status).toBe(400);
    const intruder = await app.signIn('user');
    const foreign = await app.client.request({
      method: 'patch',
      url: `${API}/substrates/${substrate.substrate_id}`,
      headers: intruder.auth,
      json: { name: 'x' },
    });
    expect(foreign.status).toBe(403);
  });
});

describe('DELETE /substrates/:id', () => {
  it('deletes an owned substrate with 204 and detaches it from plants', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const plant = await app.client.request({
      method: 'post',
      url: `${API}/plants`,
      headers: owner.auth,
      json: { name: 'p', species: 'Ficus', substrateId: substrate.substrate_id, isPublic: true },
    });
    const res = await app.client.request({
      method: 'delete',
      url: `${API}/substrates/${substrate.substrate_id}`,
      headers: owner.auth,
    });
    expect(res.status).toBe(204);
    const after = await app.client.request({
      method: 'get',
      url: `${API}/plants/${plant.body.data.plant_id}`,
    });
    expect(after.body.data.substrate).toBeNull();
  });

  it("answers 404 for someone else's substrate", async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const intruder = await app.signIn('user');
    const res = await app.client.request({
      method: 'delete',
      url: `${API}/substrates/${substrate.substrate_id}`,
      headers: intruder.auth,
    });
    expect(res.status).toBe(404);
  });
});

describe('constraint errors', () => {
  it('answers a duplicate component with 409', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const url = `${API}/substrates/${substrate.substrate_id}/components`;
    const body = { components: [{ componentId: componentA.component_id, parts: 1 }] };
    await app.client.request({ method: 'post', url, headers: owner.auth, json: body });
    const res = await app.client.request({ method: 'post', url, headers: owner.auth, json: body });
    expect(res.status).toBe(409);
  });

  it('answers an unknown component id with 400', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const res = await app.client.request({
      method: 'post',
      url: `${API}/substrates/${substrate.substrate_id}/components`,
      headers: owner.auth,
      json: { components: [{ componentId: 424242, parts: 1 }] },
    });
    expect(res.status).toBe(400);
  });

  it('rejects a substrate name over 100 characters', async () => {
    const owner = await app.signIn('user');
    const res = await app.client.request({
      method: 'post',
      url: `${API}/substrates`,
      headers: owner.auth,
      json: { name: 'x'.repeat(101) },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('name');
  });
});
