import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { API, createContractApp, type ContractApp } from './harness';
import { createPlant, createSubstrate } from './support';

const IMMUTABLE = 'public, max-age=31536000, immutable';

let app: ContractApp;
let uploadsDir: string;
let big: Buffer;

beforeAll(async () => {
  app = await createContractApp();
  uploadsDir = (await import('../../src/core/config')).getUploadsDirectory();
  big = await sharp({ create: { width: 1400, height: 900, channels: 3, background: '#2a8a4a' } })
    .png()
    .toBuffer();
});
afterAll(() => app.close());

const pathOf = (url: string) => new URL(url).pathname;

const setup = async () => {
  const owner = await app.signIn('user');
  const substrate = await createSubstrate(app, owner.auth);
  const plant = await createPlant(app, owner.auth, substrate.substrate_id);
  return { owner, plant };
};

const upload = (auth: Record<string, string>, plantId: number, data: Buffer) =>
  app.client.request({
    method: 'post',
    url: `${API}/images/plant/${plantId}`,
    headers: auth,
    multipart: [{ field: 'image', filename: 'photo.png', contentType: 'image/png', data }],
  });

const list = async (auth: Record<string, string>, plantId: number) =>
  (
    await app.client.request({
      method: 'get',
      url: `${API}/images/plant?entityId=${plantId}`,
      headers: auth,
    })
  ).body.data as Array<{
    id: number;
    url: string;
    srcset: string | null;
    width: number | null;
    height: number | null;
    placeholder: string | null;
  }>;

const diskPaths = (url: string) => {
  const main = path.join(uploadsDir, 'plant', path.basename(pathOf(url)));
  return [main, main.replace(/\.webp$/, '-160.webp'), main.replace(/\.webp$/, '-480.webp')];
};

