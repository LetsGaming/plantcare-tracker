import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, createContractApp, type ContractApp } from './harness';
import { createComponent, createSubstrate } from './support';

const DAY_MS = 24 * 60 * 60 * 1000;

let app: ContractApp;
let componentA: { id: number; name: string };
let componentB: { id: number; name: string };
let componentC: { id: number; name: string };

beforeAll(async () => {
  app = await createContractApp();
  const admin = await app.signIn('admin');
  componentA = await createComponent(app, admin.auth, 'Perlite');
  componentB = await createComponent(app, admin.auth, 'Coco coir');
  componentC = await createComponent(app, admin.auth, 'Bark');
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
      cover: null,
      images: [],
      components: [],
    });
    expect(Math.abs(Date.now() - res.body.data.substrate_created_at)).toBeLessThan(DAY_MS);
  });

  it('creates the substrate with its mix in one request and shows it in the detail', async () => {
    const owner = await app.signIn('user');
    const res = await app.client.request({
      method: 'post',
      url: `${API}/substrates`,
      headers: owner.auth,
      json: {
        name: 'Mixed',
        components: [
          { componentId: componentA.id, parts: 2 },
          { componentId: componentB.id, parts: 1.234 },
        ],
      },
    });
    expect(res.status).toBe(201);
    const mix = (c: { component_id: number; component_parts: number }) => [
      c.component_id,
      c.component_parts,
    ];
    expect(res.body.data.components.map(mix)).toEqual([
      [componentA.id, 2],
      [componentB.id, 1.23],
    ]);
    const read = await app.client.request({
      method: 'get',
      url: `${API}/substrates/${res.body.data.substrate_id}`,
      headers: owner.auth,
    });
    expect(read.body.data.components.map(mix)).toEqual(res.body.data.components.map(mix));
  });

  it('rejects duplicate and unknown components without creating the substrate', async () => {
    const owner = await app.signIn('user');
    const duplicate = await app.client.request({
      method: 'post',
      url: `${API}/substrates`,
      headers: owner.auth,
      json: {
        name: 'Atomic',
        components: [
          { componentId: componentA.id, parts: 1 },
          { componentId: componentA.id, parts: 2 },
        ],
      },
    });
    expect(duplicate.status).toBe(400);
    const unknown = await app.client.request({
      method: 'post',
      url: `${API}/substrates`,
      headers: owner.auth,
      json: { name: 'Atomic', components: [{ componentId: 424242, parts: 1 }] },
    });
    expect(unknown.status).toBe(400);
    const list = await app.client.request({
      method: 'get',
      url: `${API}/substrates?q=Atomic`,
      headers: owner.auth,
    });
    expect(list.body.data.items).toEqual([]);
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
  it('lists the caller own substrates by default as a summary envelope', async () => {
    const owner = await app.signIn('user');
    const other = await app.signIn('user');
    const pub = await createSubstrate(app, owner.auth, { name: 'public', isPublic: true });
    const mine = await createSubstrate(app, owner.auth, { name: 'mine', isPublic: false });
    const theirs = await createSubstrate(app, other.auth, { name: 'theirs', isPublic: true });
    const res = await app.client.request({
      method: 'get',
      url: `${API}/substrates`,
      headers: owner.auth,
    });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-cache');
    expect(res.body.data.next_cursor).toBeNull();
    expect(res.body.data.total).toBe(2);
    const ids: number[] = res.body.data.items.map((s: { id: number }) => s.id);
    expect(ids).toEqual([mine.substrate_id, pub.substrate_id]);
    expect(ids).not.toContain(theirs.substrate_id);
    expect(res.body.data.items[0]).toEqual({
      id: mine.substrate_id,
      name: 'mine',
      user_id: owner.user.id,
      is_public: false,
      created_at: expect.any(Number),
      cover: null,
      component_count: 0,
    });
    expect(Math.abs(Date.now() - res.body.data.items[0].created_at)).toBeLessThan(DAY_MS);
  });

  it('lists public substrates of everyone and never private ones in the public scope', async () => {
    const owner = await app.signIn('user');
    const other = await app.signIn('user');
    const pub = await createSubstrate(app, owner.auth, { name: 'pub-scope', isPublic: true });
    const priv = await createSubstrate(app, owner.auth, { name: 'priv-scope', isPublic: false });
    const res = await app.client.request({
      method: 'get',
      url: `${API}/substrates?scope=public&limit=100`,
      headers: other.auth,
    });
    const ids: number[] = res.body.data.items.map((s: { id: number }) => s.id);
    expect(ids).toContain(pub.substrate_id);
    expect(ids).not.toContain(priv.substrate_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pages with a cursor, searches by name and filters by used component', async () => {
    const owner = await app.signIn('user');
    const created: number[] = [];
    for (const name of ['page-b', 'Page-a', 'page-c']) {
      const res = await app.client.request({
        method: 'post',
        url: `${API}/substrates`,
        headers: owner.auth,
        json: {
          name,
          components: name === 'page-c' ? [{ componentId: componentC.id, parts: 1 }] : [],
        },
      });
      created.push(res.body.data.substrate_id);
    }
    const first = await app.client.request({
      method: 'get',
      url: `${API}/substrates?sort=name&limit=2&q=page-`,
      headers: owner.auth,
    });
    expect(first.body.data.items.map((s: { name: string }) => s.name)).toEqual([
      'Page-a',
      'page-b',
    ]);
    expect(first.body.data.total).toBe(3);
    const second = await app.client.request({
      method: 'get',
      url: `${API}/substrates?sort=name&limit=2&q=page-&cursor=${first.body.data.next_cursor}`,
      headers: owner.auth,
    });
    expect(second.body.data.items.map((s: { name: string }) => s.name)).toEqual(['page-c']);
    expect(second.body.data.next_cursor).toBeNull();
    expect(second.body.data).not.toHaveProperty('total');

    const used = await app.client.request({
      method: 'get',
      url: `${API}/substrates?component_id=${componentC.id}`,
      headers: owner.auth,
    });
    expect(used.body.data.items.map((s: { id: number }) => s.id)).toEqual([created[2]]);
    expect(used.body.data.items[0].component_count).toBe(1);
  });

  it('does not reveal private substrates of others through the used-in filter', async () => {
    const owner = await app.signIn('user');
    const viewer = await app.signIn('user');
    await app.client.request({
      method: 'post',
      url: `${API}/substrates`,
      headers: owner.auth,
      json: {
        name: 'secret mix',
        isPublic: false,
        components: [{ componentId: componentB.id, parts: 1 }],
      },
    });
    for (const scope of ['mine', 'public']) {
      const res = await app.client.request({
        method: 'get',
        url: `${API}/substrates?scope=${scope}&component_id=${componentB.id}&q=secret`,
        headers: viewer.auth,
      });
      expect(res.body.data.items).toEqual([]);
    }
  });

  it('answers an empty page for a guest asking for mine and rejects bad parameters with 400', async () => {
    const guest = await app.signIn('guest');
    const mine = await app.client.request({
      method: 'get',
      url: `${API}/substrates?scope=mine`,
      headers: guest.auth,
    });
    expect(mine.status).toBe(200);
    expect(mine.body.data).toEqual({ items: [], next_cursor: null, total: 0 });
    const owner = await app.signIn('user');
    for (const query of [
      'sort=oldest',
      'scope=all',
      'cursor=garbage',
      'component_id=x',
      'limit=0',
    ]) {
      const res = await app.client.request({
        method: 'get',
        url: `${API}/substrates?${query}`,
        headers: owner.auth,
      });
      expect(res.status).toBe(400);
    }
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

const setMix = (auth: Record<string, string>, substrateId: number, components: unknown) =>
  app.client.request({
    method: 'patch',
    url: `${API}/substrates/${substrateId}`,
    headers: auth,
    json: { components },
  });

const partsOf = (components: { component_id: number; component_parts: number }[]) =>
  Object.fromEntries(components.map((c) => [c.component_id, c.component_parts]));

describe('component composition', () => {
  it('rounds parts to two decimals', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const res = await setMix(owner.auth, substrate.substrate_id, [
      { componentId: componentA.id, parts: 2.456 },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.data.components).toEqual([
      {
        component_id: componentA.id,
        component_name: 'Perlite',
        component_fineness: 'coarse',
        component_parts: 2.46,
      },
    ]);
  });

  it('accepts an index-keyed object as produced by form serializers', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const res = await setMix(owner.auth, substrate.substrate_id, {
      0: { componentId: componentA.id, parts: 1 },
      1: { componentId: componentB.id, parts: 2 },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.components).toHaveLength(2);
  });

  it('rejects a bare component object with 400', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const res = await setMix(owner.auth, substrate.substrate_id, {
      componentId: componentA.id,
      parts: 1,
    });
    expect(res.status).toBe(400);
  });

  it('replaces the mix idempotently', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    await setMix(owner.auth, substrate.substrate_id, [{ componentId: componentA.id, parts: 1 }]);
    const next = [
      { componentId: componentA.id, parts: 3 },
      { componentId: componentB.id, parts: 1 },
    ];
    const res = await setMix(owner.auth, substrate.substrate_id, next);
    const again = await setMix(owner.auth, substrate.substrate_id, next);
    expect(res.status).toBe(200);
    expect(partsOf(res.body.data.components)).toEqual({ [componentA.id]: 3, [componentB.id]: 1 });
    expect(again.body.data.components).toEqual(res.body.data.components);
  });

  it('removes an unticked component when PATCH sends the shorter list', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    await setMix(
      owner.auth,
      substrate.substrate_id,
      [componentA, componentB, componentC].map((c) => ({ componentId: c.id, parts: 1 })),
    );
    const res = await setMix(owner.auth, substrate.substrate_id, [
      { componentId: componentA.id, parts: 2 },
      { componentId: componentC.id, parts: 1 },
    ]);
    expect(res.status).toBe(200);
    const read = await app.client.request({
      method: 'get',
      url: `${API}/substrates/${substrate.substrate_id}`,
      headers: owner.auth,
    });
    expect(partsOf(read.body.data.components)).toEqual({
      [componentA.id]: 2,
      [componentC.id]: 1,
    });
  });

  it('clears the whole mix when PATCH sends an empty list', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    await setMix(owner.auth, substrate.substrate_id, [{ componentId: componentA.id, parts: 1 }]);
    const res = await setMix(owner.auth, substrate.substrate_id, []);
    expect(res.status).toBe(200);
    expect(res.body.data.components).toEqual([]);
  });

  it('rejects duplicate components and keeps the mix', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    await setMix(owner.auth, substrate.substrate_id, [{ componentId: componentA.id, parts: 1 }]);
    const duplicate = await setMix(owner.auth, substrate.substrate_id, [
      { componentId: componentA.id, parts: 1 },
      { componentId: componentA.id, parts: 2 },
    ]);
    expect(duplicate.status).toBe(400);
    const read = await app.client.request({
      method: 'get',
      url: `${API}/substrates/${substrate.substrate_id}`,
      headers: owner.auth,
    });
    expect(read.body.data.components).toHaveLength(1);
  });

  it("answers 404 and leaves the mix untouched when replacing someone else's components", async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    await setMix(owner.auth, substrate.substrate_id, [{ componentId: componentA.id, parts: 1 }]);
    const intruder = await app.signIn('user');
    const res = await setMix(intruder.auth, substrate.substrate_id, []);
    expect(res.status).toBe(404);
    const read = await app.client.request({
      method: 'get',
      url: `${API}/substrates/${substrate.substrate_id}`,
      headers: owner.auth,
    });
    expect(read.body.data.components).toHaveLength(1);
  });

  it('answers 403 for a guest replacing components', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const guest = await app.signIn('guest');
    const res = await setMix(guest.auth, substrate.substrate_id, []);
    expect(res.status).toBe(403);
  });

  it('rejects an invalid components payload with 400', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const bad = await setMix(owner.auth, substrate.substrate_id, [{ componentId: -1, parts: 0 }]);
    expect(bad.status).toBe(400);
  });

  it('rejects more than 100 components on create and replace with 400', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const tooMany = Array.from({ length: 101 }, (_, i) => ({ componentId: i + 1, parts: 1 }));
    const created = await app.client.request({
      method: 'post',
      url: `${API}/substrates`,
      headers: owner.auth,
      json: { name: 'Too many', components: tooMany },
    });
    expect(created.status).toBe(400);
    const replaced = await setMix(owner.auth, substrate.substrate_id, tooMany);
    expect(replaced.status).toBe(400);
  });

  it('no longer serves the dedicated components routes', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    for (const method of ['post', 'patch'] as const) {
      const res = await app.client.request({
        method,
        url: `${API}/substrates/${substrate.substrate_id}/components`,
        headers: owner.auth,
        json: { components: [] },
      });
      expect(res.status).toBe(404);
    }
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
  it('updates name and visibility and replaces the mix', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    await setMix(owner.auth, substrate.substrate_id, [
      { componentId: componentA.id, parts: 1 },
      { componentId: componentB.id, parts: 2 },
    ]);
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/substrates/${substrate.substrate_id}`,
      headers: owner.auth,
      json: {
        name: 'Updated',
        isPublic: true,
        components: [{ componentId: componentB.id, parts: 2 }],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ substrate_name: 'Updated', is_public: true });
    expect(res.body.data.components.map((c: { component_id: number }) => c.component_id)).toEqual([
      componentB.id,
    ]);
  });

  it('replaces the mix and edits the fields in one request', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    await setMix(
      owner.auth,
      substrate.substrate_id,
      [componentA, componentB, componentC].map((c) => ({ componentId: c.id, parts: 1 })),
    );
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/substrates/${substrate.substrate_id}`,
      headers: owner.auth,
      json: {
        name: 'One request',
        components: [
          { componentId: componentA.id, parts: 3 },
          { componentId: componentC.id, parts: 1 },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.substrate_name).toBe('One request');
    expect(
      Object.fromEntries(
        res.body.data.components.map((c: { component_id: number; component_parts: number }) => [
          c.component_id,
          c.component_parts,
        ]),
      ),
    ).toEqual({ [componentA.id]: 3, [componentC.id]: 1 });
  });

  it('answers an unknown component with 400 and keeps the name and the previous mix', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth, { name: 'Before' });
    await setMix(owner.auth, substrate.substrate_id, [{ componentId: componentA.id, parts: 1 }]);
    for (const [method, url, json] of [
      [
        'patch',
        `${API}/substrates/${substrate.substrate_id}`,
        { name: 'After', components: [{ componentId: 424242, parts: 1 }] },
      ],
    ] as const) {
      const res = await app.client.request({ method, url, headers: owner.auth, json });
      expect(res.status).toBe(400);
    }
    const read = await app.client.request({
      method: 'get',
      url: `${API}/substrates/${substrate.substrate_id}`,
      headers: owner.auth,
    });
    expect(read.body.data.substrate_name).toBe('Before');
    expect(read.body.data.components.map((c: { component_id: number }) => c.component_id)).toEqual([
      componentA.id,
    ]);
  });

  it('rejects duplicate components', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const url = `${API}/substrates/${substrate.substrate_id}`;
    const duplicate = await app.client.request({
      method: 'patch',
      url,
      headers: owner.auth,
      json: {
        components: [
          { componentId: componentA.id, parts: 1 },
          { componentId: componentA.id, parts: 2 },
        ],
      },
    });
    expect(duplicate.status).toBe(400);
  });

  it('rejects an empty update with 400 and a foreign substrate with 404', async () => {
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
    expect(foreign.status).toBe(404);
    const foreignMix = await app.client.request({
      method: 'patch',
      url: `${API}/substrates/${substrate.substrate_id}`,
      headers: intruder.auth,
      json: { components: [] },
    });
    expect(foreignMix.status).toBe(404);
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
