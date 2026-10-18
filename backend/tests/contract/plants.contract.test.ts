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
        plant_name: 'Monstera',
        user_id: owner.user.id,
        is_public: true,
        created_at: expect.any(Number),
        species_name: 'Monstera deliciosa',
        substrate: { substrate_id: substrate.substrate_id, substrate_name: 'Aroid Mix' },
        cover: null,
        image_count: 0,
        watering: { last_watered_at: null, last_fertilized_at: null, avg_interval_days: null },
        images: [],
      },
    });
    expect(res.body.data.created_at).toBeGreaterThan(1_000_000_000_000);
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
    expect(second.body.data.species_name).toBe('Philodendron hederaceum');
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

  it('creates a plant from a name alone, without species or substrate', async () => {
    const { owner } = await setup();
    const res = await app.client.request({
      method: 'post',
      url: `${API}/plants`,
      headers: owner.auth,
      json: { name: 'First plant' },
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      plant_name: 'First plant',
      species_name: null,
      substrate: null,
    });
  });

  it('treats an empty species and a null substrateId as not set', async () => {
    const { owner } = await setup();
    const res = await app.client.request({
      method: 'post',
      url: `${API}/plants`,
      headers: owner.auth,
      json: { name: 'Blank', species: '', substrateId: null },
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ species_name: null, substrate: null });
  });

  it('answers a plant with an unknown substrate with 404', async () => {
    const { owner } = await setup();
    const res = await app.client.request({
      method: 'post',
      url: `${API}/plants`,
      headers: owner.auth,
      json: { name: 'Orphan', substrateId: 987654 },
    });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Substrate not found');
  });

  it('lists and reads back a plant without species or substrate', async () => {
    const { owner } = await setup();
    const created = await app.client.request({
      method: 'post',
      url: `${API}/plants`,
      headers: owner.auth,
      json: { name: 'Bare' },
    });
    const id = created.body.data.plant_id;
    const one = await app.client.request({
      method: 'get',
      url: `${API}/plants/${id}`,
      headers: owner.auth,
    });
    expect(one.status).toBe(200);
    expect(one.body.data).toMatchObject({ species_name: null, substrate: null });
    const all = await app.client.request({
      method: 'get',
      url: `${API}/plants`,
      headers: owner.auth,
    });
    expect(all.status).toBe(200);
    const listed = all.body.data.items.find((p: { plant_id: number }) => p.plant_id === id);
    expect(listed).toMatchObject({ species_name: null, substrate: null });
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
    const open = await createPlant(app, owner.auth, substrate.substrate_id, {
      name: 'AnonOpen',
      isPublic: true,
    });
    const hidden = await createPlant(app, owner.auth, substrate.substrate_id, {
      name: 'AnonHidden',
      isPublic: false,
    });
    const res = await app.client.request({ method: 'get', url: `${API}/plants?q=Anon` });
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((p: { plant_id: number }) => p.plant_id);
    expect(ids).toContain(open.plant_id);
    expect(ids).not.toContain(hidden.plant_id);
  });

  it('lists own plants for scope=mine and the public plants of everyone for scope=public', async () => {
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
    const idsOf = async (query: string) => {
      const res = await app.client.request({
        method: 'get',
        url: `${API}/plants${query}`,
        headers: owner.auth,
      });
      expect(res.status).toBe(200);
      return res.body.data.items.map((p: { plant_id: number }) => p.plant_id) as number[];
    };

    const defaultIds = await idsOf('?limit=100');
    const mineIds = await idsOf('?scope=mine&limit=100');
    expect(defaultIds).toEqual(mineIds);
    expect(mineIds).toContain(mine.plant_id);
    expect(mineIds).toContain(minePrivate.plant_id);
    expect(mineIds).not.toContain(theirPrivate.plant_id);
    expect(new Set(mineIds).size).toBe(mineIds.length);

    const publicIds = await idsOf('?scope=public&limit=100');
    expect(publicIds).toContain(mine.plant_id);
    expect(publicIds).not.toContain(minePrivate.plant_id);
    expect(publicIds).not.toContain(theirPrivate.plant_id);
  });

  it('answers scope=mine with an empty page for guests and defaults them to public', async () => {
    const { owner, substrate } = await setup();
    const open = await createPlant(app, owner.auth, substrate.substrate_id, {
      name: 'GuestVisible',
      isPublic: true,
    });
    const guest = await app.signIn('guest');
    const mine = await app.client.request({
      method: 'get',
      url: `${API}/plants?scope=mine`,
      headers: guest.auth,
    });
    expect(mine.status).toBe(200);
    expect(mine.body).toEqual({ data: { items: [], next_cursor: null, total: 0 } });

    const fallback = await app.client.request({
      method: 'get',
      url: `${API}/plants?q=GuestVisible`,
      headers: guest.auth,
    });
    expect(fallback.body.data.items.map((p: { plant_id: number }) => p.plant_id)).toEqual([
      open.plant_id,
    ]);
    const anonymous = await app.client.request({
      method: 'get',
      url: `${API}/plants?scope=mine`,
    });
    expect(anonymous.body.data.items).toEqual([]);
  });

  it('returns the envelope with list items, watering for mine only and total on the first page', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id, {
      name: 'EnvelopeShape',
      isPublic: true,
    });
    const noon = Date.UTC(2026, 2, 1, 12) / 1000;
    app.db.execute(
      'INSERT INTO watering_records (plant_id, date, used_fertilizer) VALUES (?, ?, 1)',
      [plant.plant_id, noon],
    );
    const mine = await app.client.request({
      method: 'get',
      url: `${API}/plants?q=EnvelopeShape`,
      headers: owner.auth,
    });
    expect(mine.body.data).toEqual({
      items: [
        {
          plant_id: plant.plant_id,
          plant_name: 'EnvelopeShape',
          user_id: owner.user.id,
          is_public: true,
          created_at: expect.any(Number),
          species_name: 'Monstera deliciosa',
          substrate: { substrate_id: substrate.substrate_id, substrate_name: 'Aroid Mix' },
          cover: null,
          image_count: 0,
          watering: {
            last_watered_at: noon * 1000,
            last_fertilized_at: noon * 1000,
            avg_interval_days: null,
          },
        },
      ],
      next_cursor: null,
      total: 1,
    });
    const shared = await app.client.request({
      method: 'get',
      url: `${API}/plants?scope=public&q=EnvelopeShape`,
      headers: owner.auth,
    });
    expect(shared.body.data.items[0].watering).toBeNull();
  });

  it('pages with a cursor, sends total only on the first page and rejects bad input', async () => {
    const { owner, substrate } = await setup();
    for (const name of ['PageA', 'PageB', 'PageC']) {
      await createPlant(app, owner.auth, substrate.substrate_id, { name });
    }
    const first = await app.client.request({
      method: 'get',
      url: `${API}/plants?q=Page&limit=2&sort=name`,
      headers: owner.auth,
    });
    expect(first.body.data.items.map((p: { plant_name: string }) => p.plant_name)).toEqual([
      'PageA',
      'PageB',
    ]);
    expect(first.body.data.total).toBe(3);
    const second = await app.client.request({
      method: 'get',
      url: `${API}/plants?q=Page&limit=2&sort=name&cursor=${first.body.data.next_cursor}`,
      headers: owner.auth,
    });
    expect(second.body.data.items.map((p: { plant_name: string }) => p.plant_name)).toEqual([
      'PageC',
    ]);
    expect(second.body.data.next_cursor).toBeNull();
    expect(second.body.data).not.toHaveProperty('total');

    for (const query of ['sort=bogus', 'scope=all', 'limit=0', 'tz_offset=900', 'tz_offset=1.5']) {
      const res = await app.client.request({
        method: 'get',
        url: `${API}/plants?${query}`,
        headers: owner.auth,
      });
      expect(res.status, query).toBe(400);
    }
    const crossSort = await app.client.request({
      method: 'get',
      url: `${API}/plants?sort=created&cursor=${first.body.data.next_cursor}`,
      headers: owner.auth,
    });
    expect(crossSort.status).toBe(400);
  });

  it('sends private revalidation headers and an ETag that answers 304', async () => {
    const { owner } = await setup();
    const first = await app.client.request({
      method: 'get',
      url: `${API}/plants`,
      headers: owner.auth,
    });
    expect(first.headers['cache-control']).toBe('private, no-cache');
    const tag = first.headers.etag as string;
    expect(tag).toBeTruthy();
    const again = await app.client.request({
      method: 'get',
      url: `${API}/plants`,
      headers: { ...owner.auth, 'if-none-match': tag },
    });
    expect(again.status).toBe(304);
  });

  it('moves a late-evening watering to the next local day with tz_offset', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id, {
      name: 'TzShift',
    });
    const lateUtc = Date.UTC(2026, 2, 1, 23, 30) / 1000;
    const nextDayUtc = Date.UTC(2026, 2, 2, 12) / 1000;
    for (const date of [lateUtc, nextDayUtc]) {
      app.db.execute('INSERT INTO watering_records (plant_id, date) VALUES (?, ?)', [
        plant.plant_id,
        date,
      ]);
    }
    const avgFor = async (tz: string) => {
      const res = await app.client.request({
        method: 'get',
        url: `${API}/plants?q=TzShift${tz}`,
        headers: owner.auth,
      });
      return res.body.data.items[0].watering.avg_interval_days;
    };
    expect(await avgFor('')).toBe(1);
    expect(await avgFor('&tz_offset=60')).toBeNull();
  });

  it('applies a tz_offset sent in the body of POST and PATCH like the one in the list query', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id, { name: 'TzBody' });
    for (const date of [Date.UTC(2026, 2, 1, 23, 30) / 1000, Date.UTC(2026, 2, 2, 12) / 1000]) {
      app.db.execute('INSERT INTO watering_records (plant_id, date) VALUES (?, ?)', [
        plant.plant_id,
        date,
      ]);
    }
    const patched = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
      json: { name: 'TzBody', tz_offset: 60 },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data.watering.avg_interval_days).toBeNull();
    const listed = await app.client.request({
      method: 'get',
      url: `${API}/plants?q=TzBody&tz_offset=60`,
      headers: owner.auth,
    });
    expect(listed.body.data.items[0].watering.avg_interval_days).toBeNull();
    const plain = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
      json: { name: 'TzBody' },
    });
    expect(plain.body.data.watering.avg_interval_days).toBe(1);
  });

  it('rejects an out-of-range tz_offset in the body with 400', async () => {
    const { owner, substrate } = await setup();
    const res = await app.client.request({
      method: 'post',
      url: `${API}/plants`,
      headers: owner.auth,
      json: { name: 'Bad', substrateId: substrate.substrate_id, tz_offset: 9999 },
    });
    expect(res.status).toBe(400);
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

  it('returns images oldest first with the newest as cover, and the watering summary to the owner only', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id, { isPublic: true });
    for (const [url, date] of [
      ['/uploads/plant/new.webp', 200],
      ['/uploads/plant/old.webp', 100],
    ] as const) {
      app.db.execute(
        "INSERT INTO images (image_url, entity_type, entity_id, upload_date) VALUES (?, 'plant', ?, ?)",
        [url, plant.plant_id, date],
      );
    }
    app.db.execute('INSERT INTO watering_records (plant_id, date) VALUES (?, 1700000000)', [
      plant.plant_id,
    ]);

    const own = await app.client.request({
      method: 'get',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
    });
    expect(own.headers['cache-control']).toBe('private, no-cache');
    expect(own.body.data.images.map((i: { date: number }) => i.date)).toEqual([100, 200]);
    expect(own.body.data.cover.date).toBe(200);
    expect(own.body.data.image_count).toBe(2);
    expect(own.body.data.watering.last_watered_at).toBe(1_700_000_000_000);

    const other = await app.signIn('user');
    const foreign = await app.client.request({
      method: 'get',
      url: `${API}/plants/${plant.plant_id}`,
      headers: other.auth,
    });
    expect(foreign.status).toBe(200);
    expect(foreign.body.data.watering).toBeNull();
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

  it('clears the substrate with substrateId null', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id);
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
      json: { substrateId: null },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.substrate).toBeNull();
    expect(res.body.data.species_name).toBe('Monstera deliciosa');
  });

  it('clears the species with an empty string or null', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id);
    const empty = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
      json: { species: '' },
    });
    expect(empty.status).toBe(200);
    expect(empty.body.data.species_name).toBeNull();
    expect(empty.body.data.substrate).not.toBeNull();

    const other = await createPlant(app, owner.auth, substrate.substrate_id);
    const cleared = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${other.plant_id}`,
      headers: owner.auth,
      json: { species: null },
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.species_name).toBeNull();
  });

  it('keeps the length and positive checks on update', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id);
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
      json: { species: 'x'.repeat(101), substrateId: 0 },
    });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['species', 'substrateId']);
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

describe('substrate access', () => {
  const countPlants = (userId: number) =>
    app.db.query<{ n: number }>('SELECT COUNT(*) AS n FROM plants WHERE user_id = ?', [userId])[0]
      .n;

  const plantOnSubstrateTurnedPrivate = async () => {
    const owner = await app.signIn('user');
    const stranger = await app.signIn('user');
    const shared = await createSubstrate(app, stranger.auth, { isPublic: true });
    const plant = await createPlant(app, owner.auth, shared.substrate_id);
    const hide = await app.client.request({
      method: 'patch',
      url: `${API}/substrates/${shared.substrate_id}`,
      headers: stranger.auth,
      json: { isPublic: false },
    });
    expect(hide.status).toBe(200);
    return { owner, stranger, shared, plant };
  };

  it('keeps a substrate that turned private when the plant is saved with the same id', async () => {
    const { owner, shared, plant } = await plantOnSubstrateTurnedPrivate();
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
      json: { name: 'renamed', substrateId: shared.substrate_id },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.plant_name).toBe('renamed');
    expect(res.body.data.substrate.substrate_id).toBe(shared.substrate_id);
  });

  it('still refuses moving that plant to a different foreign private substrate', async () => {
    const { owner, stranger, shared, plant } = await plantOnSubstrateTurnedPrivate();
    const other = await createSubstrate(app, stranger.auth, { isPublic: false });
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
      json: { name: 'renamed', substrateId: other.substrate_id },
    });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Substrate not found');
    const after = await app.client.request({
      method: 'get',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
    });
    expect(after.body.data.plant_name).toBe('Monstera');
    expect(after.body.data.substrate.substrate_id).toBe(shared.substrate_id);
  });

  it("answers 404 Plant for someone else's plant before checking the substrate", async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id);
    const intruder = await app.signIn('user');
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${plant.plant_id}`,
      headers: intruder.auth,
      json: { substrateId: 987654 },
    });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Plant not found');
  });

  it('answers a plant update with an unknown substrate with 404', async () => {
    const { owner, substrate } = await setup();
    const plant = await createPlant(app, owner.auth, substrate.substrate_id);
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
      json: { substrateId: 987654 },
    });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Substrate not found');
  });

  it("refuses to create a plant on another user's private substrate", async () => {
    const owner = await app.signIn('user');
    const stranger = await app.signIn('user');
    const foreign = await createSubstrate(app, stranger.auth, { isPublic: false });
    const before = countPlants(owner.user.id);
    const res = await app.client.request({
      method: 'post',
      url: `${API}/plants`,
      headers: owner.auth,
      json: { name: 'Borrowed', substrateId: foreign.substrate_id },
    });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Substrate not found');
    expect(countPlants(owner.user.id)).toBe(before);
  });

  it("refuses to move a plant onto another user's private substrate", async () => {
    const { owner, substrate } = await setup();
    const stranger = await app.signIn('user');
    const foreign = await createSubstrate(app, stranger.auth, { isPublic: false });
    const plant = await createPlant(app, owner.auth, substrate.substrate_id);
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
      json: { substrateId: foreign.substrate_id, name: 'Moved' },
    });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Substrate not found');
    const after = await app.client.request({
      method: 'get',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
    });
    expect(after.body.data.plant_name).toBe('Monstera');
    expect(after.body.data.substrate.substrate_id).toBe(substrate.substrate_id);
  });

  it("accepts another user's public substrate and the caller's own private one", async () => {
    const { owner, substrate } = await setup();
    const stranger = await app.signIn('user');
    const shared = await createSubstrate(app, stranger.auth, { isPublic: true });
    const created = await app.client.request({
      method: 'post',
      url: `${API}/plants`,
      headers: owner.auth,
      json: { name: 'Shared', substrateId: shared.substrate_id },
    });
    expect(created.status).toBe(201);
    expect(created.body.data.substrate.substrate_id).toBe(shared.substrate_id);

    const moved = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${created.body.data.plant_id}`,
      headers: owner.auth,
      json: { substrateId: substrate.substrate_id },
    });
    expect(moved.status).toBe(200);
    expect(moved.body.data.substrate.substrate_id).toBe(substrate.substrate_id);

    const cleared = await app.client.request({
      method: 'patch',
      url: `${API}/plants/${created.body.data.plant_id}`,
      headers: owner.auth,
      json: { substrateId: null },
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.substrate).toBeNull();
  });
});

describe('private substrate on a public plant', () => {
  it('hides the substrate from other users and anonymous callers in list and detail, not from the owner', async () => {
    const owner = await app.signIn('user');
    const other = await app.signIn('user');
    const secret = await createSubstrate(app, owner.auth, { name: 'Secret Mix', isPublic: false });
    const plant = await createPlant(app, owner.auth, secret.substrate_id, {
      name: 'PublicOnPrivate',
      isPublic: true,
    });
    const detail = (auth: Record<string, string>) =>
      app.client.request({ method: 'get', url: `${API}/plants/${plant.plant_id}`, headers: auth });
    expect((await detail(owner.auth)).body.data.substrate.substrate_name).toBe('Secret Mix');
    expect((await detail(other.auth)).body.data.substrate).toBeNull();
    expect((await detail({})).body.data.substrate).toBeNull();

    const list = await app.client.request({
      method: 'get',
      url: `${API}/plants?scope=public&q=PublicOnPrivate`,
      headers: other.auth,
    });
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].substrate).toBeNull();
  });
});

describe('deletion', () => {
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
