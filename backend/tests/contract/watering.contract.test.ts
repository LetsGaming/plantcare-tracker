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
  const plant = await createPlant(app, owner.auth, substrate.substrate_id);
  return { owner, plant, substrate };
};

const addRecord = async (
  owner: { auth: Auth },
  plantId: number,
  json: Record<string, unknown> = {},
) =>
  app.client.request({
    method: 'post',
    url: `${API}/watering/${plantId}`,
    headers: owner.auth,
    json,
  });

const history = (auth: Auth, plantId: number, query = '') =>
  app.client.request({
    method: 'get',
    url: `${API}/watering/plant/${plantId}${query}`,
    headers: auth,
  });

const listedSummary = async (auth: Auth, plantId: number, tz = 0) => {
  const res = await app.client.request({
    method: 'get',
    url: `${API}/plants?scope=mine&limit=100&tz_offset=${tz}`,
    headers: auth,
  });
  return res.body.data.items.find((p: { plant_id: number }) => p.plant_id === plantId).watering;
};

const recordCount = (plantId: number): number =>
  app.db.query<{ n: number }>('SELECT COUNT(*) AS n FROM watering_records WHERE plant_id = ?', [
    plantId,
  ])[0].n;

describe('GET /watering/fertilizer-types', () => {
  it('lists the seeded types and lets the client keep them for an hour', async () => {
    const { owner } = await setup();
    const res = await app.client.request({
      method: 'get',
      url: `${API}/watering/fertilizer-types`,
      headers: owner.auth,
    });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=3600');
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
  it('creates a record with defaults and answers the record with the plant summary', async () => {
    const { owner, plant } = await setup();
    const res = await addRecord(owner, plant.plant_id);
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/watering/${res.body.data.record.id}`);
    expect(res.body.data.record).toEqual({
      id: expect.any(Number),
      plant_id: plant.plant_id,
      date: expect.any(Number),
      used_fertilizer: false,
      fertilizer_type_id: null,
    });
    expect(res.body.data.summary).toEqual({
      last_watered_at: res.body.data.record.date,
      last_fertilized_at: null,
      avg_interval_days: null,
    });
    expect(res.body.data.summary).toEqual(await listedSummary(owner.auth, plant.plant_id));
  });

  it('normalizes epoch milliseconds, epoch seconds and ISO strings to the same epoch ms', async () => {
    const { owner, plant } = await setup();
    const seconds = 1719388800;
    const fromMs = await addRecord(owner, plant.plant_id, { date: seconds * 1000 });
    const fromSeconds = await addRecord(owner, plant.plant_id, { date: seconds });
    const fromIso = await addRecord(owner, plant.plant_id, { date: '2024-06-26T08:00:00.000Z' });
    expect(fromMs.body.data.record.date).toBe(seconds * 1000);
    expect(fromSeconds.body.data.record.date).toBe(seconds * 1000);
    expect(fromIso.body.data.record.date).toBe(seconds * 1000);
    expect(
      app.db.query<{ date: number }>('SELECT date FROM watering_records WHERE id = ?', [
        fromMs.body.data.record.id,
      ])[0].date,
    ).toBe(seconds);
  });

  it('records a fertilizer type and reports the fertilized day', async () => {
    const { owner, plant } = await setup();
    const res = await addRecord(owner, plant.plant_id, {
      usedFertilizer: true,
      fertilizerTypeId: 2,
    });
    expect(res.body.data.record).toMatchObject({ used_fertilizer: true, fertilizer_type_id: 2 });
    expect(res.body.data.summary.last_fertilized_at).toBe(res.body.data.record.date);
  });

  it('rejects an invalid date with a field error', async () => {
    const { owner, plant } = await setup();
    const res = await addRecord(owner, plant.plant_id, { date: 'not a date' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ date: expect.any(String) });
  });

  it('rejects an invalid tz_offset and writes nothing', async () => {
    const { owner, plant } = await setup();
    const res = await addRecord(owner, plant.plant_id, { tz_offset: 9999 });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ tz_offset: expect.any(String) });
    expect(recordCount(plant.plant_id)).toBe(0);
  });

  it('counts local days with tz_offset', async () => {
    const lateUtc = Date.UTC(2026, 2, 1, 23, 30);
    const nextNoonUtc = Date.UTC(2026, 2, 2, 12);
    const avgFor = async (tz: number) => {
      const { owner, plant } = await setup();
      await addRecord(owner, plant.plant_id, { date: lateUtc, tz_offset: tz });
      const res = await addRecord(owner, plant.plant_id, { date: nextNoonUtc, tz_offset: tz });
      return res.body.data.summary.avg_interval_days;
    };
    expect(await avgFor(0)).toBe(1);
    expect(await avgFor(60)).toBeNull();
  });

  it("answers 404 for someone else's plant and writes nothing", async () => {
    const { plant } = await setup();
    const intruder = await app.signIn('user');
    const res = await addRecord(intruder, plant.plant_id);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Plant not found');
    expect(recordCount(plant.plant_id)).toBe(0);
  });

  it('answers 401 without a token and 403 for a guest', async () => {
    expect(
      (await app.client.request({ method: 'post', url: `${API}/watering/1`, json: {} })).status,
    ).toBe(401);
    const guest = await app.signIn('guest');
    expect((await addRecord(guest, 1)).status).toBe(403);
  });
});

describe('GET /watering/plant/:plantId', () => {
  const seed = (plantId: number, count: number) => {
    const base = 1_700_000_000;
    for (let i = 0; i < count; i++) {
      // Triples share a date, so page sizes that are not multiples of 3 split a tie.
      app.db.execute('INSERT INTO watering_records (plant_id, date) VALUES (?, ?)', [
        plantId,
        base + Math.floor(i / 3) * 86400,
      ]);
    }
  };

  it('pages 120 records completely and newest first over three pages of 50', async () => {
    const { owner, plant } = await setup();
    seed(plant.plant_id, 120);
    const expected = app.db
      .query<{ id: number }>(
        'SELECT id FROM watering_records WHERE plant_id = ? ORDER BY date DESC, id DESC',
        [plant.plant_id],
      )
      .map((r) => r.id);

    const walk = async (limitQuery: string, maxPages: number) => {
      const seen: number[] = [];
      const sizes: number[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        expect(++pages).toBeLessThanOrEqual(maxPages);
        const query: string = cursor
          ? `?before=${encodeURIComponent(cursor)}${limitQuery}`
          : limitQuery.replace('&', '?');
        const res = await history(owner.auth, plant.plant_id, query);
        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe('private, no-cache');
        const { items, next_cursor, total } = res.body.data;
        if (cursor === null) expect(total).toBe(120);
        else expect(total).toBeUndefined();
        sizes.push(items.length);
        seen.push(...items.map((i: { id: number }) => i.id));
        cursor = next_cursor;
      } while (cursor);
      return { seen, sizes };
    };

    const byDefault = await walk('', 5);
    expect(byDefault.sizes).toEqual([50, 50, 20]);
    expect(byDefault.seen).toEqual(expected);
    expect(new Set(byDefault.seen).size).toBe(120);

    const bySeven = await walk('&limit=7', 18);
    expect(bySeven.sizes).toEqual([...Array(17).fill(7), 1]);
    expect(bySeven.seen).toEqual(expected);
    expect(new Set(bySeven.seen).size).toBe(120);
  });

  it('honours limit and returns items without plant_name or owner_id, dates in ms', async () => {
    const { owner, plant } = await setup();
    seed(plant.plant_id, 5);
    const res = await history(owner.auth, plant.plant_id, '?limit=2');
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.next_cursor).toEqual(expect.any(String));
    for (const item of res.body.data.items) {
      expect(Object.keys(item).sort()).toEqual(
        ['date', 'fertilizer_type_id', 'id', 'plant_id', 'used_fertilizer'].sort(),
      );
    }
    expect(res.body.data.items[0].date).toBe((1_700_000_000 + 86400) * 1000);
  });

  it('answers an empty first page with total 0 for a plant without records', async () => {
    const { owner, plant } = await setup();
    const res = await history(owner.auth, plant.plant_id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ items: [], next_cursor: null, total: 0 });
  });

  it('rejects tampered or foreign cursors and bad limits with 400', async () => {
    const { owner, plant } = await setup();
    seed(plant.plant_id, 3);
    const first = await history(owner.auth, plant.plant_id, '?limit=1');
    const cursor: string = first.body.data.next_cursor;
    const tampered = Buffer.from(JSON.stringify({ s: 'date', v: 'not-a-number', id: 1 })).toString(
      'base64url',
    );
    const otherSort = Buffer.from(JSON.stringify({ s: 'name', v: 5, id: 1 })).toString('base64url');
    for (const before of ['garbage', cursor.slice(0, -4), tampered, otherSort]) {
      const res = await history(owner.auth, plant.plant_id, `?before=${before}`);
      expect(res.status).toBe(400);
    }
    expect((await history(owner.auth, plant.plant_id, '?limit=0')).status).toBe(400);
  });

  it("answers 404 for a plant that is not the caller's", async () => {
    const { owner, plant } = await setup();
    await addRecord(owner, plant.plant_id);
    const intruder = await app.signIn('user');
    expect((await history(intruder.auth, plant.plant_id)).status).toBe(404);
    expect((await history(owner.auth, 99999999)).status).toBe(404);
  });

  it('is served from idx_watering_history without sorting the whole history', async () => {
    await setup();
    const { historyPageQuery } =
      await import('../../src/modules/watering/infrastructure/SQLiteWateringRepository');
    for (const cursor of [null, { s: 'date', v: 1_700_000_000, id: 50 }]) {
      const compiled = historyPageQuery(1, { limit: 50, cursor, withTotal: false }).compile();
      const plan = app.db
        .query<{ detail: string }>(`EXPLAIN QUERY PLAN ${compiled.sql}`, [
          ...compiled.parameters,
        ] as Array<string | number | null>)
        .map((r) => r.detail)
        .join('\n');
      expect(plan).toMatch(/USING (COVERING )?INDEX idx_watering_history\b/);
      expect(plan).not.toContain('USE TEMP B-TREE');
    }
  });
});

describe('GET /watering/:id', () => {
  it('returns one record as a wire item or 404', async () => {
    const { owner, plant } = await setup();
    const created = await addRecord(owner, plant.plant_id);
    const ok = await app.client.request({
      method: 'get',
      url: `${API}/watering/${created.body.data.record.id}`,
      headers: owner.auth,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual(created.body.data.record);
    const intruder = await app.signIn('user');
    const foreign = await app.client.request({
      method: 'get',
      url: `${API}/watering/${created.body.data.record.id}`,
      headers: intruder.auth,
    });
    expect(foreign.status).toBe(404);
  });
});

describe('PATCH /watering/:id', () => {
  const patch = (auth: Auth, id: number, json: Record<string, unknown>) =>
    app.client.request({ method: 'patch', url: `${API}/watering/${id}`, headers: auth, json });

  it('updates fields and answers the record with the updated summary', async () => {
    const { owner, plant } = await setup();
    const created = await addRecord(owner, plant.plant_id, {
      usedFertilizer: true,
      fertilizerTypeId: 1,
    });
    const res = await patch(owner.auth, created.body.data.record.id, {
      usedFertilizer: false,
      fertilizerTypeId: null,
      date: 1719388800,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.record).toEqual({
      id: created.body.data.record.id,
      plant_id: plant.plant_id,
      date: 1719388800000,
      used_fertilizer: false,
      fertilizer_type_id: null,
    });
    expect(res.body.data.summary).toEqual({
      last_watered_at: 1719388800000,
      last_fertilized_at: null,
      avg_interval_days: null,
    });
    expect(res.body.data.summary).toEqual(await listedSummary(owner.auth, plant.plant_id));
  });

  it('applies tz_offset from the body to the summary', async () => {
    const { owner, plant } = await setup();
    await addRecord(owner, plant.plant_id, { date: Date.UTC(2026, 2, 1, 23, 30) });
    const second = await addRecord(owner, plant.plant_id, { date: Date.UTC(2026, 2, 5, 12) });
    const patched = (tz: number) =>
      patch(owner.auth, second.body.data.record.id, {
        date: Date.UTC(2026, 2, 2, 12),
        tz_offset: tz,
      });
    expect((await patched(0)).body.data.summary.avg_interval_days).toBe(1);
    expect((await patched(60)).body.data.summary.avg_interval_days).toBeNull();
  });

  it('rejects an empty update and an invalid tz_offset with 400', async () => {
    const { owner, plant } = await setup();
    const created = await addRecord(owner, plant.plant_id);
    const id = created.body.data.record.id;
    expect((await patch(owner.auth, id, {})).status).toBe(400);
    expect((await patch(owner.auth, id, { usedFertilizer: true, tz_offset: 'x' })).status).toBe(
      400,
    );
  });

  it("answers 404 for someone else's record and changes nothing", async () => {
    const { owner, plant } = await setup();
    const created = await addRecord(owner, plant.plant_id);
    const intruder = await app.signIn('user');
    const res = await patch(intruder.auth, created.body.data.record.id, { usedFertilizer: true });
    expect(res.status).toBe(404);
    const stored = app.db.query<{ used_fertilizer: number }>(
      'SELECT used_fertilizer FROM watering_records WHERE id = ?',
      [created.body.data.record.id],
    );
    expect(stored[0].used_fertilizer).toBe(0);
  });
});

describe('DELETE /watering/:id', () => {
  const del = (auth: Auth, id: number, query = '') =>
    app.client.request({ method: 'delete', url: `${API}/watering/${id}${query}`, headers: auth });

  it('deletes and answers 200 with the summary of the plant', async () => {
    const { owner, plant } = await setup();
    const first = await addRecord(owner, plant.plant_id, { date: 1719388800 });
    const second = await addRecord(owner, plant.plant_id, { date: 1719475200 });
    const res = await del(owner.auth, second.body.data.record.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      summary: {
        last_watered_at: 1719388800000,
        last_fertilized_at: null,
        avg_interval_days: null,
      },
    });
    expect(res.body.data.summary).toEqual(await listedSummary(owner.auth, plant.plant_id));
    const last = await del(owner.auth, first.body.data.record.id);
    expect(last.body.data.summary).toEqual({
      last_watered_at: null,
      last_fertilized_at: null,
      avg_interval_days: null,
    });
    expect(
      (
        await app.client.request({
          method: 'get',
          url: `${API}/watering/${first.body.data.record.id}`,
          headers: owner.auth,
        })
      ).status,
    ).toBe(404);
  });

  it('applies tz_offset from the query and rejects an invalid one before deleting', async () => {
    const { owner, plant } = await setup();
    await addRecord(owner, plant.plant_id, { date: Date.UTC(2026, 2, 1, 23, 30) });
    await addRecord(owner, plant.plant_id, { date: Date.UTC(2026, 2, 2, 12) });
    const third = await addRecord(owner, plant.plant_id, { date: Date.UTC(2026, 2, 9, 12) });
    const id = third.body.data.record.id;
    expect((await del(owner.auth, id, '?tz_offset=9999')).status).toBe(400);
    expect(recordCount(plant.plant_id)).toBe(3);
    const res = await del(owner.auth, id, '?tz_offset=60');
    expect(res.body.data.summary.avg_interval_days).toBeNull();
  });

  it("answers 404 for someone else's record and deletes nothing", async () => {
    const { owner, plant } = await setup();
    const created = await addRecord(owner, plant.plant_id);
    const intruder = await app.signIn('user');
    expect((await del(intruder.auth, created.body.data.record.id)).status).toBe(404);
    expect(recordCount(plant.plant_id)).toBe(1);
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
      [created.body.data.record.id],
    );
    expect(rows[0].n).toBe(0);
  });

  it('answers 403 for a guest', async () => {
    const guest = await app.signIn('guest');
    expect((await del(guest.auth, 1)).status).toBe(403);
  });
});
