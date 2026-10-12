import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, createContractApp, type ContractApp } from './harness';

const DAY_MS = 24 * 60 * 60 * 1000;

type Signed = Awaited<ReturnType<ContractApp['signIn']>>;
interface Summary {
  id: number;
  name: string;
  cover: { id: number } | null;
  component_count: number;
  created_at: number;
}

let app: ContractApp;
let admin: Signed;
let comps: { id: number; name: string }[];

const mkComponent = async (name: string, fineness: number) => {
  const res = await app.client.request({
    method: 'post',
    url: `${API}/components`,
    headers: admin.auth,
    json: { name, fineness },
  });
  return res.body.data as { id: number; name: string };
};

const mkSubstrate = async (
  who: Signed,
  name: string,
  extra: { isPublic?: boolean; components?: { componentId: number; parts: number }[] } = {},
) => {
  const res = await app.client.request({
    method: 'post',
    url: `${API}/substrates`,
    headers: who.auth,
    json: { name, isPublic: false, ...extra },
  });
  if (res.status !== 201) throw new Error(`create failed ${res.status} ${res.text}`);
  return res.body.data.substrate_id as number;
};

const list = (who: Signed, query = '') =>
  app.client.request({ method: 'get', url: `${API}/substrates?${query}`, headers: who.auth });

const walk = async (who: Signed, query: string) => {
  const items: Summary[] = [];
  const totals: unknown[] = [];
  let cursor: string | null = null;
  do {
    const res = await list(who, `${query}${cursor ? `&cursor=${cursor}` : ''}`);
    expect(res.status).toBe(200);
    totals.push(res.body.data.total);
    items.push(...res.body.data.items);
    cursor = res.body.data.next_cursor;
  } while (cursor);
  return { items, totals };
};

const readDetail = (who: Signed, id: number) =>
  app.client.request({ method: 'get', url: `${API}/substrates/${id}`, headers: who.auth });

const rowCount = (name: string) =>
  app.db.query<{ n: number }>('SELECT COUNT(*) AS n FROM substrates WHERE name = ?', [name])[0].n;

beforeAll(async () => {
  app = await createContractApp();
  admin = await app.signIn('admin');
  comps = [
    await mkComponent('Perlite', 1),
    await mkComponent('Coir', 2),
    await mkComponent('Sand', 3),
  ];
});
afterAll(() => app.close());

describe('substrate list scopes per role', () => {
  it('gives every role the same own/public split and the guest only the public scope', async () => {
    const user = await app.signIn('user');
    const other = await app.signIn('user');
    const guest = await app.signIn('guest');
    const ids = {
      adminPub: await mkSubstrate(admin, 'role-admin-pub', { isPublic: true }),
      adminPriv: await mkSubstrate(admin, 'role-admin-priv'),
      userPub: await mkSubstrate(user, 'role-user-pub', { isPublic: true }),
      userPriv: await mkSubstrate(user, 'role-user-priv'),
      otherPub: await mkSubstrate(other, 'role-other-pub', { isPublic: true }),
    };
    const idsOf = async (who: Signed, scope: string) =>
      (await list(who, `scope=${scope}&q=role-&limit=100`)).body.data.items
        .map((i: Summary) => i.id)
        .sort((a: number, b: number) => a - b);
    const sorted = (...v: number[]) => v.sort((a, b) => a - b);

    expect(await idsOf(user, 'mine')).toEqual(sorted(ids.userPub, ids.userPriv));
    expect(await idsOf(admin, 'mine')).toEqual(sorted(ids.adminPub, ids.adminPriv));
    const publicIds = sorted(ids.adminPub, ids.userPub, ids.otherPub);
    for (const who of [user, admin, other, guest]) {
      expect(await idsOf(who, 'public')).toEqual(publicIds);
    }
    const guestDefault = await list(guest, 'q=role-&limit=100');
    expect(guestDefault.body.data.items.map((i: Summary) => i.id).sort()).toEqual(
      publicIds.slice().sort(),
    );
    expect((await list(guest, 'scope=mine')).body.data.items).toEqual([]);
  });
});