describe('uploaded plant photo', () => {
  it('lists a srcset of the three variants with dimensions and a placeholder', async () => {
    const { owner, plant } = await setup();
    await upload(owner.auth, plant.plant_id, big);
    const [image] = await list(owner.auth, plant.plant_id);

    const base = image.url.replace(/\.webp$/, '');
    expect(image.srcset).toBe(`${base}-160.webp 160w, ${base}-480.webp 480w, ${base}.webp 1024w`);
    expect(image.width).toBe(1024);
    expect(image.height).toBe(Math.round((900 * 1024) / 1400));
    expect(image.placeholder).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('serves every variant from /uploads as an immutable webp of the advertised width', async () => {
    const { owner, plant } = await setup();
    await upload(owner.auth, plant.plant_id, big);
    const [image] = await list(owner.auth, plant.plant_id);
    const base = pathOf(image.url).replace(/\.webp$/, '');

    for (const [suffix, width] of [
      ['-160', 160],
      ['-480', 480],
      ['', 1024],
    ] as const) {
      const res = await app.client.request({ method: 'get', url: `${base}${suffix}.webp` });
      expect(res.status, suffix).toBe(200);
      expect(res.headers['cache-control'], suffix).toBe(IMMUTABLE);
      expect(String(res.headers['content-type']), suffix).toBe('image/webp');
      const meta = await sharp(res.bytes).metadata();
      expect(meta.format, suffix).toBe('webp');
      expect(meta.width, suffix).toBe(width);
    }
  });

  it('puts the same variant names on the plant cover as on the image list', async () => {
    const { owner, plant } = await setup();
    await upload(owner.auth, plant.plant_id, big);
    const [image] = await list(owner.auth, plant.plant_id);
    const fetched = await app.client.request({
      method: 'get',
      url: `${API}/plants/${plant.plant_id}`,
      headers: owner.auth,
    });
    expect(fetched.body.data.cover).toMatchObject({
      url: image.url,
      srcset: image.srcset,
      width: image.width,
      height: image.height,
      placeholder: image.placeholder,
    });
  });
});

describe('legacy image row', () => {
  const insertLegacy = (plantId: number, fileName: string, data: Buffer) => {
    fs.mkdirSync(path.join(uploadsDir, 'plant'), { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, 'plant', fileName), data);
    app.db.execute(
      "INSERT INTO images (image_url, entity_type, entity_id, variants) VALUES (?, 'plant', ?, 0)",
      [`/uploads/plant/${fileName}`, plantId],
    );
  };

  it('has no srcset, no dimensions and serves its single file', async () => {
    const { owner, plant } = await setup();
    const legacy = await sharp({
      create: { width: 40, height: 30, channels: 3, background: '#aa3322' },
    })
      .webp()
      .toBuffer();
    insertLegacy(plant.plant_id, 'legacy-old.webp', legacy);

    const [image] = await list(owner.auth, plant.plant_id);
    expect(image.srcset).toBeNull();
    expect(image.width).toBeNull();
    expect(image.height).toBeNull();
    expect(image.placeholder).toBeNull();

    const res = await app.client.request({ method: 'get', url: pathOf(image.url) });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe(IMMUTABLE);
    expect((await sharp(res.bytes).metadata()).width).toBe(40);

    const variant = await app.client.request({
      method: 'get',
      url: pathOf(image.url).replace(/\.webp$/, '-160.webp'),
    });
    expect(variant.status).toBe(404);
  });

  it('has no srcset when the stored file is not a webp, even with variants = 1', async () => {
    const { owner, plant } = await setup();
    insertLegacy(plant.plant_id, 'legacy-old.jpg', await sharp(big).jpeg().toBuffer());
    app.db.execute('UPDATE images SET variants = 1 WHERE entity_id = ?', [plant.plant_id]);
    const [image] = await list(owner.auth, plant.plant_id);
    expect(image.srcset).toBeNull();
  });

  it('becomes a full variant set when a new file replaces it', async () => {
    const { owner, plant } = await setup();
    insertLegacy(plant.plant_id, 'legacy-old.webp', await sharp(big).webp().toBuffer());
    const [before] = await list(owner.auth, plant.plant_id);

    const res = await app.client.request({
      method: 'patch',
      url: `${API}/images/${before.id}`,
      headers: owner.auth,
      multipart: [{ field: 'image', filename: 'new.png', contentType: 'image/png', data: big }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.srcset).toMatch(/-160\.webp 160w, .+-480\.webp 480w, .+\.webp 1024w$/);
    expect(fs.existsSync(path.join(uploadsDir, 'plant', 'legacy-old.webp'))).toBe(false);
    diskPaths(res.body.data.url).forEach((file) => expect(fs.existsSync(file), file).toBe(true));
  });
});

describe('removed resize route', () => {
  it('answers 404 for GET /images/plant/:id with and without ?size=', async () => {
    const { owner, plant } = await setup();
    await upload(owner.auth, plant.plant_id, big);
    for (const query of ['', '?size=160', '?size=2000']) {
      const res = await app.client.request({
        method: 'get',
        url: `${API}/images/plant/${plant.plant_id}${query}`,
        headers: owner.auth,
      });
      expect(res.status, query).toBe(404);
    }
  });
});

describe('replacing and deleting a variant set', () => {
  it('gives every replacement fresh names for all three files and removes the old set', async () => {
    const { owner, plant } = await setup();
    await upload(owner.auth, plant.plant_id, big);
    const [first] = await list(owner.auth, plant.plant_id);
    const seen = new Set(diskPaths(first.url));
    let current = first.url;

    for (let round = 0; round < 2; round += 1) {
      const res = await app.client.request({
        method: 'patch',
        url: `${API}/images/${first.id}`,
        headers: owner.auth,
        multipart: [{ field: 'image', filename: 'same.png', contentType: 'image/png', data: big }],
      });
      expect(res.status).toBe(200);
      const previous = diskPaths(current);
      const next = diskPaths(res.body.data.url);
      next.forEach((file) => {
        expect(seen.has(file), file).toBe(false);
        expect(fs.existsSync(file), file).toBe(true);
        seen.add(file);
      });
      previous.forEach((file) => expect(fs.existsSync(file), file).toBe(false));
      current = res.body.data.url;
    }
  });

  it('removes all three files when the image is deleted', async () => {
    const { owner, plant } = await setup();
    await upload(owner.auth, plant.plant_id, big);
    const [image] = await list(owner.auth, plant.plant_id);
    const files = diskPaths(image.url);
    files.forEach((file) => expect(fs.existsSync(file), file).toBe(true));

    const res = await app.client.request({
      method: 'delete',
      url: `${API}/images/${image.id}`,
      headers: owner.auth,
    });
    expect(res.status).toBe(204);
    files.forEach((file) => expect(fs.existsSync(file), file).toBe(false));
    expect(await list(owner.auth, plant.plant_id)).toEqual([]);
  });
});
