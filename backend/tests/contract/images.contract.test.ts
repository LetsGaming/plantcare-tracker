import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { API, createContractApp, type ContractApp } from './harness';
import { createPlant, createSubstrate } from './support';

let app: ContractApp;
let png: Buffer;
let uploadsDir: string;

beforeAll(async () => {
  app = await createContractApp();
  png = await app.png();
  uploadsDir = (await import('../../src/core/config')).getUploadsDirectory();
});
afterAll(() => app.close());

const setup = async () => {
  const owner = await app.signIn('user');
  const substrate = await createSubstrate(app, owner.auth);
  const plant = await createPlant(app, owner.auth, substrate.substrate_id);
  return { owner, substrate, plant };
};

const upload = (
  auth: Record<string, string>,
  entityType: string,
  entityId: number,
  part: { filename?: string; contentType?: string; data?: Buffer | string } = {},
) =>
  app.client.request({
    method: 'post',
    url: `${API}/images/${entityType}/${entityId}`,
    headers: auth,
    multipart: [
      {
        field: 'image',
        filename: part.filename ?? 'photo.png',
        contentType: part.contentType ?? 'image/png',
        data: part.data ?? png,
      },
    ],
  });

const pathOf = (url: string) => new URL(url).pathname;

const variantFiles = (entityType: string, url: string) => {
  const main = path.join(uploadsDir, entityType, path.basename(pathOf(url)));
  return [main, main.replace(/\.webp$/, '-160.webp'), main.replace(/\.webp$/, '-480.webp')];
};

