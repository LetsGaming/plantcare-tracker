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
interface ListItem {
  plant_id: number;
  plant_name: string;
  is_public: boolean;
  user_id: number;
  watering: unknown;
}
interface Page {
  items: ListItem[];
  next_cursor: string | null;
  total?: number;
}

const getList = (auth: Auth | undefined, query: string, headers: Record<string, string> = {}) =>
  app.client.request({
    method: 'get',
    url: `${API}/plants${query}`,
    headers: { ...(auth ?? {}), ...headers },
  });

const walk = async (auth: Auth | undefined, query: string, maxPages = 40) => {
  const ids: number[] = [];
  const totals: Array<number | undefined> = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    expect(++pages).toBeLessThanOrEqual(maxPages);
    const suffix: string = cursor ? `${query}&cursor=${encodeURIComponent(cursor)}` : query;
    const res = await getList(auth, suffix);
    expect(res.status).toBe(200);
    const data = res.body.data as Page;
    ids.push(...data.items.map((i) => i.plant_id));
    totals.push(data.total);
    cursor = data.next_cursor;
  } while (cursor);
  return { ids, totals, pages };
};

const seedPlants = async (
  owner: { auth: Auth; user: { id: number } },
  names: string[],
  isPublic: (index: number) => boolean,
) => {
  const substrate = await createSubstrate(app, owner.auth);
  const ids: number[] = [];
  for (const [index, name] of names.entries()) {
    const plant = await createPlant(app, owner.auth, substrate.substrate_id, {
      name,
      isPublic: isPublic(index),
    });
    ids.push(plant.plant_id);
  }
  return ids;
};

const forceTies = (ids: number[], groupSize: number) => {
  const base = 1_750_000_000;
  for (const [index, id] of ids.entries()) {
    app.db.execute('UPDATE plants SET created_at = ? WHERE id = ?', [
      base + Math.floor(index / groupSize),
      id,
    ]);
  }
};

const expectedIds = (where: string, params: Array<string | number>, sort: 'created' | 'name') =>
  app.db
    .query<{ id: number }>(
      `SELECT id FROM plants WHERE ${where} ORDER BY ${
        sort === 'created' ? 'created_at DESC, id DESC' : 'name COLLATE NOCASE ASC, id ASC'
      }`,
      params,
    )
    .map((r) => r.id);

