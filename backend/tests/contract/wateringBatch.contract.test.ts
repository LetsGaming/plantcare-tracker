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
  const a = await createPlant(app, owner.auth, substrate.substrate_id);
  const b = await createPlant(app, owner.auth, substrate.substrate_id);
  return { owner, a, b };
};

const records = async (auth: Record<string, string>, plantId: number) =>
  (
    await app.client.request({
      method: 'get',
      url: `${API}/watering/plant/${plantId}`,
      headers: auth,
    })
  ).body.data ?? [];

const batch = (auth: Record<string, string> | undefined, json: unknown) =>
  app.client.request({ method: 'post', url: `${API}/watering/batch`, headers: auth, json });

describe('POST /watering/batch', () => {
  it('creates one record per entry with per-entry fertilizer', async () => {
    const { owner, a, b } = await setup();
    const res = await batch(owner.auth, {
      entries: [
        { plantId: a.plant_id, usedFertilizer: true, fertilizerTypeId: 1 },
        { plantId: b.plant_id, usedFertilizer: false },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.ids).toHaveLength(2);
    expect(await records(owner.auth, a.plant_id)).toHaveLength(1);
    expect(await records(owner.auth, b.plant_id)).toHaveLength(1);
  });

  it('rejects the whole batch when one plant is foreign', async () => {
    const { owner, a } = await setup();
    const other = await setup();
    const res = await batch(owner.auth, {
      entries: [
        { plantId: a.plant_id, usedFertilizer: false },
        { plantId: other.a.plant_id, usedFertilizer: false },
      ],
    });
    expect(res.status).toBe(404);
    expect(await records(owner.auth, a.plant_id)).toHaveLength(0);
  });

  it('rejects duplicates, empty and oversized batches', async () => {
    const { owner, a } = await setup();
    const dup = { plantId: a.plant_id, usedFertilizer: false };
    expect((await batch(owner.auth, { entries: [dup, dup] })).status).toBe(400);
    expect((await batch(owner.auth, { entries: [] })).status).toBe(400);
    expect(
      (await batch(owner.auth, { entries: Array.from({ length: 201 }, () => dup) })).status,
    ).toBe(400);
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
  it('deletes own records and refuses foreign ones', async () => {
    const { owner, a } = await setup();
    const other = await setup();
    const { ids } = (
      await batch(owner.auth, { entries: [{ plantId: a.plant_id, usedFertilizer: false }] })
    ).body.data;
    const del = (auth: Record<string, string>) =>
      app.client.request({
        method: 'post',
        url: `${API}/watering/batch/delete`,
        headers: auth,
        json: { ids },
      });
    expect((await del(other.owner.auth)).status).toBe(404);
    expect((await del(owner.auth)).status).toBe(204);
    expect(await records(owner.auth, a.plant_id)).toHaveLength(0);
  });
});