describe('POST /images/:entityType/:entityId', () => {
  it('stores a resized webp, answers 201 with Location, absolute URL and capture date', async () => {
    const { owner, plant } = await setup();
    const res = await upload(owner.auth, 'plant', plant.plant_id);
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/images/plant?entityId=${plant.plant_id}`);
    expect(res.body.data.path).toMatch(/^http:\/\/[^/]+\/uploads\/plant\/\d+-[a-z0-9-]+\.webp$/);
    expect(res.body.data.date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('writes the 160, 480 and 1024 variants and persists dimensions, placeholder and variants = 1', async () => {
    const { owner, plant } = await setup();
    const res = await upload(owner.auth, 'plant', plant.plant_id);
    variantFiles('plant', res.body.data.path).forEach((file) =>
      expect(fs.existsSync(file), file).toBe(true),
    );
    const [row] = app.db.query<{
      width: number;
      height: number;
      placeholder: string;
      variants: number;
    }>('SELECT width, height, placeholder, variants FROM images WHERE entity_id = ?', [
      plant.plant_id,
    ]);
    expect(row).toEqual({
      width: 8,
      height: 8,
      placeholder: expect.stringMatching(/^#[0-9a-f]{6}$/),
      variants: 1,
    });
  });

  it('serves the stored file statically as webp', async () => {
    const { owner, plant } = await setup();
    const res = await upload(owner.auth, 'plant', plant.plant_id);
    const file = await app.client.request({ method: 'get', url: pathOf(res.body.data.path) });
    expect(file.status).toBe(200);
    expect(String(file.headers['content-type'])).toBe('image/webp');
    expect((await sharp(file.bytes).metadata()).format).toBe('webp');
  });

  it('drops personal tokens from the stored file name and keeps the entity type', async () => {
    const { owner, plant } = await setup();
    const res = await upload(owner.auth, 'plant', plant.plant_id, {
      filename: 'iPhone-admin-Monstera_Leaf.png',
    });
    const name = pathOf(res.body.data.path).split('/').pop()!;
    expect(name).not.toMatch(/iphone|admin/i);
    expect(name).toContain('monstera-leaf');
  });

  it('rejects an unknown entity type with 400', async () => {
    const { owner } = await setup();
    const res = await upload(owner.auth, 'garden', 1);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('entityType must be one of: plant, substrate, component');
  });

  it('rejects a request without a file with 400', async () => {
    const { owner, plant } = await setup();
    const res = await app.client.request({
      method: 'post',
      url: `${API}/images/plant/${plant.plant_id}`,
      headers: owner.auth,
      multipart: [{ field: 'note', data: 'hello' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('No image file provided.');
  });

  it('rejects a disallowed MIME type with 400', async () => {
    const { owner, plant } = await setup();
    const res = await upload(owner.auth, 'plant', plant.plant_id, {
      filename: 'a.gif',
      contentType: 'image/gif',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(
      'Invalid file type. Only png, jpeg, jpg, and webp are allowed.',
    );
  });

  it('rejects a file over 10 MB with 400', async () => {
    const { owner, plant } = await setup();
    const res = await upload(owner.auth, 'plant', plant.plant_id, {
      data: Buffer.alloc(10 * 1024 * 1024 + 1024, 1),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('File too large. Maximum size is 10 MB.');
  });

  it('answers 401 without a token and 403 for a guest', async () => {
    const anon = await app.client.request({ method: 'post', url: `${API}/images/plant/1` });
    expect(anon.status).toBe(401);
    const guest = await app.signIn('guest');
    expect((await upload(guest.auth, 'plant', 1)).status).toBe(403);
  });
});

describe('GET /images/:entityType', () => {
  it('lists the images of an entity oldest first', async () => {
    const { owner, plant } = await setup();
    await upload(owner.auth, 'plant', plant.plant_id);
    await upload(owner.auth, 'plant', plant.plant_id);
    const res = await app.client.request({
      method: 'get',
      url: `${API}/images/plant?entityId=${plant.plant_id}`,
      headers: owner.auth,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toEqual({
      id: expect.any(Number),
      url: expect.stringMatching(/\/uploads\/plant\//),
      srcset: expect.stringMatching(/-160\.webp 160w, .+-480\.webp 480w, .+\.webp 1024w$/),
      width: 8,
      height: 8,
      placeholder: expect.stringMatching(/^#[0-9a-f]{6}$/),
      date: expect.any(Number),
      entityType: 'plant',
    });
  });

  it('rejects a missing or invalid entityId with a field error', async () => {
    const { owner } = await setup();
    const res = await app.client.request({
      method: 'get',
      url: `${API}/images/plant`,
      headers: owner.auth,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ entityId: 'must be a positive integer' });
  });

  it('requires authentication', async () => {
    expect(
      (await app.client.request({ method: 'get', url: `${API}/images/plant?entityId=1` })).status,
    ).toBe(401);
  });
});

describe('GET /images/:entityType/:entityId (removed)', () => {
  it('answers 404 for the former serve route and its ?size resize', async () => {
    const { owner, plant } = await setup();
    await upload(owner.auth, 'plant', plant.plant_id);
    for (const query of ['', '?size=4']) {
      const res = await app.client.request({
        method: 'get',
        url: `${API}/images/plant/${plant.plant_id}${query}`,
        headers: owner.auth,
      });
      expect(res.status, query).toBe(404);
    }
  });
});

describe('upload rate limit', () => {
  it('allows 30 uploads per user in the window and answers 429 afterwards', async () => {
    const { owner, plant } = await setup();
    for (let i = 0; i < 30; i += 1) {
      expect((await upload(owner.auth, 'plant', plant.plant_id)).status, String(i)).toBe(201);
    }
    const limited = await upload(owner.auth, 'plant', plant.plant_id);
    expect(limited.status).toBe(429);
    expect(limited.body.error).toMatchObject({ type: 'TooManyRequestsError', statusCode: 429 });
    const other = await app.signIn('user');
    const otherPlant = await createPlant(
      app,
      other.auth,
      (await createSubstrate(app, other.auth)).substrate_id,
    );
    expect((await upload(other.auth, 'plant', otherPlant.plant_id)).status).toBe(201);
  });
});

describe('PATCH rate limit', () => {
  it('counts date-only PATCHes against the same per-user window', async () => {
    const { owner, plant } = await setup();
    await upload(owner.auth, 'plant', plant.plant_id);
    const list = await app.client.request({
      method: 'get',
      url: `${API}/images/plant?entityId=${plant.plant_id}`,
      headers: owner.auth,
    });
    const id = list.body.data[0].id;
    const patch = () =>
      app.client.request({
        method: 'patch',
        url: `${API}/images/${id}`,
        headers: owner.auth,
        multipart: [{ field: 'date', data: '1717236000000' }],
      });
    for (let i = 0; i < 29; i += 1) {
      expect((await patch()).status, String(i)).toBe(200);
    }
    const limited = await patch();
    expect(limited.status).toBe(429);
    expect(limited.body.error).toMatchObject({ type: 'TooManyRequestsError', statusCode: 429 });
  });
});

describe('PATCH /images/:id', () => {
  it('updates the capture date', async () => {
    const { owner, plant } = await setup();
    await upload(owner.auth, 'plant', plant.plant_id);
    const list = await app.client.request({
      method: 'get',
      url: `${API}/images/plant?entityId=${plant.plant_id}`,
      headers: owner.auth,
    });
    const id = list.body.data[0].id;
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/images/${id}`,
      headers: owner.auth,
      multipart: [{ field: 'date', data: '1717236000000' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id, date: 1717236000, entityType: 'plant' });
  });

  it('replaces the file and removes the previous one', async () => {
    const { owner, plant } = await setup();
    const first = await upload(owner.auth, 'plant', plant.plant_id);
    const list = await app.client.request({
      method: 'get',
      url: `${API}/images/plant?entityId=${plant.plant_id}`,
      headers: owner.auth,
    });
    const id = list.body.data[0].id;
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/images/${id}`,
      headers: owner.auth,
      multipart: [{ field: 'image', filename: 'new.png', contentType: 'image/png', data: png }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.url).not.toBe(first.body.data.path);
    variantFiles('plant', first.body.data.path).forEach((file) =>
      expect(fs.existsSync(file), file).toBe(false),
    );
    variantFiles('plant', res.body.data.url).forEach((file) =>
      expect(fs.existsSync(file), file).toBe(true),
    );
    expect(
      (await app.client.request({ method: 'get', url: pathOf(first.body.data.path) })).status,
    ).toBe(404);
    expect(
      (await app.client.request({ method: 'get', url: pathOf(res.body.data.url) })).status,
    ).toBe(200);
  });

  it('rejects an update without file and date, an invalid date, and an unknown id', async () => {
    const { owner, plant } = await setup();
    await upload(owner.auth, 'plant', plant.plant_id);
    const list = await app.client.request({
      method: 'get',
      url: `${API}/images/plant?entityId=${plant.plant_id}`,
      headers: owner.auth,
    });
    const id = list.body.data[0].id;
    const none = await app.client.request({
      method: 'patch',
      url: `${API}/images/${id}`,
      headers: owner.auth,
      multipart: [{ field: 'x', data: '1' }],
    });
    expect(none.status).toBe(400);
    const bad = await app.client.request({
      method: 'patch',
      url: `${API}/images/${id}`,
      headers: owner.auth,
      multipart: [{ field: 'date', data: 'garbage' }],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields).toHaveProperty('date');
    const missing = await app.client.request({
      method: 'patch',
      url: `${API}/images/999999`,
      headers: owner.auth,
      multipart: [{ field: 'date', data: '2024-06-01' }],
    });
    expect(missing.status).toBe(404);
  });
});

describe('DELETE /images', () => {
  it('deletes one image by id with 204 and removes the file', async () => {
    const { owner, plant } = await setup();
    const up = await upload(owner.auth, 'plant', plant.plant_id);
    const list = await app.client.request({
      method: 'get',
      url: `${API}/images/plant?entityId=${plant.plant_id}`,
      headers: owner.auth,
    });
    const res = await app.client.request({
      method: 'delete',
      url: `${API}/images/${list.body.data[0].id}`,
      headers: owner.auth,
    });
    expect(res.status).toBe(204);
    expect(
      (await app.client.request({ method: 'get', url: pathOf(up.body.data.path) })).status,
    ).toBe(404);
    variantFiles('plant', up.body.data.path).forEach((file) =>
      expect(fs.existsSync(file), file).toBe(false),
    );
  });

  it('removes only the single file of a legacy image (variants = 0)', async () => {
    const { owner, plant } = await setup();
    const up = await upload(owner.auth, 'plant', plant.plant_id);
    const [main, small, medium] = variantFiles('plant', up.body.data.path);
    app.db.execute('UPDATE images SET variants = 0 WHERE entity_id = ?', [plant.plant_id]);
    const list = await app.client.request({
      method: 'get',
      url: `${API}/images/plant?entityId=${plant.plant_id}`,
      headers: owner.auth,
    });
    expect(list.body.data[0]).toMatchObject({ srcset: null });
    const res = await app.client.request({
      method: 'delete',
      url: `${API}/images/${list.body.data[0].id}`,
      headers: owner.auth,
    });
    expect(res.status).toBe(204);
    expect(fs.existsSync(main)).toBe(false);
    expect(fs.existsSync(small)).toBe(true);
    expect(fs.existsSync(medium)).toBe(true);
  });

  it('answers 404 for an unknown image id', async () => {
    const { owner } = await setup();
    const res = await app.client.request({
      method: 'delete',
      url: `${API}/images/999999`,
      headers: owner.auth,
    });
    expect(res.status).toBe(404);
  });

  it('deletes all images of an entity with 204 and removes every variant file', async () => {
    const { owner, plant } = await setup();
    const first = await upload(owner.auth, 'plant', plant.plant_id);
    const second = await upload(owner.auth, 'plant', plant.plant_id);
    const res = await app.client.request({
      method: 'delete',
      url: `${API}/images/plant/${plant.plant_id}`,
      headers: owner.auth,
    });
    expect(res.status).toBe(204);
    [first, second]
      .flatMap((up) => variantFiles('plant', up.body.data.path))
      .forEach((file) => expect(fs.existsSync(file), file).toBe(false));
    const list = await app.client.request({
      method: 'get',
      url: `${API}/images/plant?entityId=${plant.plant_id}`,
      headers: owner.auth,
    });
    expect(list.body.data).toEqual([]);
  });

  it('answers 403 for a guest', async () => {
    const guest = await app.signIn('guest');
    expect(
      (await app.client.request({ method: 'delete', url: `${API}/images/1`, headers: guest.auth }))
        .status,
    ).toBe(403);
    expect(
      (
        await app.client.request({
          method: 'delete',
          url: `${API}/images/plant/1`,
          headers: guest.auth,
        })
      ).status,
    ).toBe(403);
  });
});

describe('authorization', () => {
  const listOf = (auth: Record<string, string>, plantId: number) =>
    app.client.request({
      method: 'get',
      url: `${API}/images/plant?entityId=${plantId}`,
      headers: auth,
    });

  it("answers 404 when uploading to or listing another user's private plant", async () => {
    const { owner, plant } = await setup();
    await upload(owner.auth, 'plant', plant.plant_id);
    const intruder = await app.signIn('user');
    expect((await upload(intruder.auth, 'plant', plant.plant_id)).status).toBe(404);
    expect((await listOf(intruder.auth, plant.plant_id)).status).toBe(404);
  });

  it("answers 404 when changing or deleting the images of another user's private plant", async () => {
    const { owner, plant } = await setup();
    await upload(owner.auth, 'plant', plant.plant_id);
    const imageId = (await listOf(owner.auth, plant.plant_id)).body.data[0].id;
    const intruder = await app.signIn('user');
    const patch = await app.client.request({
      method: 'patch',
      url: `${API}/images/${imageId}`,
      headers: intruder.auth,
      multipart: [{ field: 'date', data: '2024-06-01' }],
    });
    expect(patch.status).toBe(404);
    const del = await app.client.request({
      method: 'delete',
      url: `${API}/images/${imageId}`,
      headers: intruder.auth,
    });
    expect(del.status).toBe(404);
    const delAll = await app.client.request({
      method: 'delete',
      url: `${API}/images/plant/${plant.plant_id}`,
      headers: intruder.auth,
    });
    expect(delAll.status).toBe(404);
    expect((await listOf(owner.auth, plant.plant_id)).body.data).toHaveLength(1);
  });

  it('lets others view but not change the images of a public plant (403)', async () => {
    const owner = await app.signIn('user');
    const substrate = await createSubstrate(app, owner.auth);
    const plant = await createPlant(app, owner.auth, substrate.substrate_id, { isPublic: true });
    await upload(owner.auth, 'plant', plant.plant_id);
    const other = await app.signIn('user');
    expect((await listOf(other.auth, plant.plant_id)).status).toBe(200);
    const res = await upload(other.auth, 'plant', plant.plant_id);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('You may not change the images of this plant');
    const imageId = (await listOf(owner.auth, plant.plant_id)).body.data[0].id;
    const del = await app.client.request({
      method: 'delete',
      url: `${API}/images/${imageId}`,
      headers: other.auth,
    });
    expect(del.status).toBe(403);
  });

  it('answers 404 for entities that do not exist', async () => {
    const user = await app.signIn('user');
    for (const type of ['plant', 'substrate', 'component']) {
      expect((await upload(user.auth, type, 987654)).status, type).toBe(404);
    }
  });

  it('lets only admins add images to the component catalogue', async () => {
    const admin = await app.signIn('admin');
    const created = await app.client.request({
      method: 'post',
      url: `${API}/components`,
      headers: admin.auth,
      json: { name: 'Perlite', fineness: 1 },
    });
    const componentId = created.body.data.id;
    const user = await app.signIn('user');
    expect((await upload(user.auth, 'component', componentId)).status).toBe(403);
    expect((await upload(admin.auth, 'component', componentId)).status).toBe(201);
    const list = await app.client.request({
      method: 'get',
      url: `${API}/images/component?entityId=${componentId}`,
      headers: user.auth,
    });
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('does not let an admin change the images of a regular user plant', async () => {
    const { plant } = await setup();
    const admin = await app.signIn('admin');
    expect((await upload(admin.auth, 'plant', plant.plant_id)).status).toBe(404);
  });

  it('names stored files with random hex so URLs cannot be guessed', async () => {
    const { owner, plant } = await setup();
    const a = await upload(owner.auth, 'plant', plant.plant_id);
    const b = await upload(owner.auth, 'plant', plant.plant_id);
    const suffix = (r: { body: { data: { path: string } } }) =>
      /-([0-9a-f]{12})\.webp$/.exec(pathOf(r.body.data.path))![1];
    expect(suffix(a)).not.toBe(suffix(b));
  });
});

describe('stored paths', () => {
  it('keeps only the path in the database and answers absolute urls everywhere', async () => {
    const { owner, plant } = await setup();
    const up = await upload(owner.auth, 'plant', plant.plant_id);

    const [row] = app.db.query<{ image_url: string }>(
      'SELECT image_url FROM images WHERE entity_id = ? AND entity_type = ?',
      [plant.plant_id, 'plant'],
    );
    expect(row.image_url).toBe(pathOf(up.body.data.path));

    const list = await app.client.request({
      method: 'get',
      url: `${API}/images/plant?entityId=${plant.plant_id}`,
      headers: owner.auth,
    });
    expect(list.body.data[0].url).toMatch(/^http:\/\/[^/]+\/uploads\/plant\//);
    expect(pathOf(list.body.data[0].url)).toBe(row.image_url);

    const fetched = await app.client.request({
      method: 'get',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
    });
    expect(pathOf(fetched.body.data.cover.url)).toBe(row.image_url);
  });
});

describe('cleanup on entity deletion', () => {
  it('removes the images of a deleted substrate', async () => {
    const { owner, substrate } = await setup();
    await upload(owner.auth, 'substrate', substrate.substrate_id);
    await app.client.request({
      method: 'delete',
      url: `${API}/substrates/${substrate.substrate_id}`,
      headers: owner.auth,
    });
    const rows = app.db.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM images WHERE entity_type = 'substrate' AND entity_id = ?",
      [substrate.substrate_id],
    );
    expect(rows[0].n).toBe(0);
  });

  it('removes the images of a deleted component', async () => {
    const admin = await app.signIn('admin');
    const created = await app.client.request({
      method: 'post',
      url: `${API}/components`,
      headers: admin.auth,
      json: { name: 'Cleanup grit', fineness: 1 },
    });
    const id = created.body.data.id;
    await upload(admin.auth, 'component', id);
    await app.client.request({
      method: 'delete',
      url: `${API}/components/${id}`,
      headers: admin.auth,
    });
    const rows = app.db.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM images WHERE entity_type = 'component' AND entity_id = ?",
      [id],
    );
    expect(rows[0].n).toBe(0);
  });
});

describe('remaining gaps', () => {
  it('answers non-image bytes labelled as PNG with 400', async () => {
    const { owner, plant } = await setup();
    const res = await upload(owner.auth, 'plant', plant.plant_id, {
      data: 'definitely not an image',
    });
    expect(res.status).toBe(400);
  });

  it('serves uploaded files without authentication (SEC-03)', async () => {
    const { owner, plant } = await setup();
    const up = await upload(owner.auth, 'plant', plant.plant_id);
    const anon = await app.client.request({ method: 'get', url: pathOf(up.body.data.path) });
    expect(anon.status).toBe(200);
  });
});

describe('webp uploads and the date field', () => {
  const DAY = 24 * 60 * 60 * 1000;

  const post = (
    auth: Record<string, string>,
    plantId: number,
    parts: { contentType?: string; data?: Buffer | string; date?: string } = {},
  ) =>
    app.client.request({
      method: 'post',
      url: `${API}/images/plant/${plantId}`,
      headers: auth,
      multipart: [
        {
          field: 'image',
          filename: 'photo.webp',
          contentType: parts.contentType ?? 'image/webp',
          data: parts.data ?? png,
        },
        ...(parts.date === undefined ? [] : [{ field: 'date', data: parts.date }]),
      ],
    });

  const storedDate = async (auth: Record<string, string>, plantId: number) => {
    const res = await app.client.request({
      method: 'get',
      url: `${API}/images/plant?entityId=${plantId}`,
      headers: auth,
    });
    return res.body.data.at(-1).date as number;
  };

  it('accepts a webp upload and writes the variants', async () => {
    const { owner, plant } = await setup();
    const webp = await sharp(png).webp().toBuffer();
    const res = await post(owner.auth, plant.plant_id, { data: webp });
    expect(res.status).toBe(201);
    variantFiles('plant', res.body.data.path).forEach((file) =>
      expect(fs.existsSync(file), file).toBe(true),
    );
  });

  it('rejects a text file declared as image/webp with 400', async () => {
    const { owner, plant } = await setup();
    const res = await post(owner.auth, plant.plant_id, { data: 'not an image at all' });
    expect(res.status).toBe(400);
  });

  it('still rejects gif', async () => {
    const { owner, plant } = await setup();
    const res = await post(owner.auth, plant.plant_id, { contentType: 'image/gif' });
    expect(res.status).toBe(400);
  });

  it('stores the date field (epoch ms) as seconds', async () => {
    const { owner, plant } = await setup();
    const res = await post(owner.auth, plant.plant_id, { date: '1717236000999' });
    expect(res.status).toBe(201);
    expect(await storedDate(owner.auth, plant.plant_id)).toBe(1717236000);
  });

  it('prefers the date field over the EXIF date of the file', async () => {
    const { owner, plant } = await setup();
    const jpeg = await sharp(png)
      .jpeg()
      .withExif({ IFD2: { DateTimeOriginal: '2020:01:02 03:04:05' } })
      .toBuffer();
    const withExifOnly = await post(owner.auth, plant.plant_id, {
      contentType: 'image/jpeg',
      data: jpeg,
    });
    expect(withExifOnly.status).toBe(201);
    const exifDate = await storedDate(owner.auth, plant.plant_id);
    expect(new Date(exifDate * 1000).getFullYear()).toBe(2020);

    const explicit = await post(owner.auth, plant.plant_id, {
      contentType: 'image/jpeg',
      data: jpeg,
      date: '1717236000000',
    });
    expect(explicit.status).toBe(201);
    expect(await storedDate(owner.auth, plant.plant_id)).toBe(1717236000);
  });

  it('keeps the current date fallback when no date is sent', async () => {
    const { owner, plant } = await setup();
    const before = Math.floor(Date.now() / 1000) - 5;
    await post(owner.auth, plant.plant_id);
    expect(await storedDate(owner.auth, plant.plant_id)).toBeGreaterThanOrEqual(before);
  });

  it.each([
    ['non-integer', () => '1.5'],
    ['negative', () => '-1000'],
    ['before 2000', () => String(Date.UTC(1999, 11, 31))],
    ['two days ahead', () => String(Date.now() + 2 * DAY)],
  ])('rejects a %s date on POST and PATCH with fields.date', async (_name, make) => {
    const { owner, plant } = await setup();
    const res = await post(owner.auth, plant.plant_id, { date: make() });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('date');

    await post(owner.auth, plant.plant_id);
    const id = (
      await app.client.request({
        method: 'get',
        url: `${API}/images/plant?entityId=${plant.plant_id}`,
        headers: owner.auth,
      })
    ).body.data[0].id;
    const patch = await app.client.request({
      method: 'patch',
      url: `${API}/images/${id}`,
      headers: owner.auth,
      multipart: [{ field: 'date', data: make() }],
    });
    expect(patch.status).toBe(400);
    expect(patch.body.error.fields).toHaveProperty('date');
  });

  it('PATCH accepts a webp replacement together with a date', async () => {
    const { owner, plant } = await setup();
    await post(owner.auth, plant.plant_id);
    const id = (
      await app.client.request({
        method: 'get',
        url: `${API}/images/plant?entityId=${plant.plant_id}`,
        headers: owner.auth,
      })
    ).body.data[0].id;
    const webp = await sharp(png).webp().toBuffer();
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/images/${id}`,
      headers: owner.auth,
      multipart: [
        { field: 'image', filename: 'n.webp', contentType: 'image/webp', data: webp },
        { field: 'date', data: '1717236000000' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.date).toBe(1717236000);
  });
});
