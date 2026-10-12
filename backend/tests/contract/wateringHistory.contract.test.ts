import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import zlib from 'zlib';
import { API, createContractApp, type ContractApp } from './harness';
import { createPlant, createSubstrate } from './support';

let app: ContractApp;

beforeAll(async () => {
  app = await createContractApp();
});
afterAll(() => app.close());

type Auth = Record<string, string>;
interface Summary {
  last_watered_at: number | null;
  last_fertilized_at: number | null;
  avg_interval_days: number | null;
}

const setup = async (plants = 1) => {
  const owner = await app.signIn('user');
  const substrate = await createSubstrate(app, owner.auth);
  const created = [];
  for (let i = 0; i < plants; i += 1) {
    created.push(await createPlant(app, owner.auth, substrate.substrate_id, { name: `H${i}` }));
  }
  return { owner, plants: created };
};

const request = (
  method: 'get' | 'post' | 'patch' | 'delete',
  url: string,
  auth?: Auth,
  json?: unknown,
  headers: Record<string, string> = {},
) =>
  app.client.request({
    method,
    url: `${API}${url}`,
    headers: { ...(auth ?? {}), ...headers },
    json,
  });

const history = (auth: Auth | undefined, plantId: number, query = '', headers = {}) =>
  request('get', `/watering/plant/${plantId}${query}`, auth, undefined, headers);

const listed = async (auth: Auth, tz: number) => {
  const map = new Map<number, Summary>();
  let cursor: string | null = null;
  do {
    const suffix: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const res = await request('get', `/plants?scope=mine&limit=100&tz_offset=${tz}${suffix}`, auth);
    for (const p of res.body.data.items) map.set(p.plant_id, p.watering);
    cursor = res.body.data.next_cursor;
  } while (cursor);
  return map;
};

const seedRecords = (plantId: number, count: number, groupSize = 3) => {
  for (let i = 0; i < count; i += 1) {
    app.db.execute('INSERT INTO watering_records (plant_id, date) VALUES (?, ?)', [
      plantId,
      1_700_000_000 + Math.floor(i / groupSize) * 86400,
    ]);
  }
};

