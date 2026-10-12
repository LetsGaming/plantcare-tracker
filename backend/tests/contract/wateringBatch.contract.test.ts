import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, createContractApp, type ContractApp } from './harness';
import { createPlant, createSubstrate } from './support';

let app: ContractApp;

beforeAll(async () => {
  app = await createContractApp();
});
afterAll(() => app.close());

type Auth = Record<string, string>;

const setup = async () => {
  const owner = await app.signIn('user');
  const substrate = await createSubstrate(app, owner.auth);
  const a = await createPlant(app, owner.auth, substrate.substrate_id);
  const b = await createPlant(app, owner.auth, substrate.substrate_id);
  return { owner, a, b };
};

const recordCount = (plantId: number): number =>
  app.db.query<{ n: number }>('SELECT COUNT(*) AS n FROM watering_records WHERE plant_id = ?', [
    plantId,
  ])[0].n;

const listedSummaries = async (auth: Auth, tz = 0) => {
  const res = await app.client.request({
    method: 'get',
    url: `${API}/plants?scope=mine&limit=100&tz_offset=${tz}`,
    headers: auth,
  });
  return new Map<number, unknown>(
    res.body.data.items.map((p: { plant_id: number; watering: unknown }) => [
      p.plant_id,
      p.watering,
    ]),
  );
};

const batch = (auth: Auth | undefined, json: unknown) =>
  app.client.request({ method: 'post', url: `${API}/watering/batch`, headers: auth, json });

const batchDelete = (auth: Auth, json: unknown) =>
  app.client.request({
    method: 'post',
    url: `${API}/watering/batch/delete`,
    headers: auth,
    json,
  });