describe('substrate list summaries', () => {
  it('carries cover and component_count but no components or images arrays', async () => {
    const owner = await app.signIn('user');
    const id = await mkSubstrate(owner, 'sum-one', {
      components: [
        { componentId: comps[0].id, parts: 1 },
        { componentId: comps[1].id, parts: 2 },
      ],
    });
    const bare = await mkSubstrate(owner, 'sum-bare');
    for (const [url, date] of [
      ['/uploads/substrate/old.webp', 1000],
      ['/uploads/substrate/new.webp', 2000],
    ] as const) {
      app.db.execute(
        "INSERT INTO images (image_url, entity_type, entity_id, upload_date, variants) VALUES (?, 'substrate', ?, ?, 1)",
        [url, id, date],
      );
    }
    const res = await list(owner, 'q=sum-');
    const byId = new Map<number, Record<string, unknown>>(
      res.body.data.items.map((i: { id: number }) => [i.id, i as Record<string, unknown>]),
    );
    for (const item of byId.values()) {
      expect(item).not.toHaveProperty('components');
      expect(item).not.toHaveProperty('images');
    }
    expect(byId.get(id)).toMatchObject({
      component_count: 2,
      cover: { url: expect.stringMatching(/new\.webp$/), date: 2000 },
    });
    expect(byId.get(bare)).toMatchObject({ component_count: 0, cover: null });
  });

  it('reports created_at in epoch milliseconds', async () => {
    const owner = await app.signIn('user');
    await mkSubstrate(owner, 'ms-check');
    const item = (await list(owner, 'q=ms-check')).body.data.items[0];
    expect(Math.abs(Date.now() - item.created_at)).toBeLessThan(DAY_MS);
    expect(item.created_at).toBeGreaterThan(1e12);
  });
});