describe('GET /watering/plant/:plantId paging bounds', () => {
  it('clamps limit above the cap of 100 to 100 items and continues with before', async () => {
    const { owner, plants } = await setup();
    const plantId = plants[0].plant_id;
    seedRecords(plantId, 130);
    const expected = app.db
      .query<{ id: number }>(
        'SELECT id FROM watering_records WHERE plant_id = ? ORDER BY date DESC, id DESC',
        [plantId],
      )
      .map((r) => r.id);

    const first = await history(owner.auth, plantId, '?limit=500');
    expect(first.status).toBe(200);
    expect(first.body.data.items).toHaveLength(100);
    expect(first.body.data.total).toBe(130);
    const second = await history(
      owner.auth,
      plantId,
      `?limit=100000&before=${encodeURIComponent(first.body.data.next_cursor)}`,
    );
    expect(second.status).toBe(200);
    expect(second.body.data.items).toHaveLength(30);
    expect(second.body.data.next_cursor).toBeNull();
    expect(second.body.data).not.toHaveProperty('total');
    expect(
      [...first.body.data.items, ...second.body.data.items].map((i: { id: number }) => i.id),
    ).toEqual(expected);
  });

  it('rejects non-integer, negative and non-numeric limits with 400', async () => {
    const { owner, plants } = await setup();
    for (const limit of ['-1', '1.5', 'abc', '0']) {
      const res = await history(owner.auth, plants[0].plant_id, `?limit=${limit}`);
      expect(res.status, limit).toBe(400);
    }
  });

  it('rejects structurally broken before cursors, including an oversized one, with 400', async () => {
    const { owner, plants } = await setup();
    seedRecords(plants[0].plant_id, 4);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const bad = [
      encode({ s: 'date', v: 1_700_000_000 }),
      encode({ s: 'date', v: 1_700_000_000, id: 'x' }),
      encode({ s: 'date', v: null, id: 1 }),
      encode([1, 2, 3]),
      'x'.repeat(600),
      '%%%',
    ];
    for (const before of bad) {
      const res = await history(
        owner.auth,
        plants[0].plant_id,
        `?before=${encodeURIComponent(before)}`,
      );
      expect(res.status, before.slice(0, 40)).toBe(400);
      expect(res.body.error).toBeTruthy();
    }
  });

  it('accepts a well-formed cursor that points past the oldest record with an empty page', async () => {
    const { owner, plants } = await setup();
    seedRecords(plants[0].plant_id, 3);
    const cursor = Buffer.from(JSON.stringify({ s: 'date', v: 1, id: 1 })).toString('base64url');
    const res = await history(owner.auth, plants[0].plant_id, `?before=${cursor}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ items: [], next_cursor: null });
  });

  it('hides the history of other users plants, anonymous callers and unknown plants', async () => {
    const { owner, plants } = await setup();
    seedRecords(plants[0].plant_id, 2);
    const intruder = await app.signIn('user');
    const admin = await app.signIn('admin');
    const plantId = plants[0].plant_id;
    expect((await history(intruder.auth, plantId)).status).toBe(404);
    expect((await history(intruder.auth, plantId, '?limit=1')).status).toBe(404);
    expect((await history(admin.auth, plantId)).status).toBe(404);
    expect((await history(undefined, plantId)).status).toBe(401);
    expect((await history(owner.auth, 0)).status).toBe(404);
    expect((await history(owner.auth, 'abc' as unknown as number)).status).toBe(404);

    const first = await history(owner.auth, plantId, '?limit=1');
    const stolen = await history(
      intruder.auth,
      plantId,
      `?before=${encodeURIComponent(first.body.data.next_cursor)}`,
    );
    expect(stolen.status).toBe(404);
  });

  it('does not let a cursor of one plant leak the records of another', async () => {
    const { owner, plants } = await setup(2);
    const [a, b] = plants;
    seedRecords(a.plant_id, 6);
    seedRecords(b.plant_id, 6);
    const first = await history(owner.auth, a.plant_id, '?limit=2');
    const onB = await history(
      owner.auth,
      b.plant_id,
      `?before=${encodeURIComponent(first.body.data.next_cursor)}`,
    );
    expect(onB.status).toBe(200);
    expect(onB.body.data.items.every((i: { plant_id: number }) => i.plant_id === b.plant_id)).toBe(
      true,
    );
  });
});

describe('GET /watering/plant/:plantId caching and compression', () => {
  it('answers 304 for a repeated request and a fresh body after a write', async () => {
    const { owner, plants } = await setup();
    const plantId = plants[0].plant_id;
    seedRecords(plantId, 3);
    const first = await history(owner.auth, plantId);
    expect(first.headers['cache-control']).toBe('private, no-cache');
    const tag = first.headers.etag as string;
    expect(tag).toBeTruthy();
    expect((await history(owner.auth, plantId, '', { 'if-none-match': tag })).status).toBe(304);

    await request('post', `/watering/${plantId}`, owner.auth, { date: 1_800_000_000 });
    const after = await history(owner.auth, plantId, '', { 'if-none-match': tag });
    expect(after.status).toBe(200);
    expect(after.body.data.items).toHaveLength(4);
    expect(after.body.data.total).toBe(4);
  });

  it('gzips a full page of 100 records and does not compress an empty history', async () => {
    const { owner, plants } = await setup(2);
    seedRecords(plants[0].plant_id, 100, 1);
    const res = await history(owner.auth, plants[0].plant_id, '?limit=100', {
      'accept-encoding': 'gzip',
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    const json = JSON.parse(zlib.gunzipSync(res.bytes).toString('utf8'));
    expect(json.data.items).toHaveLength(100);
    expect(res.bytes.length).toBeLessThan(20 * 1024);

    const empty = await history(owner.auth, plants[1].plant_id, '', { 'accept-encoding': 'gzip' });
    expect(empty.headers['content-encoding']).toBeUndefined();
    expect(empty.body.data).toEqual({ items: [], next_cursor: null, total: 0 });
  });
});

describe('watering write summaries equal the plant list', () => {
  const TZ = -300;
  const day = (d: number, hour = 12, minute = 0) => Date.UTC(2026, 5, d, hour, minute);

  it('keeps the summaries of batch, add, edit and delete equal to the list at the same tz_offset', async () => {
    const { owner, plants } = await setup(3);
    const [a, b, c] = plants;
    const check = async (summaries: Record<string, Summary>) => {
      const list = await listed(owner.auth, TZ);
      for (const [id, summary] of Object.entries(summaries)) {
        expect(summary, `plant ${id}`).toEqual(list.get(Number(id)));
      }
    };

    const batch = await request('post', '/watering/batch', owner.auth, {
      date: day(1, 2),
      tz_offset: TZ,
      entries: plants.map((p, i) => ({ plantId: p.plant_id, usedFertilizer: i === 0 })),
    });
    expect(batch.status).toBe(201);
    expect(Object.keys(batch.body.data.summaries)).toHaveLength(3);
    await check(batch.body.data.summaries);

    const added = await request('post', `/watering/${a.plant_id}`, owner.auth, {
      date: day(4, 3),
      tz_offset: TZ,
      usedFertilizer: true,
      fertilizerTypeId: 2,
    });
    expect(added.status).toBe(201);
    await check({ [a.plant_id]: added.body.data.summary });

    const second = await request('post', `/watering/${a.plant_id}`, owner.auth, {
      date: day(9, 12),
      tz_offset: TZ,
    });
    await check({ [a.plant_id]: second.body.data.summary });
    expect(second.body.data.summary.avg_interval_days).not.toBeNull();

    // 03:00 UTC on day 4 is still day 3 in UTC-5; moving it by 3h crosses the local midnight.
    const edited = await request('patch', `/watering/${added.body.data.record.id}`, owner.auth, {
      date: day(4, 6),
      tz_offset: TZ,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data.summary).not.toEqual(added.body.data.summary);
    await check({ [a.plant_id]: edited.body.data.summary });

    const removed = await request(
      'delete',
      `/watering/${second.body.data.record.id}?tz_offset=${TZ}`,
      owner.auth,
    );
    expect(removed.status).toBe(200);
    await check({ [a.plant_id]: removed.body.data.summary });

    const batchDelete = await request('post', '/watering/batch/delete', owner.auth, {
      ids: batch.body.data.records.slice(1).map((r: { id: number }) => r.id),
      tz_offset: TZ,
    });
    expect(batchDelete.status).toBe(200);
    expect(Object.keys(batchDelete.body.data.summaries).sort()).toEqual(
      [String(b.plant_id), String(c.plant_id)].sort(),
    );
    await check(batchDelete.body.data.summaries);
    for (const summary of Object.values(batchDelete.body.data.summaries) as Summary[]) {
      expect(summary).toEqual({
        last_watered_at: null,
        last_fertilized_at: null,
        avg_interval_days: null,
      });
    }
  });

  it('reports different distinct-day counts for the same data at two offsets, in the write and in the list', async () => {
    const { owner, plants } = await setup();
    const plantId = plants[0].plant_id;
    // 23:30 and 00:30 UTC are two UTC days but a single local day at UTC-1.
    await request('post', `/watering/${plantId}`, owner.auth, { date: day(1, 23, 30) });
    const sameDayUtc = await request('post', `/watering/${plantId}`, owner.auth, {
      date: day(2, 0, 30),
    });
    expect(sameDayUtc.body.data.summary.avg_interval_days).toBe(1);
    const shifted = await request('post', `/watering/${plantId}`, owner.auth, {
      date: day(6, 12),
      tz_offset: -60,
    });
    // local days at UTC-1: day 1 (both early records), day 6 -> (6 - 1) / 1
    expect(shifted.body.data.summary.avg_interval_days).toBe(5);
    expect((await listed(owner.auth, -60)).get(plantId)).toEqual(shifted.body.data.summary);
    // UTC: days 1, 2, 6 -> (6 - 1) / 2
    expect((await listed(owner.auth, 0)).get(plantId)?.avg_interval_days).toBe(2.5);
  });
});

describe('tz_offset validation on every watering route', () => {
  const INVALID = [841, -841, 1.5, 'abc'];

  it('rejects invalid offsets on add, edit, delete, batch and batch delete and writes nothing', async () => {
    const { owner, plants } = await setup();
    const plantId = plants[0].plant_id;
    const seeded = await request('post', `/watering/${plantId}`, owner.auth, {
      date: 1_700_000_000,
    });
    const recordId = seeded.body.data.record.id as number;
    const countRows = () =>
      app.db.query<{ n: number }>('SELECT COUNT(*) AS n FROM watering_records')[0].n;
    const rows = countRows();

    for (const tz of INVALID) {
      const label = String(tz);
      const add = await request('post', `/watering/${plantId}`, owner.auth, { tz_offset: tz });
      expect(add.status, `add ${label}`).toBe(400);
      expect(add.body.error.fields).toEqual({ tz_offset: expect.any(String) });

      const edit = await request('patch', `/watering/${recordId}`, owner.auth, {
        date: 1_700_086_400,
        tz_offset: tz,
      });
      expect(edit.status, `edit ${label}`).toBe(400);

      const del = await request(
        'delete',
        `/watering/${recordId}?tz_offset=${encodeURIComponent(label)}`,
        owner.auth,
      );
      expect(del.status, `delete ${label}`).toBe(400);

      const batch = await request('post', '/watering/batch', owner.auth, {
        tz_offset: tz,
        entries: [{ plantId }],
      });
      expect(batch.status, `batch ${label}`).toBe(400);

      const batchDelete = await request('post', '/watering/batch/delete', owner.auth, {
        tz_offset: tz,
        ids: [recordId],
      });
      expect(batchDelete.status, `batch delete ${label}`).toBe(400);
    }

    expect(countRows()).toBe(rows);
    const unchanged = await request('get', `/watering/${recordId}`, owner.auth);
    expect(unchanged.body.data.date).toBe(1_700_000_000_000);
  });

  it('accepts the boundary offsets 840 and -840', async () => {
    const { owner, plants } = await setup();
    for (const tz of [840, -840]) {
      const res = await request('post', `/watering/${plants[0].plant_id}`, owner.auth, {
        tz_offset: tz,
      });
      expect(res.status, String(tz)).toBe(201);
    }
  });
});

describe('GET /watering/fertilizer-types revalidation', () => {
  it('keeps the one-hour private cache header and answers the same catalogue on every call', async () => {
    const { owner } = await setup();
    const first = await request('get', '/watering/fertilizer-types', owner.auth);
    const second = await request('get', '/watering/fertilizer-types', owner.auth);
    expect(first.headers['cache-control']).toBe('private, max-age=3600');
    expect(second.headers['cache-control']).toBe('private, max-age=3600');
    expect(second.body).toEqual(first.body);
    const again = await request('get', '/watering/fertilizer-types', owner.auth, undefined, {
      'if-none-match': first.headers.etag as string,
    });
    expect(again.status).toBe(304);
  });
});
