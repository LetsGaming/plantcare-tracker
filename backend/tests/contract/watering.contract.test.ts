import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  const plant = await createPlant(app, owner.auth, substrate.substrate_id);
  return { owner, plant };
};

const addRecord = async (
  owner: { auth: Record<string, string> },
  plantId: number,
  json: Record<string, unknown> = {},
) =>
  app.client.request({
    method: 'post',
    url: `${API}/watering/${plantId}`,
    headers: owner.auth,
    json,
  });

describe('GET /watering/fertilizer-types', () => {
  it('lists the seeded types', async () => {
    const { owner } = await setup();
    const res = await app.client.request({
      method: 'get',
      url: `${API}/watering/fertilizer-types`,
      headers: owner.auth,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { fertilizer_id: 1, fertilizer_name: 'organic' },
      { fertilizer_id: 2, fertilizer_name: 'synthetic' },
    ]);
  });

  it('requires authentication', async () => {
    expect(
      (await app.client.request({ method: 'get', url: `${API}/watering/fertilizer-types` })).status,
    ).toBe(401);
  });
});

describe('POST /watering/:plantId', () => {
  it('creates a record with defaults, 201 and Location', async () => {
    const { owner, plant } = await setup();
    const res = await addRecord(owner, plant.plant_id);
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/watering/${res.body.data.record_id}`);
    expect(res.body.data).toEqual({
      record_id: expect.any(Number),
      plant_id: plant.plant_id,
      plant_name: 'Monstera',
      watering_date: expect.any(Number),
      used_fertilizer: false,
      fertilizer_type_id: null,
      fertilizer_type: null,
      owner_id: owner.user.id,
    });
  });

  it('normalizes epoch milliseconds, epoch seconds and ISO strings to epoch seconds', async () => {
    const { owner, plant } = await setup();
    const seconds = 1719388800;
    const fromMs = await addRecord(owner, plant.plant_id, { date: seconds * 1000 });
    const fromSeconds = await addRecord(owner, plant.plant_id, { date: seconds });
    const fromIso = await addRecord(owner, plant.plant_id, { date: '2024-06-26T08:00:00.000Z' });
    expect(fromMs.body.data.watering_date).toBe(seconds);
    expect(fromSeconds.body.data.watering_date).toBe(seconds);
    expect(fromIso.body.data.watering_date).toBe(seconds);
  });

  it('records a fertilizer type', async () => {
    const { owner, plant } = await setup();
    const res = await addRecord(owner, plant.plant_id, {
      usedFertilizer: true,
      fertilizerTypeId: 2,
    });
    expect(res.body.data).toMatchObject({
      used_fertilizer: true,
      fertilizer_type_id: 2,
      fertilizer_type: 'synthetic',
    });
  });

  it('rejects an invalid date with a field error', async () => {
    const { owner, plant } = await setup();
    const res = await addRecord(owner, plant.plant_id, { date: 'not a date' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ date: expect.any(String) });
  });

  it("answers 404 for someone else's plant", async () => {
    const { plant } = await setup();
    const intruder = await app.signIn('user');
    const res = await addRecord(intruder, plant.plant_id);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Plant not found');
  });

  it('answers 401 without a token and 403 for a guest', async () => {
    expect(
      (await app.client.request({ method: 'post', url: `${API}/watering/1`, json: {} })).status,
    ).toBe(401);
    const guest = await app.signIn('guest');
    expect((await addRecord(guest, 1)).status).toBe(403);
  });
});

describe('GET /watering', () => {
  it('lists the records of an owned plant', async () => {
    const { owner, plant } = await setup();
    await addRecord(owner, plant.plant_id, { date: 1719388800 });
    await addRecord(owner, plant.plant_id, { date: 1719475200 });
    const res = await app.client.request({
      method: 'get',
      url: `${API}/watering/plant/${plant.plant_id}`,
      headers: owner.auth,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('answers an empty list for a plant without records or one that is not owned', async () => {
    const { owner, plant } = await setup();
    const intruder = await app.signIn('user');
    await addRecord(owner, plant.plant_id);
    const foreign = await app.client.request({
      method: 'get',
      url: `${API}/watering/plant/${plant.plant_id}`,
      headers: intruder.auth,
    });
    expect(foreign.status).toBe(200);
    expect(foreign.body.data).toEqual([]);
  });

  it('returns one record or 404', async () => {
    const { owner, plant } = await setup();
    const created = await addRecord(owner, plant.plant_id);
    const ok = await app.client.request({
      method: 'get',
      url: `${API}/watering/${created.body.data.record_id}`,
      headers: owner.auth,
    });
    expect(ok.status).toBe(200);
    const intruder = await app.signIn('user');
    const foreign = await app.client.request({
      method: 'get',
      url: `${API}/watering/${created.body.data.record_id}`,
      headers: intruder.auth,
    });
    expect(foreign.status).toBe(404);
  });
});

describe('PATCH /watering/:id', () => {
  it('updates fields and answers the full record', async () => {
    const { owner, plant } = await setup();
    const created = await addRecord(owner, plant.plant_id, {
      usedFertilizer: true,
      fertilizerTypeId: 1,
    });
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/watering/${created.body.data.record_id}`,
      headers: owner.auth,
      json: { usedFertilizer: false, fertilizerTypeId: null, date: 1719388800 },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      used_fertilizer: false,
      fertilizer_type_id: null,
      watering_date: 1719388800,
    });
  });

  it('rejects an empty update with 400', async () => {
    const { owner, plant } = await setup();
    const created = await addRecord(owner, plant.plant_id);
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/watering/${created.body.data.record_id}`,
      headers: owner.auth,
      json: {},
    });
    expect(res.status).toBe(400);
  });

  it("answers 404 for someone else's record", async () => {
    const { owner, plant } = await setup();
    const created = await addRecord(owner, plant.plant_id);
    const intruder = await app.signIn('user');
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/watering/${created.body.data.record_id}`,
      headers: intruder.auth,
      json: { usedFertilizer: true },
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /watering/:id', () => {
  it('deletes with 204', async () => {
    const { owner, plant } = await setup();
    const created = await addRecord(owner, plant.plant_id);
    const res = await app.client.request({
      method: 'delete',
      url: `${API}/watering/${created.body.data.record_id}`,
      headers: owner.auth,
    });
    expect(res.status).toBe(204);
    expect(
      (
        await app.client.request({
          method: 'get',
          url: `${API}/watering/${created.body.data.record_id}`,
          headers: owner.auth,
        })
      ).status,
    ).toBe(404);
  });

  it('cascades when the plant is deleted', async () => {
    const { owner, plant } = await setup();
    const created = await addRecord(owner, plant.plant_id);
    await app.client.request({
      method: 'delete',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
    });
    const rows = app.db.query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM watering_records WHERE id = ?',
      [created.body.data.record_id],
    );
    expect(rows[0].n).toBe(0);
  });

  it('answers 403 for a guest', async () => {
    const guest = await app.signIn('guest');
    const res = await app.client.request({
      method: 'delete',
      url: `${API}/watering/1`,
      headers: guest.auth,
    });
    expect(res.status).toBe(403);
  });
});