describe('GET /plants keyset walk over tied rows', () => {
  const NAMES = Array.from(
    { length: 31 },
    (_, i) => ['alpha', 'Alpha', 'ALPHA', 'beta', 'Beta'][i % 5],
  );

  it.each(['created', 'name'] as const)(
    'walks scope=mine with sort=%s in pages of 7 and equals the full set',
    async (sort) => {
      const owner = await app.signIn('user');
      const other = await app.signIn('user');
      const mine = await seedPlants(owner, NAMES, (i) => i % 2 === 0);
      await seedPlants(other, ['foreign-a', 'foreign-b'], () => true);
      forceTies(mine, 4);

      const result = await walk(owner.auth, `?scope=mine&limit=7&sort=${sort}`);
      expect(result.ids).toEqual(expectedIds('user_id = ?', [owner.user.id], sort));
      expect(result.ids).toHaveLength(31);
      expect(new Set(result.ids).size).toBe(31);
      expect(result.pages).toBe(5);
      expect(result.totals).toEqual([31, undefined, undefined, undefined, undefined]);
    },
  );

  it.each(['created', 'name'] as const)(
    'walks scope=public with sort=%s in pages of 7, never leaks private plants and equals the full set',
    async (sort) => {
      const owner = await app.signIn('user');
      const owned = await seedPlants(owner, NAMES, (i) => i % 3 !== 0);
      forceTies(owned, 5);

      const result = await walk(owner.auth, `?scope=public&limit=7&sort=${sort}`, 80);
      const expected = expectedIds('is_public = 1', [], sort);
      expect(result.ids).toEqual(expected);
      expect(new Set(result.ids).size).toBe(expected.length);
      expect(result.totals[0]).toBe(expected.length);
      expect(result.totals.slice(1).every((t) => t === undefined)).toBe(true);

      const privateIds = new Set(
        app.db.query<{ id: number }>('SELECT id FROM plants WHERE is_public = 0').map((r) => r.id),
      );
      expect(result.ids.some((id) => privateIds.has(id))).toBe(false);
    },
  );

  it('walks the public scope for an anonymous caller with the same result as for a user', async () => {
    const owner = await app.signIn('user');
    const owned = await seedPlants(owner, NAMES.slice(0, 15), () => true);
    forceTies(owned, 3);
    const anonymous = await walk(undefined, '?limit=7&sort=name', 80);
    const signedIn = await walk(owner.auth, '?scope=public&limit=7&sort=name', 80);
    expect(anonymous.ids).toEqual(signedIn.ids);
  });

  it('keeps the walk stable when a plant is added between pages', async () => {
    const owner = await app.signIn('user');
    const mine = await seedPlants(owner, NAMES.slice(0, 20), () => false);
    forceTies(mine, 4);
    const before = expectedIds('user_id = ?', [owner.user.id], 'created');

    const first = await getList(owner.auth, '?limit=7');
    const substrate = await createSubstrate(app, owner.auth);
    await createPlant(app, owner.auth, substrate.substrate_id, { name: 'late arrival' });
    const second = await getList(
      owner.auth,
      `?limit=7&cursor=${encodeURIComponent(first.body.data.next_cursor)}`,
    );
    const third = await getList(
      owner.auth,
      `?limit=7&cursor=${encodeURIComponent(second.body.data.next_cursor)}`,
    );
    const seen = [first, second, third].flatMap((r) =>
      (r.body.data as Page).items.map((i) => i.plant_id),
    );
    expect(seen).toEqual(before);
  });
});

describe('GET /plants limit, q and total', () => {
  it('clamps limit above the maximum to 100 items', async () => {
    const owner = await app.signIn('user');
    const ids = await seedPlants(
      owner,
      Array.from({ length: 105 }, (_, i) => `bulk ${i}`),
      () => false,
    );
    forceTies(ids, 10);
    const res = await getList(owner.auth, '?limit=500&q=bulk');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(100);
    expect(res.body.data.total).toBe(105);
    expect(res.body.data.next_cursor).toEqual(expect.any(String));
    const rest = await getList(
      owner.auth,
      `?limit=500&q=bulk&cursor=${encodeURIComponent(res.body.data.next_cursor)}`,
    );
    expect(rest.body.data.items).toHaveLength(5);
    expect(rest.body.data.next_cursor).toBeNull();
  });

  it('applies q over pages with the total of the filter on page 1 only', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const make = async (name: string, species: string) =>
      createPlant(app, owner.auth, substrate.substrate_id, { name, species });
    const hits: number[] = [];
    for (let i = 0; i < 15; i += 1) {
      hits.push((await make(`Needle ${i}`, 'Filler species')).plant_id);
    }
    hits.push((await make('plain', 'Needlewort')).plant_id);
    for (let i = 0; i < 6; i += 1) await make(`hay ${i}`, 'Filler species');
    await make('100% sure', 'Percent plant');
    await make('1000 sure', 'Percent plant');
    forceTies([...hits], 4);

    const result = await walk(owner.auth, '?q=needle&limit=7&sort=created');
    expect(result.ids).toHaveLength(16);
    expect(new Set(result.ids)).toEqual(new Set(hits));
    expect(result.totals).toEqual([16, undefined, undefined]);

    const wildcard = await getList(owner.auth, `?q=${encodeURIComponent('100%')}`);
    expect(
      wildcard.body.data.items.map((i: ListItem) => i.plant_name),
      'a percent sign in q is literal',
    ).toEqual(['100% sure']);
    expect(wildcard.body.data.total).toBe(1);

    const none = await getList(owner.auth, '?q=zzzzzz-no-match');
    expect(none.body.data).toEqual({ items: [], next_cursor: null, total: 0 });

    const tooLong = await getList(owner.auth, `?q=${'x'.repeat(101)}`);
    expect(tooLong.status).toBe(400);
    const maxLength = await getList(owner.auth, `?q=${'x'.repeat(100)}`);
    expect(maxLength.status).toBe(200);
  });

  it('does not search other users private plants through q', async () => {
    const owner = await app.signIn('user');
    const other = await app.signIn('user');
    await seedPlants(owner, ['Hidden Gem Contract'], () => false);
    const asOther = await getList(other.auth, '?scope=public&q=Hidden Gem Contract');
    expect(asOther.body.data).toEqual({ items: [], next_cursor: null, total: 0 });
    const anonymous = await getList(undefined, '?q=Hidden Gem Contract');
    expect(anonymous.body.data.items).toEqual([]);
  });
});

