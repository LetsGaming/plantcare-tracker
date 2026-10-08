import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { API, createContractApp, type ContractApp } from './harness';
import { createPlant, createSubstrate } from './support';

let app: ContractApp;

beforeAll(async () => {
  app = await createContractApp();
});
afterAll(() => app.close());

const setup = async () => {
  const owner = await app.signIn('user');
  const substrate = await createSubstrate(app, owner.auth);
  return { owner, substrate };
};

describe('POST /plants', () => {
  it('creates a plant, answers 201 with Location and the full resource', async () => {
    const { owner, substrate } = await setup();
    const res = await app.client.request({
      method: 'post',
      url: `${API}/plants`,
      headers: owner.auth,
      json: {
        name: 'Monstera',
        species: 'Monstera deliciosa',
        substrateId: substrate.substrate_id,
        isPublic: true,
      },
    });
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/plants/${res.body.data.plant_id}`);
    expect(res.body).toEqual({
      data: {
        plant_id: expect.any(Number),
        plant_user_id: owner.user.id,
        plant_name: 'Monstera',
        plant_species: 'Monstera deliciosa',
        is_public: true,
        plant_created_at: expect.any(Number),
        image_url: null,
        substrate: { substrate_id: substrate.substrate_id, substrate_name: 'Aroid Mix' },
        images: [],
      },
    });
  });

  it('defaults isPublic to false', async () => {
    const { owner, substrate } = await setup();
    const res = await app.client.request({
      method: 'post',
      url: `${API}/plants`,
      headers: owner.auth,
      json: { name: 'Ficus', species: 'Ficus lyrata', substrateId: substrate.substrate_id },
    });
    expect(res.body.data.is_public).toBe(false);
  });

  it('reuses an existing species for a near-identical spelling', async () => {
    const { owner, substrate } = await setup();
    const first = await createPlant(app, owner.auth, substrate.substrate_id, {
      species: 'Philodendron hederaceum',
    });
    const second = await app.client.request({
      method: 'post',
      url: `${API}/plants`,
      headers: owner.auth,
      json: {
        name: 'Second',
        species: 'philodendron  hederaceum',
        substrateId: substrate.substrate_id,
      },
    });
    expect(first.plant_id).not.toBe(second.body.data.plant_id);
    expect(second.body.data.plant_species).toBe('Philodendron hederaceum');
  });

  it('rejects invalid input with a per-field 400', async () => {
    const { owner } = await setup();
    const res = await app.client.request({
      method: 'post',
      url: `${API}/plants`,
      headers: owner.auth,
      json: { name: '', species: 'x'.repeat(101), substrateId: 0 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.type).toBe('ValidationError');
    expect(res.body.error.message).toBe('Invalid plant data');
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['name', 'species', 'substrateId']);
  });

  it('answers 401 without a token and 403 for a guest', async () => {
    const anon = await app.client.request({ method: 'post', url: `${API}/plants`, json: {} });
    expect(anon.status).toBe(401);
    const guest = await app.signIn('guest');
    const res = await app.client.request({
      method: 'post',
      url: `${API}/plants`,
      headers: guest.auth,
      json: { name: 'a', species: 'b', substrateId: 1 },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Guests are not allowed to perform this action');
  });
});

describe('GET /plants', () => {
  it('shows anonymous callers only public plants', async () => {
    const { owner, substrate } = await setup();
    const open = await createPlant(app, owner.auth, substrate.substrate_id, { isPublic: true });
    const hidden = await createPlant(app, owner.auth, substrate.substrate_id, { isPublic: false });
    const res = await app.client.request({ method: 'get', url: `${API}/plants` });
    expect(res.status).toBe(200);
    const ids = res.body.data.map((p: { plant_id: number }) => p.plant_id);
    expect(ids).toContain(open.plant_id);
    expect(ids).not.toContain(hidden.plant_id);
  });

  it('shows an authenticated owner public plants plus their own, without duplicates', async () => {
    const { owner, substrate } = await setup();
    const other = await app.signIn('user');
    const otherSubstrate = await createSubstrate(app, other.auth);
    const mine = await createPlant(app, owner.auth, substrate.substrate_id, { isPublic: true });
    const minePrivate = await createPlant(app, owner.auth, substrate.substrate_id, {
      isPublic: false,
    });
    const theirPrivate = await createPlant(app, other.auth, otherSubstrate.substrate_id, {
      isPublic: false,
    });
    const res = await app.client.request({
      method: 'get',
      url: `${API}/plants`,
      headers: owner.auth,
    });
    const ids: number[] = res.body.data.map((p: { plant_id: number }) => p.plant_id);
    expect(ids).toContain(mine.plant_id);
    expect(ids).toContain(minePrivate.plant_id);
    expect(ids).not.toContain(theirPrivate.plant_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('treats an invalid token as anonymous', async () => {
    const res = await app.client.request({
      method: 'get',
      url: `${API}/plants`,
      headers: { Authorization: 'Bearer garbage' },
    });
    expect(res.status).toBe(200);
  });
});

describe('GET /plants/:id visibility', () => {
  it('hides a private plant from anonymous callers and from other users with a 404', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id, { isPublic: false });
    const anon = await app.client.request({
      method: 'get',
      url: `${API}/plants/${plant.plant_id}`,
    });
    expect(anon.status).toBe(404);
    expect(anon.body.error.message).toBe('Plant not found');
    const other = await app.signIn('user');
    const res = await app.client.request({
      method: 'get',
      url: `${API}/plants/${plant.plant_id}`,
      headers: other.auth,
    });
    expect(res.status).toBe(404);
  });

  it('shows a private plant to its owner', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id, { isPublic: false });
    const res = await app.client.request({
      method: 'get',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.is_public).toBe(false);
  });

  it('shows a public plant to other users', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id, { isPublic: true });
    const other = await app.signIn('user');
    const res = await app.client.request({
      method: 'get',
      url: `${API}/plants/${plant.plant_id}`,
      headers: other.auth,
    });
    expect(res.status).toBe(200);
  });
});

describe('GET /plants/:id', () => {
  it('returns a public plant to anonymous callers', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id, { isPublic: true });
    const res = await app.client.request({ method: 'get', url: `${API}/plants/${plant.plant_id}` });
    expect(res.status).toBe(200);
    expect(res.body.data.plant_id).toBe(plant.plant_id);
  });

  it('answers 404 for an unknown or malformed id', async () => {
    expect((await app.client.request({ method: 'get', url: `${API}/plants/999999` })).status).toBe(
      404,
    );
    const res = await app.client.request({ method: 'get', url: `${API}/plants/abc` });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Plant not found');
  });
});

describe('PATCH /plants/:id', () => {
  it('updates fields and answers the full resource', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id);
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
      json: { name: 'Renamed', isPublic: true },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      plant_id: plant.plant_id,
      plant_name: 'Renamed',
      is_public: true,
    });
  });

  it('rejects an empty update with 400', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id);
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
      json: {},
    });
    expect(res.status).toBe(400);
  });

  it("answers 404 for someone else's plant", async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id);
    const intruder = await app.signIn('user');
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${plant.plant_id}`,
      headers: intruder.auth,
      json: { name: 'Mine now' },
    });
    expect(res.status).toBe(404);
  });

  it('answers 403 for a guest', async () => {
    const guest = await app.signIn('guest');
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/plants/1`,
      headers: guest.auth,
      json: { name: 'x' },
    });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /plants/:id', () => {
  it('deletes an owned plant with 204 and an empty body', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id);
    const res = await app.client.request({
      method: 'delete',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
    });
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(
      (await app.client.request({ method: 'get', url: `${API}/plants/${plant.plant_id}` })).status,
    ).toBe(404);
  });

  it("answers 404 for someone else's plant", async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id);
    const intruder = await app.signIn('user');
    const res = await app.client.request({
      method: 'delete',
      url: `${API}/plants/${plant.plant_id}`,
      headers: intruder.auth,
    });
    expect(res.status).toBe(404);
  });

  it('answers 401 without a token and 403 for a guest', async () => {
    expect((await app.client.request({ method: 'delete', url: `${API}/plants/1` })).status).toBe(
      401,
    );
    const guest = await app.signIn('guest');
    expect(
      (await app.client.request({ method: 'delete', url: `${API}/plants/1`, headers: guest.auth }))
        .status,
    ).toBe(403);
  });
});

describe('constraint errors and deletion', () => {
  it('answers a plant update with an unknown substrate with 400', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id);
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
      json: { substrateId: 987654 },
    });
    expect(res.status).toBe(400);
  });

  it('removes the images of a deleted plant, rows and files', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id);
    const upload = await app.client.request({
      method: 'post',
      url: `${API}/images/plant/${plant.plant_id}`,
      headers: owner.auth,
      multipart: [
        { field: 'image', filename: 'a.png', contentType: 'image/png', data: await app.png() },
      ],
    });
    const file = path.join(
      process.env.NAS_PATH!,
      'plant',
      path.basename(new URL(upload.body.data.path).pathname),
    );
    expect(fs.existsSync(file)).toBe(true);

    await app.client.request({
      method: 'delete',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
    });
    const rows = app.db.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM images WHERE entity_type = 'plant' AND entity_id = ?",
      [plant.plant_id],
    );
    expect(rows[0].n).toBe(0);
    expect(fs.existsSync(file)).toBe(false);
  });
});