describe('POST /watering/batch', () => {
  it('creates one record per entry and answers records plus summaries equal to the plant list', async () => {
    const { owner, a, b } = await setup();
    const res = await batch(owner.auth, {
      date: 1719388800,
      entries: [
        { plantId: a.plant_id, usedFertilizer: true, fertilizerTypeId: 1 },
        { plantId: b.plant_id, usedFertilizer: false, fertilizerTypeId: 2 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.records).toEqual([
      {
        id: expect.any(Number),
        plant_id: a.plant_id,
        date: 1719388800000,
        used_fertilizer: true,
        fertilizer_type_id: 1,
      },
      {
        id: expect.any(Number),
        plant_id: b.plant_id,
        date: 1719388800000,
        used_fertilizer: false,
        fertilizer_type_id: null,
      },
    ]);
    expect(Object.keys(res.body.data.summaries).sort()).toEqual(
      [String(a.plant_id), String(b.plant_id)].sort(),
    );
    const listed = await listedSummaries(owner.auth);
    expect(res.body.data.summaries[a.plant_id]).toEqual(listed.get(a.plant_id));
    expect(res.body.data.summaries[b.plant_id]).toEqual(listed.get(b.plant_id));
    expect(res.body.data.summaries[a.plant_id].last_fertilized_at).toBe(1719388800000);
    expect(recordCount(a.plant_id)).toBe(1);
    expect(recordCount(b.plant_id)).toBe(1);
  });

  it('reflects earlier records and tz_offset in the summaries', async () => {
    const { owner, a } = await setup();
    app.db.execute('INSERT INTO watering_records (plant_id, date) VALUES (?, ?)', [
      a.plant_id,
      Date.UTC(2026, 2, 1, 23, 30) / 1000,
    ]);
    const entries = [{ plantId: a.plant_id, usedFertilizer: false }];
    const at = Date.UTC(2026, 2, 2, 12);
    const utc = await batch(owner.auth, { date: at, entries });
    expect(utc.body.data.summaries[a.plant_id].avg_interval_days).toBe(1);
    const shifted = await batch(owner.auth, { date: at, entries, tz_offset: 60 });
    expect(shifted.body.data.summaries[a.plant_id].avg_interval_days).toBeNull();
    expect((await listedSummaries(owner.auth, 60)).get(a.plant_id)).toEqual(
      shifted.body.data.summaries[a.plant_id],
    );
  });

  it('rejects the whole batch when one plant is foreign and writes nothing', async () => {
    const { owner, a } = await setup();
    const other = await setup();
    const res = await batch(owner.auth, {
      entries: [
        { plantId: a.plant_id, usedFertilizer: false },
        { plantId: other.a.plant_id, usedFertilizer: false },
      ],
    });
    expect(res.status).toBe(404);
    expect(recordCount(a.plant_id)).toBe(0);
    expect(recordCount(other.a.plant_id)).toBe(0);
  });

  it('rejects duplicates, empty and oversized batches and a bad tz_offset', async () => {
    const { owner, a } = await setup();
    const dup = { plantId: a.plant_id, usedFertilizer: false };
    expect((await batch(owner.auth, { entries: [dup, dup] })).status).toBe(400);
    expect((await batch(owner.auth, { entries: [] })).status).toBe(400);
    expect(
      (await batch(owner.auth, { entries: Array.from({ length: 201 }, () => dup) })).status,
    ).toBe(400);
    expect((await batch(owner.auth, { entries: [dup], tz_offset: 1000 })).status).toBe(400);
    expect(recordCount(a.plant_id)).toBe(0);
  });

  it('requires auth and blocks guests', async () => {
    expect((await batch(undefined, { entries: [] })).status).toBe(401);
    const guest = await app.signIn('guest');
    expect(
      (await batch(guest.auth, { entries: [{ plantId: 1, usedFertilizer: false }] })).status,
    ).toBe(403);
  });
});

describe('POST /watering/batch/delete', () => {
  const create = async (owner: { auth: Auth }, plantIds: number[], date: number) =>
    (
      await batch(owner.auth, {
        date,
        entries: plantIds.map((plantId) => ({ plantId, usedFertilizer: false })),
      })
    ).body.data.records.map((r: { id: number }) => r.id) as number[];

  it('deletes own records and answers one summary per affected plant', async () => {
    const { owner, a, b } = await setup();
    await create(owner, [a.plant_id, b.plant_id], 1719388800);
    const newer = await create(owner, [a.plant_id], 1719475200);

    const res = await batchDelete(owner.auth, { ids: newer });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data)).toEqual(['summaries']);
    expect(Object.keys(res.body.data.summaries)).toEqual([String(a.plant_id)]);
    expect(res.body.data.summaries[a.plant_id].last_watered_at).toBe(1719388800000);
    const listed = await listedSummaries(owner.auth);
    expect(res.body.data.summaries[a.plant_id]).toEqual(listed.get(a.plant_id));
    expect(recordCount(a.plant_id)).toBe(1);
  });

  it('reports an emptied plant with null summary fields', async () => {
    const { owner, a } = await setup();
    const ids = await create(owner, [a.plant_id], 1719388800);
    const res = await batchDelete(owner.auth, { ids });
    expect(res.body.data.summaries[a.plant_id]).toEqual({
      last_watered_at: null,
      last_fertilized_at: null,
      avg_interval_days: null,
    });
  });

  it('refuses foreign ids with 404 and deletes nothing, even for the own ones', async () => {
    const { owner, a } = await setup();
    const other = await setup();
    const own = await create(owner, [a.plant_id], 1719388800);
    const foreign = await create(other.owner, [other.a.plant_id], 1719388800);
    expect((await batchDelete(owner.auth, { ids: [...own, ...foreign] })).status).toBe(404);
    expect(recordCount(a.plant_id)).toBe(1);
    expect(recordCount(other.a.plant_id)).toBe(1);
  });

  it('rejects an empty id list and a bad tz_offset and blocks guests', async () => {
    const { owner, a } = await setup();
    const ids = await create(owner, [a.plant_id], 1719388800);
    expect((await batchDelete(owner.auth, { ids: [] })).status).toBe(400);
    expect((await batchDelete(owner.auth, { ids, tz_offset: 'x' })).status).toBe(400);
    expect(recordCount(a.plant_id)).toBe(1);
    const guest = await app.signIn('guest');
    expect((await batchDelete(guest.auth, { ids })).status).toBe(403);
  });
});