describe('substrate list keyset walks', () => {
  it('walks sort=created newest first across same-second inserts with limit 7', async () => {
    const owner = await app.signIn('user');
    const created: number[] = [];
    for (let i = 0; i < 17; i += 1) created.push(await mkSubstrate(owner, `walkc-${i}`));
    const { items, totals } = await walk(owner, 'sort=created&limit=7&q=walkc-');
    expect(items.map((i) => i.id)).toEqual([...created].reverse());
    expect(totals).toEqual([17, undefined, undefined]);
  });

  it('walks sort=name case-insensitively with equal names tied by id with limit 7', async () => {
    const owner = await app.signIn('user');
    const names = ['walkn-b', 'WALKN-a', 'walkn-B', 'walkn-a', 'WALKN-C', 'walkn-b', 'walkn-A'];
    const all = [...names, ...names, 'walkn-d'];
    const idByCreate: { id: number; name: string }[] = [];
    for (const name of all) idByCreate.push({ id: await mkSubstrate(owner, name), name });
    const expected = [...idByCreate].sort(
      (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id - b.id,
    );
    const { items, totals } = await walk(owner, 'sort=name&limit=7&q=walkn-');
    expect(items.map((i) => i.id)).toEqual(expected.map((e) => e.id));
    expect(new Set(items.map((i) => i.id)).size).toBe(all.length);
    expect(totals).toEqual([all.length, undefined, undefined]);
  });

  it('walks the public scope with a name search and never returns a private row', async () => {
    const owner = await app.signIn('user');
    const viewer = await app.signIn('user');
    const pubs: number[] = [];
    for (let i = 0; i < 9; i += 1) {
      pubs.push(await mkSubstrate(owner, `walkp-${i}`, { isPublic: true }));
      await mkSubstrate(owner, `walkp-${i}-private`);
    }
    const { items } = await walk(viewer, 'scope=public&sort=created&limit=7&q=walkp-');
    expect(items.map((i) => i.id)).toEqual([...pubs].reverse());
  });

  it('matches q literally for % and _ and case-insensitively', async () => {
    const owner = await app.signIn('user');
    await mkSubstrate(owner, 'q 50% bark');
    await mkSubstrate(owner, 'q_under');
    await mkSubstrate(owner, 'qXunder');
    const names = async (q: string) =>
      (await list(owner, `q=${encodeURIComponent(q)}`)).body.data.items.map((i: Summary) => i.name);
    expect(await names('%')).toEqual(['q 50% bark']);
    expect(await names('q_u')).toEqual(['q_under']);
    expect(await names('QXUNDER')).toEqual(['qXunder']);
  });
});

describe('substrate list used-in filter visibility', () => {
  it('never returns another users private substrate and shows public ones only in the public scope', async () => {
    const component = comps[2];
    const viewer = await app.signIn('user');
    const other = await app.signIn('user');
    const mix = [{ componentId: component.id, parts: 1 }];
    const otherPrivate = await mkSubstrate(other, 'used-other-private', { components: mix });
    const otherPublic = await mkSubstrate(other, 'used-other-public', {
      isPublic: true,
      components: mix,
    });
    const minePrivate = await mkSubstrate(viewer, 'used-mine-private', { components: mix });
    const minePublic = await mkSubstrate(viewer, 'used-mine-public', {
      isPublic: true,
      components: mix,
    });
    const ids = async (scope: string) =>
      (
        await list(viewer, `scope=${scope}&component_id=${component.id}&q=used-&limit=100`)
      ).body.data.items
        .map((i: Summary) => i.id)
        .sort((a: number, b: number) => a - b);
    const mine = await ids('mine');
    const pub = await ids('public');
    expect(mine).toEqual([minePrivate, minePublic].sort((a, b) => a - b));
    expect(pub).toEqual([otherPublic, minePublic].sort((a, b) => a - b));
    expect([...mine, ...pub]).not.toContain(otherPrivate);
  });
});

describe('substrate list caching and totals', () => {
  it('answers 304 for a matching ETag and a new body once the data changes', async () => {
    const owner = await app.signIn('user');
    await mkSubstrate(owner, 'etag-1');
    const first = await list(owner, 'q=etag-');
    const tag = first.headers.etag as string;
    expect(tag).toBeTruthy();
    expect(first.headers['cache-control']).toBe('private, no-cache');
    const again = await app.client.request({
      method: 'get',
      url: `${API}/substrates?q=etag-`,
      headers: { ...owner.auth, 'if-none-match': tag },
    });
    expect(again.status).toBe(304);
    await mkSubstrate(owner, 'etag-2');
    const changed = await app.client.request({
      method: 'get',
      url: `${API}/substrates?q=etag-`,
      headers: { ...owner.auth, 'if-none-match': tag },
    });
    expect(changed.status).toBe(200);
    expect(changed.body.data.items).toHaveLength(2);
  });

  it('sends total on the first page only', async () => {
    const owner = await app.signIn('user');
    for (let i = 0; i < 3; i += 1) await mkSubstrate(owner, `tot-${i}`);
    const first = await list(owner, 'limit=2&q=tot-');
    expect(first.body.data.total).toBe(3);
    const second = await list(owner, `limit=2&q=tot-&cursor=${first.body.data.next_cursor}`);
    expect(second.body.data).not.toHaveProperty('total');
  });
});

describe('one-request writes', () => {
  it('creates with components and shows them in the detail with fineness and parts', async () => {
    const owner = await app.signIn('user');
    const id = await mkSubstrate(owner, 'detail-mix', {
      components: [
        { componentId: comps[2].id, parts: 3 },
        { componentId: comps[0].id, parts: 1.5 },
      ],
    });
    const detail = (await readDetail(owner, id)).body.data;
    expect(detail.components).toEqual([
      {
        component_id: comps[0].id,
        component_name: 'Perlite',
        component_fineness: 'coarse',
        component_parts: 1.5,
      },
      {
        component_id: comps[2].id,
        component_name: 'Sand',
        component_fineness: 'fine',
        component_parts: 3,
      },
    ]);
  });

  it('removes a component with removedComponents and clears the mix with an empty replace', async () => {
    const owner = await app.signIn('user');
    const id = await mkSubstrate(owner, 'edit-mix', {
      components: comps.map((c) => ({ componentId: c.id, parts: 1 })),
    });
    const removed = await app.client.request({
      method: 'patch',
      url: `${API}/substrates/${id}`,
      headers: owner.auth,
      json: { removedComponents: [comps[1].id] },
    });
    expect(removed.status).toBe(200);
    expect(
      (await readDetail(owner, id)).body.data.components.map(
        (c: { component_id: number }) => c.component_id,
      ),
    ).toEqual([comps[0].id, comps[2].id]);
    const cleared = await app.client.request({
      method: 'patch',
      url: `${API}/substrates/${id}`,
      headers: owner.auth,
      json: { components: [] },
    });
    expect(cleared.status).toBe(200);
    expect((await readDetail(owner, id)).body.data.components).toEqual([]);
  });

  it('rejects a nonexistent component on create with 400 and writes no substrate row', async () => {
    const owner = await app.signIn('user');
    const res = await app.client.request({
      method: 'post',
      url: `${API}/substrates`,
      headers: owner.auth,
      json: {
        name: 'ghost-create',
        components: [
          { componentId: comps[0].id, parts: 1 },
          { componentId: 987654, parts: 1 },
        ],
      },
    });
    expect(res.status).toBe(400);
    expect(rowCount('ghost-create')).toBe(0);
  });

  it('rejects duplicate components with 400 on create and on PATCH', async () => {
    const owner = await app.signIn('user');
    const dup = [
      { componentId: comps[0].id, parts: 1 },
      { componentId: comps[0].id, parts: 2 },
    ];
    const created = await app.client.request({
      method: 'post',
      url: `${API}/substrates`,
      headers: owner.auth,
      json: { name: 'dup-create', components: dup },
    });
    expect(created.status).toBe(400);
    expect(rowCount('dup-create')).toBe(0);
    const id = await mkSubstrate(owner, 'dup-patch');
    const patched = await app.client.request({
      method: 'patch',
      url: `${API}/substrates/${id}`,
      headers: owner.auth,
      json: { name: 'dup-renamed', components: dup },
    });
    expect(patched.status).toBe(400);
    expect((await readDetail(owner, id)).body.data.substrate_name).toBe('dup-patch');
  });

  it('rejects more than 100 components on PATCH /:id with 400 and keeps the mix', async () => {
    const owner = await app.signIn('user');
    const id = await mkSubstrate(owner, 'big-patch', {
      components: [{ componentId: comps[0].id, parts: 1 }],
    });
    const tooMany = Array.from({ length: 101 }, (_, i) => ({ componentId: i + 1, parts: 1 }));
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/substrates/${id}`,
      headers: owner.auth,
      json: { components: tooMany },
    });
    expect(res.status).toBe(400);
    expect((await readDetail(owner, id)).body.data.components).toHaveLength(1);
  });

  it('answers 404 on every mutation of a foreign substrate and changes nothing', async () => {
    const owner = await app.signIn('user');
    const intruder = await app.signIn('user');
    const id = await mkSubstrate(owner, 'foreign-target', {
      isPublic: true,
      components: [{ componentId: comps[0].id, parts: 1 }],
    });
    const attempts = [
      ['patch', `${API}/substrates/${id}`, { name: 'hijack' }],
      ['patch', `${API}/substrates/${id}`, { components: [] }],
      ['patch', `${API}/substrates/${id}`, { removedComponents: [comps[0].id] }],
      ['delete', `${API}/substrates/${id}`, undefined],
      [
        'post',
        `${API}/substrates/${id}/components`,
        { components: [{ componentId: comps[1].id, parts: 1 }] },
      ],
      ['patch', `${API}/substrates/${id}/components`, { components: [] }],
    ] as const;
    for (const [method, url, json] of attempts) {
      const res = await app.client.request({ method, url, headers: intruder.auth, json });
      expect(res.status, `${method} ${url} ${JSON.stringify(json)}`).toBe(404);
    }
    const detail = (await readDetail(owner, id)).body.data;
    expect(detail.substrate_name).toBe('foreign-target');
    expect(detail.components.map((c: { component_id: number }) => c.component_id)).toEqual([
      comps[0].id,
    ]);
  });

  it('answers 403 for a guest on every mutation', async () => {
    const owner = await app.signIn('user');
    const guest = await app.signIn('guest');
    const id = await mkSubstrate(owner, 'guest-target', { isPublic: true });
    const attempts = [
      ['post', `${API}/substrates`, { name: 'guest-made' }],
      ['patch', `${API}/substrates/${id}`, { name: 'x' }],
      ['delete', `${API}/substrates/${id}`, undefined],
      [
        'post',
        `${API}/substrates/${id}/components`,
        { components: [{ componentId: comps[0].id, parts: 1 }] },
      ],
      ['patch', `${API}/substrates/${id}/components`, { components: [] }],
    ] as const;
    for (const [method, url, json] of attempts) {
      const res = await app.client.request({ method, url, headers: guest.auth, json });
      expect(res.status, `${method} ${url}`).toBe(403);
    }
    expect(rowCount('guest-made')).toBe(0);
  });
});

describe('substrate detail shape', () => {
  it('lists images oldest first and gives a srcset only to variants=1 webp rows', async () => {
    const owner = await app.signIn('user');
    const id = await mkSubstrate(owner, 'img-detail');
    const insert = (url: string, date: number, variants: number) =>
      app.db.execute(
        "INSERT INTO images (image_url, entity_type, entity_id, upload_date, width, height, variants) VALUES (?, 'substrate', ?, ?, 10, 20, ?)",
        [url, id, date, variants],
      );
    insert('/uploads/substrate/newest.webp', 3000, 1);
    insert('/uploads/substrate/oldest.jpg', 1000, 0);
    insert('/uploads/substrate/middle.webp', 2000, 0);
    const detail = (await readDetail(owner, id)).body.data;
    expect(detail.images.map((i: { date: number }) => i.date)).toEqual([1000, 2000, 3000]);
    expect(detail.images.map((i: { srcset: string | null }) => i.srcset !== null)).toEqual([
      false,
      false,
      true,
    ]);
    expect(detail.images[2].srcset).toMatch(
      /newest-160\.webp 160w, .*newest-480\.webp 480w, .*newest\.webp 1024w$/,
    );
    expect(detail.images[2]).toMatchObject({ width: 10, height: 20 });
    expect(detail.cover.url).toMatch(/newest\.webp$/);
  });
});
