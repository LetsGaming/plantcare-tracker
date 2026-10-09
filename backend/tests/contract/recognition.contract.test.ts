import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { API, createContractApp, type ContractApp } from './harness';
import { createPlant, createSubstrate } from './support';
import { createPixelEmbedder } from '../../src/modules/recognition/infrastructure/PixelEmbedder';
import { EmbedderBusyError } from '../../src/modules/recognition/infrastructure/OnnxEmbedder';
import { MAX_UPLOAD_BYTES } from '../../src/modules/images/presentation/uploadErrors';
import type { Embedder } from '../../src/modules/recognition/domain/Recognition';

type Auth = Record<string, string>;
type Rgb = readonly [number, number, number];

const solid = (r: number, g: number, b: number) =>
  sharp({ create: { width: 64, height: 64, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();

const RED: Rgb = [220, 20, 20];
const BLUE: Rgb = [20, 20, 220];

let app: ContractApp;

const upload = (auth: Auth, plantId: number, data: Buffer) =>
  app.client.request({
    method: 'post',
    url: `${API}/images/plant/${plantId}`,
    headers: auth,
    multipart: [{ field: 'image', filename: 'p.png', contentType: 'image/png', data }],
  });

const match = (auth: Auth | undefined, data: Buffer, contentType = 'image/png') =>
  app.client.request({
    method: 'post',
    url: `${API}/recognition/match`,
    headers: auth,
    multipart: [{ field: 'image', filename: 'snap', contentType, data }],
  });

const confirm = (auth: Auth, snapshotId: string, json: unknown) =>
  app.client.request({
    method: 'post',
    url: `${API}/recognition/snapshots/${snapshotId}/confirm`,
    headers: auth,
    json,
  });

const embeddingCount = () =>
  app.db.query<{ n: number }>('SELECT COUNT(*) AS n FROM image_embeddings', [])[0].n;

const waitForEmbeddings = async (count: number) => {
  for (let i = 0; i < 100; i++) {
    if (embeddingCount() >= count) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('embeddings not written');
};

const uploadAndEmbed = async (auth: Auth, plantId: number, rgb: Rgb) => {
  const before = embeddingCount();
  const res = await upload(auth, plantId, await solid(...rgb));
  expect(res.status).toBe(201);
  await waitForEmbeddings(before + 1);
};

const wateringRecords = async (auth: Auth, plantId: number) =>
  (
    await app.client.request({
      method: 'get',
      url: `${API}/watering/plant/${plantId}`,
      headers: auth,
    })
  ).body.data ?? [];

const listImages = async (auth: Auth, plantId: number) =>
  (
    await app.client.request({
      method: 'get',
      url: `${API}/images/plant?entityId=${plantId}`,
      headers: auth,
    })
  ).body.data as Array<{ id: number }>;

const setup = async () => {
  const owner = await app.signIn('user');
  const substrate = await createSubstrate(app, owner.auth);
  const a = await createPlant(app, owner.auth, substrate.substrate_id);
  const b = await createPlant(app, owner.auth, substrate.substrate_id);
  return { owner, substrate, a, b };
};

describe('recognition with a model', () => {
  beforeAll(async () => {
    app = await createContractApp({ recognition: { embedder: createPixelEmbedder() } });
  });
  afterAll(() => app.close());

  it('reports availability', async () => {
    const { owner } = await setup();
    const res = await app.client.request({
      method: 'get',
      url: `${API}/recognition/status`,
      headers: owner.auth,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ available: true });
  });

  it('ranks the plant whose photo looks like the snapshot first', async () => {
    const { owner, a, b } = await setup();
    await uploadAndEmbed(owner.auth, a.plant_id, RED);
    await uploadAndEmbed(owner.auth, b.plant_id, BLUE);
    const res = await match(owner.auth, await solid(...RED));
    expect(res.status).toBe(200);
    expect(typeof res.body.data.snapshotId).toBe('string');
    expect(res.body.data.threshold).toBe(0.97);
    expect(res.body.data.candidates[0].plantId).toBe(a.plant_id);
    expect(res.body.data.candidates).toHaveLength(2);
    const blue = await match(owner.auth, await solid(...BLUE));
    expect(blue.body.data.candidates[0].plantId).toBe(b.plant_id);
  });

  it('never offers a plant of another user', async () => {
    const mine = await setup();
    const theirs = await setup();
    await uploadAndEmbed(theirs.owner.auth, theirs.a.plant_id, RED);
    await uploadAndEmbed(mine.owner.auth, mine.b.plant_id, BLUE);
    const res = await match(mine.owner.auth, await solid(...RED));
    const ids = res.body.data.candidates.map((c: { plantId: number }) => c.plantId);
    expect(ids).toEqual([mine.b.plant_id]);
  });

  it('answers an empty candidate list for a user without photos', async () => {
    const owner = await app.signIn('user');
    const res = await match(owner.auth, await solid(...RED));
    expect(res.status).toBe(200);
    expect(res.body.data.candidates).toEqual([]);
    expect(typeof res.body.data.snapshotId).toBe('string');
  });

  it('confirm with keepPhoto waters the plant and stores the snapshot as a photo', async () => {
    const { owner, a } = await setup();
    await uploadAndEmbed(owner.auth, a.plant_id, RED);
    const snapshot = await match(owner.auth, await solid(...RED));
    const before = embeddingCount();
    const res = await confirm(owner.auth, snapshot.body.data.snapshotId, {
      plantId: a.plant_id,
      usedFertilizer: false,
      keepPhoto: true,
    });
    expect(res.status).toBe(201);
    expect(typeof res.body.data.recordId).toBe('number');
    expect(typeof res.body.data.imageId).toBe('number');
    expect(await wateringRecords(owner.auth, a.plant_id)).toHaveLength(1);
    expect(await listImages(owner.auth, a.plant_id)).toHaveLength(2);
    expect(embeddingCount()).toBe(before + 1);
    const rows = app.db.query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM image_embeddings WHERE image_id = ?',
      [res.body.data.imageId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('confirm without keepPhoto waters only', async () => {
    const { owner, a } = await setup();
    await uploadAndEmbed(owner.auth, a.plant_id, RED);
    const snapshot = await match(owner.auth, await solid(...RED));
    const res = await confirm(owner.auth, snapshot.body.data.snapshotId, {
      plantId: a.plant_id,
      keepPhoto: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.imageId).toBeNull();
    expect(await listImages(owner.auth, a.plant_id)).toHaveLength(1);
    expect(await wateringRecords(owner.auth, a.plant_id)).toHaveLength(1);
  });

  it('accepts a snapshot only once', async () => {
    const { owner, a } = await setup();
    const snapshot = await match(owner.auth, await solid(...RED));
    const body = { plantId: a.plant_id, keepPhoto: false };
    expect((await confirm(owner.auth, snapshot.body.data.snapshotId, body)).status).toBe(201);
    expect((await confirm(owner.auth, snapshot.body.data.snapshotId, body)).status).toBe(404);
    expect(await wateringRecords(owner.auth, a.plant_id)).toHaveLength(1);
  });

  it('keeps snapshots and plants private to their owner', async () => {
    const mine = await setup();
    const other = await setup();
    const snapshot = await match(mine.owner.auth, await solid(...RED));
    const stolen = await confirm(other.owner.auth, snapshot.body.data.snapshotId, {
      plantId: other.a.plant_id,
      keepPhoto: false,
    });
    expect(stolen.status).toBe(404);
    expect(await wateringRecords(other.owner.auth, other.a.plant_id)).toHaveLength(0);

    const foreign = await confirm(mine.owner.auth, snapshot.body.data.snapshotId, {
      plantId: other.a.plant_id,
      keepPhoto: false,
    });
    expect(foreign.status).toBe(404);
    expect(await wateringRecords(other.owner.auth, other.a.plant_id)).toHaveLength(0);
  });

  it('rejects an invalid confirmation body', async () => {
    const { owner } = await setup();
    const snapshot = await match(owner.auth, await solid(...RED));
    const res = await confirm(owner.auth, snapshot.body.data.snapshotId, { plantId: 'x' });
    expect(res.status).toBe(400);
  });

  it('honours the EXIF orientation and caps the upload size', async () => {
    const { owner } = await setup();
    const rotated = await sharp({
      create: { width: 64, height: 32, channels: 3, background: { r: 10, g: 200, b: 10 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await match(owner.auth, rotated, 'image/jpeg')).status).toBe(200);

    const huge = await match(owner.auth, Buffer.alloc(MAX_UPLOAD_BYTES + 1024, 1));
    expect(huge.status).toBe(400);
    expect(huge.body.error.message).toContain('File too large');
  });

  it('rejects a missing file and an undecodable image', async () => {
    const { owner } = await setup();
    const none = await app.client.request({
      method: 'post',
      url: `${API}/recognition/match`,
      headers: owner.auth,
      multipart: [{ field: 'note', data: 'hi' }],
    });
    expect(none.status).toBe(400);
    const junk = await match(owner.auth, Buffer.from('not an image at all'));
    expect(junk.status).toBe(400);
  });

  it('blocks guests and anonymous callers', async () => {
    const guest = await app.signIn('guest');
    expect((await match(guest.auth, await solid(...RED))).status).toBe(403);
    expect((await match(undefined, await solid(...RED))).status).toBe(401);
  });

  it('embeds a replacement photo', async () => {
    const { owner, a } = await setup();
    await uploadAndEmbed(owner.auth, a.plant_id, RED);
    const imageId = (await listImages(owner.auth, a.plant_id))[0].id;
    const vectorOf = () =>
      app.db.query<{ vector: Buffer }>('SELECT vector FROM image_embeddings WHERE image_id = ?', [
        imageId,
      ])[0].vector;
    const before = vectorOf();
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/images/${imageId}`,
      headers: owner.auth,
      multipart: [
        { field: 'image', filename: 'p.png', contentType: 'image/png', data: await solid(...BLUE) },
      ],
    });
    expect(res.status).toBe(200);
    for (let i = 0; i < 100; i++) {
      if (!vectorOf().equals(before)) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('replacement embedding not written');
  });
});

describe('recognition without a model', () => {
  beforeAll(async () => {
    app = await createContractApp({ recognition: { embedder: null } });
  });
  afterAll(() => app.close());

  it('reports unavailable and refuses to match', async () => {
    const { owner } = await setup();
    const status = await app.client.request({
      method: 'get',
      url: `${API}/recognition/status`,
      headers: owner.auth,
    });
    expect(status.body.data).toEqual({ available: false });
    const res = await match(owner.auth, await solid(...RED));
    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe('Plant recognition is not available');
  });

  it('still stores plant photos without embedding them', async () => {
    const { owner, a } = await setup();
    expect((await upload(owner.auth, a.plant_id, await solid(...RED))).status).toBe(201);
    await new Promise((r) => setTimeout(r, 100));
    expect(embeddingCount()).toBe(0);
  });
});

describe('recognition with a saturated embedder', () => {
  const busy: Embedder = {
    modelId: 'busy',
    confidentScore: 0.9,
    embed: async () => {
      throw new EmbedderBusyError();
    },
  };

  beforeAll(async () => {
    app = await createContractApp({ recognition: { embedder: busy } });
  });
  afterAll(() => app.close());

  it('maps a busy embedder to 429 on match', async () => {
    const { owner } = await setup();
    const res = await match(owner.auth, await solid(...RED));
    expect(res.status).toBe(429);
    expect(res.body.error.type).toBe('TooManyRequestsError');
  });

  it('keeps plant photo uploads succeeding when embedding is refused', async () => {
    const { owner, a } = await setup();
    const res = await upload(owner.auth, a.plant_id, await solid(...RED));
    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 100));
    expect(embeddingCount()).toBe(0);
  });
});