describe('GET /plants scopes per role', () => {
  it('answers each role with the right scope, default and total', async () => {
    const owner = await app.signIn('user');
    const admin = await app.signIn('admin');
    const guest = await app.signIn('guest');
    await seedPlants(owner, ['RoleMatrix a', 'RoleMatrix b', 'RoleMatrix c'], (i) => i === 0);
    await seedPlants(admin, ['RoleMatrix admin'], () => true);
    const q = 'q=RoleMatrix';

    const names = async (auth: Auth | undefined, extra: string) => {
      const res = await getList(auth, `?${q}${extra}&sort=name`);
      expect(res.status).toBe(200);
      return { names: (res.body.data as Page).items.map((i) => i.plant_name), page: res.body.data };
    };

    const userMine = await names(owner.auth, '');
    expect(userMine.names).toEqual(['RoleMatrix a', 'RoleMatrix b', 'RoleMatrix c']);
    expect(userMine.page.total).toBe(3);
    expect(userMine.page.items.every((i: ListItem) => i.watering !== null)).toBe(true);

    const userPublic = await names(owner.auth, '&scope=public');
    expect(userPublic.names).toEqual(['RoleMatrix a', 'RoleMatrix admin']);
    expect(userPublic.page.items.every((i: ListItem) => i.watering === null)).toBe(true);

    const adminMine = await names(admin.auth, '&scope=mine');
    expect(adminMine.names).toEqual(['RoleMatrix admin']);

    const guestDefault = await names(guest.auth, '');
    expect(guestDefault.names).toEqual(['RoleMatrix a', 'RoleMatrix admin']);
    const guestMine = await getList(guest.auth, `?${q}&scope=mine`);
    expect(guestMine.status).toBe(200);
    expect(guestMine.body.data).toEqual({ items: [], next_cursor: null, total: 0 });

    const anonymousDefault = await names(undefined, '');
    expect(anonymousDefault.names).toEqual(['RoleMatrix a', 'RoleMatrix admin']);
    const anonymousMine = await getList(undefined, `?${q}&scope=mine`);
    expect(anonymousMine.status).toBe(200);
    expect(anonymousMine.body.data).toEqual({ items: [], next_cursor: null, total: 0 });
  });

  it('answers an empty mine walk for a guest even with a cursor from another scope', async () => {
    const owner = await app.signIn('user');
    const guest = await app.signIn('guest');
    await seedPlants(owner, ['cursor a', 'cursor b', 'cursor c'], () => true);
    const first = await getList(owner.auth, '?scope=public&limit=1');
    const cursor = encodeURIComponent(first.body.data.next_cursor);
    const res = await getList(guest.auth, `?scope=mine&limit=1&cursor=${cursor}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.next_cursor).toBeNull();
  });
});

describe('GET /plants caching and compression', () => {
  const gunzip = (bytes: Buffer) => zlib.gunzipSync(bytes);

  it('answers 304 for the public list and for the mine list and a new ETag after a change', async () => {
    const owner = await app.signIn('user');
    const [id] = await seedPlants(owner, ['etag plant'], () => true);

    for (const [auth, query] of [
      [owner.auth, '?scope=mine'],
      [undefined, '?scope=public&limit=5'],
    ] as const) {
      const first = await getList(auth, query);
      expect(first.status).toBe(200);
      const tag = first.headers.etag as string;
      expect(tag).toBeTruthy();
      const again = await getList(auth, query, { 'if-none-match': tag });
      expect(again.status).toBe(304);
      expect(again.text).toBe('');
      const stale = await getList(auth, query, { 'if-none-match': 'W/"stale"' });
      expect(stale.status).toBe(200);
    }

    const before = await getList(owner.auth, '?scope=mine');
    app.db.execute('UPDATE plants SET name = ? WHERE id = ?', ['etag renamed', id]);
    const after = await getList(owner.auth, '?scope=mine', {
      'if-none-match': before.headers.etag as string,
    });
    expect(after.status).toBe(200);
    expect(after.headers.etag).not.toBe(before.headers.etag);
  });

  it('answers 304 for a gzip request that repeats its ETag', async () => {
    const owner = await app.signIn('user');
    await seedPlants(
      owner,
      Array.from({ length: 12 }, (_, i) => `gzip etag plant ${i}`),
      () => false,
    );
    const first = await getList(owner.auth, '?limit=30', { 'accept-encoding': 'gzip' });
    expect(first.headers['content-encoding']).toBe('gzip');
    const again = await getList(owner.auth, '?limit=30', {
      'accept-encoding': 'gzip',
      'if-none-match': first.headers.etag as string,
    });
    expect(again.status).toBe(304);
  });

  it('compresses a list above the threshold and keeps a tiny one uncompressed', async () => {
    const owner = await app.signIn('user');
    const empty = await app.signIn('user');
    await seedPlants(
      owner,
      Array.from({ length: 12 }, (_, i) => `compress plant ${i}`),
      () => false,
    );
    const big = await getList(owner.auth, '?limit=30', { 'accept-encoding': 'gzip' });
    expect(big.status).toBe(200);
    expect(big.headers['content-encoding']).toBe('gzip');
    expect(big.headers.vary).toMatch(/accept-encoding/i);
    const json = JSON.parse(gunzip(big.bytes).toString('utf8')) as { data: Page };
    expect(json.data.items).toHaveLength(12);

    const plain = await getList(owner.auth, '?limit=30');
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(JSON.parse(plain.text).data.items).toHaveLength(12);

    const tiny = await getList(empty.auth, '?limit=30', { 'accept-encoding': 'gzip' });
    expect(tiny.headers['content-encoding']).toBeUndefined();
    expect(tiny.body.data.items).toEqual([]);
  });

  it('keeps a first page of 30 items with covers under 20 KB gzipped', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth, { name: 'Contract substrate' });
    const ids: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      const plant = await createPlant(app, owner.auth, substrate.substrate_id, {
        name: `Budget plant number ${i} with a long display name`,
        species: `Budgetus longspeciesnamus ${i}`,
        isPublic: true,
      });
      ids.push(plant.plant_id);
    }
    const png = await app.png();
    for (const id of ids.slice(10)) {
      const upload = await app.client.request({
        method: 'post',
        url: `${API}/images/plant/${id}`,
        headers: owner.auth,
        multipart: [{ field: 'image', filename: 'p.png', contentType: 'image/png', data: png }],
      });
      expect(upload.status, upload.text).toBeLessThan(300);
    }
    for (const id of ids.slice(10)) {
      app.db.execute(
        'INSERT INTO watering_records (plant_id, date, used_fertilizer) VALUES (?, ?, 1)',
        [id, 1_750_000_000 - id * 3600],
      );
    }

    const res = await getList(owner.auth, '?scope=mine&limit=30', { 'accept-encoding': 'gzip' });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    const raw = gunzip(res.bytes);
    const data = JSON.parse(raw.toString('utf8')).data as Page;
    expect(data.items).toHaveLength(30);
    expect(data.total).toBe(40);
    expect(data.items.filter((i) => (i as unknown as { cover: unknown }).cover).length).toBe(30);
    expect(res.bytes.length).toBeLessThan(20 * 1024);
    expect(zlib.gzipSync(raw).length).toBeLessThan(20 * 1024);
  });
});

describe('GET /plants tz_offset validation', () => {
  it.each(['841', '-841', '1.5', 'abc', '1e2x'])(
    'rejects tz_offset=%s with 400 on the list',
    async (value) => {
      const owner = await app.signIn('user');
      const res = await getList(owner.auth, `?tz_offset=${encodeURIComponent(value)}`);
      expect(res.status).toBe(400);
      expect(res.body.error.fields).toEqual({ tz_offset: expect.any(String) });
    },
  );

  it.each(['840', '-840', '0', '+120'])('accepts tz_offset=%s', async (value) => {
    const owner = await app.signIn('user');
    const res = await getList(owner.auth, `?tz_offset=${encodeURIComponent(value)}`);
    expect(res.status).toBe(200);
  });

  it('applies the same validation to plant create, update and detail reads', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const plant = await createPlant(app, owner.auth, substrate.substrate_id);
    for (const value of ['841', '-841', '1.5', 'abc']) {
      const detail = await app.client.request({
        method: 'get',
        url: `${API}/plants/${plant.plant_id}?tz_offset=${value}`,
        headers: owner.auth,
      });
      expect(detail.status, `detail ${value}`).toBe(400);
      const create = await app.client.request({
        method: 'post',
        url: `${API}/plants?tz_offset=${value}`,
        headers: owner.auth,
        json: { name: 'tz create', substrateId: substrate.substrate_id },
      });
      expect(create.status, `create ${value}`).toBe(400);
      const update = await app.client.request({
        method: 'patch',
        url: `${API}/plants/${plant.plant_id}?tz_offset=${value}`,
        headers: owner.auth,
        json: { name: 'tz update' },
      });
      expect(update.status, `update ${value}`).toBe(400);
    }
    const untouched = await app.client.request({
      method: 'get',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
    });
    expect(untouched.body.data.plant_name).toBe('Monstera');
    expect(app.db.query('SELECT id FROM plants WHERE name = ?', ['tz create'])).toEqual([]);
  });

  it('changes the distinct-day count and the average when a late-evening record is shifted over midnight', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const plant = await createPlant(app, owner.auth, substrate.substrate_id, {
      name: 'TzBoundary',
    });
    const lateUtc = Date.UTC(2026, 5, 1, 22, 30) / 1000;
    const earlyNextUtc = Date.UTC(2026, 5, 2, 1, 30) / 1000;
    const lastUtc = Date.UTC(2026, 5, 5, 12) / 1000;
    for (const date of [lateUtc, earlyNextUtc, lastUtc]) {
      app.db.execute('INSERT INTO watering_records (plant_id, date) VALUES (?, ?)', [
        plant.plant_id,
        date,
      ]);
    }
    const avg = async (tz: number) => {
      const res = await getList(owner.auth, `?q=TzBoundary&tz_offset=${tz}`);
      return res.body.data.items[0].watering.avg_interval_days as number | null;
    };
    // UTC: days 1, 2, 5 -> 3 distinct days, (5 - 1) / 2
    expect(await avg(0)).toBe(2);
    // +120: 22:30 -> 00:30 on day 2 and 01:30 -> 03:30 on day 2 -> 2 distinct days, (5 - 2) / 1
    expect(await avg(120)).toBe(3);
    // -300: 22:30 -> 17:30 day 1, 01:30 -> 20:30 day 1, 12:00 -> 07:00 day 5 -> (5 - 1) / 1
    expect(await avg(-300)).toBe(4);
    // +840: day 1 22:30 -> day 2 12:30, day 2 01:30 -> day 2 15:30, day 5 12:00 -> day 6 02:00 -> (6 - 2) / 1
    expect(await avg(840)).toBe(4);
  });
});
