import type { PlantVector } from '../../src/modules/recognition/domain/Recognition';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createContractApp, type ContractApp } from '../contract/harness';
import { createPlant, createSubstrate } from '../contract/support';
import { getKysely } from '../../src/core/database/db';
import {
  SQLiteEmbeddingRepository,
  vectorsQuery,
} from '../../src/modules/recognition/infrastructure/SQLiteEmbeddingRepository';
import {
  MAX_CACHE_BYTES,
  cacheVectors,
  cachedBytes,
  cachedVectors,
  clearVectorCache,
  currentEpoch,
  invalidateVectors,
} from '../../src/modules/recognition/infrastructure/vectorCache';

let app: ContractApp;
beforeAll(async () => {
  app = await createContractApp();
});
afterAll(() => app.close());

const plantWithImage = async (existingOwner?: Awaited<ReturnType<typeof app.signIn>>) => {
  const owner = existingOwner ?? (await app.signIn('user'));
  const substrate = await createSubstrate(app, owner.auth);
  const plant = await createPlant(app, owner.auth, substrate.substrate_id);
  const { insertId } = app.db.execute(
    "INSERT INTO images (image_url, entity_type, entity_id, upload_date) VALUES (?, 'plant', ?, 0)",
    [`/uploads/plant/${plant.plant_id}.webp`, plant.plant_id],
  );
  return { owner, plant, imageId: insertId };
};

class GatedRepository extends SQLiteEmbeddingRepository {
  gate: Promise<void> = Promise.resolve();
  loaded: () => void = () => undefined;

  protected override async loadVectors(userId: number, model: string): Promise<PlantVector[]> {
    const vectors = await super.loadVectors(userId, model);
    this.loaded();
    await this.gate;
    return vectors;
  }
}

describe('SQLiteEmbeddingRepository', () => {
  const repo = new SQLiteEmbeddingRepository();
  beforeEach(() => clearVectorCache());

  it('round-trips vectors and scopes them to the owner and model', async () => {
    const mine = await plantWithImage();
    const theirs = await plantWithImage();
    await repo.save(mine.imageId, 'm1', Float32Array.from([0.6, 0.8]));
    await repo.save(theirs.imageId, 'm1', Float32Array.from([1, 0]));
    const vectors = await repo.vectorsForUser(mine.owner.user.id, 'm1');
    expect(vectors).toHaveLength(1);
    expect(vectors[0].plantId).toBe(mine.plant.plant_id);
    expect(Array.from(vectors[0].vector)).toEqual([expect.closeTo(0.6), expect.closeTo(0.8)]);
    expect(await repo.vectorsForUser(mine.owner.user.id, 'm2')).toEqual([]);
  });

  it('lists images missing a vector for the model and upserts on model change', async () => {
    const { imageId } = await plantWithImage();
    expect((await repo.plantImagesMissing('m1')).map((m) => m.imageId)).toContain(imageId);
    await repo.save(imageId, 'm1', Float32Array.from([1]));
    expect((await repo.plantImagesMissing('m1')).map((m) => m.imageId)).not.toContain(imageId);
    await repo.save(imageId, 'm2', Float32Array.from([1]));
    expect((await repo.plantImagesMissing('m1')).map((m) => m.imageId)).toContain(imageId);
  });

  it('cascades vectors when their image is deleted', async () => {
    const { imageId } = await plantWithImage();
    await repo.save(imageId, 'm1', Float32Array.from([1]));
    app.db.execute('DELETE FROM images WHERE id = ?', [imageId]);
    const rows = app.db.query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM image_embeddings WHERE image_id = ?',
      [imageId],
    );
    expect(rows[0].n).toBe(0);
  });

  it('purges at most the given number of vectors whose image row is gone', async () => {
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const { imageId } = await plantWithImage();
      await repo.save(imageId, 'm1', Float32Array.from([1]));
      ids.push(imageId);
    }
    app.db.execute('PRAGMA foreign_keys = OFF');
    try {
      for (const id of ids) app.db.execute('DELETE FROM images WHERE id = ?', [id]);
    } finally {
      app.db.execute('PRAGMA foreign_keys = ON');
    }
    const count = () =>
      app.db.query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM image_embeddings WHERE image_id IN (${ids.join(',')})`,
      )[0].n;
    expect(count()).toBe(3);
    expect(await repo.purgeOrphans(2)).toBe(2);
    expect(count()).toBe(1);
    expect(await repo.purgeOrphans(2)).toBe(1);
    expect(count()).toBe(0);
  });

  it('pages the missing set by id and answers EXISTS without a scan result', async () => {
    const a = await plantWithImage();
    const b = await plantWithImage();
    const first = await repo.plantImagesMissing('page-model', 1, 0);
    expect(first).toHaveLength(1);
    const second = await repo.plantImagesMissing('page-model', 1, first[0].imageId);
    expect(second[0].imageId).toBeGreaterThan(first[0].imageId);
    expect(await repo.anyMissing('page-model')).toBe(true);
    expect(await repo.countMissing('page-model')).toBeGreaterThanOrEqual(2);
    const all = await repo.plantImagesMissing('page-model', 1000, 0);
    for (const { imageId } of all) await repo.save(imageId, 'page-model', Float32Array.from([1]));
    expect(await repo.anyMissing('page-model')).toBe(false);
    expect(await repo.countMissing('page-model')).toBe(0);
    expect([a.imageId, b.imageId].every((id) => all.some((m) => m.imageId === id))).toBe(true);
  });

  describe('vector loading', () => {
    it('starts the plan from the caller plants and uses the user and image indexes', async () => {
      const compiled = vectorsQuery(1, 'm1').compile(getKysely());
      const plan = app.db
        .query<{ detail: string }>(
          `EXPLAIN QUERY PLAN ${compiled.sql}`,
          compiled.parameters as never,
        )
        .map((r) => r.detail);
      expect(plan[0]).toMatch(/plants/);
      expect(plan[0]).toMatch(/idx_plants_user/);
      expect(plan.join(' | ')).toMatch(/idx_images_lookup/);
      expect(plan.some((d) => /SCAN (i|images)/.test(d))).toBe(false);
      expect(plan.some((d) => /SCAN (e|image_embeddings)/.test(d))).toBe(false);
    });

    it('returns only the vectors of the caller', async () => {
      const mine = await plantWithImage();
      const theirs = await plantWithImage(await app.signIn('admin'));
      await repo.save(mine.imageId, 'm1', Float32Array.from([1]));
      await repo.save(theirs.imageId, 'm1', Float32Array.from([1]));
      const vectors = await repo.vectorsForUser(mine.owner.user.id, 'm1');
      expect(vectors.map((v) => v.imageId)).toEqual([mine.imageId]);
    });

    it('serves repeated loads from the cache without reading the database', async () => {
      const { owner, imageId } = await plantWithImage();
      await repo.save(imageId, 'm1', Float32Array.from([1]));
      expect(await repo.vectorsForUser(owner.user.id, 'm1')).toHaveLength(1);
      app.db.execute('DELETE FROM image_embeddings WHERE image_id = ?', [imageId]);
      expect(await repo.vectorsForUser(owner.user.id, 'm1')).toHaveLength(1);
    });

    it('invalidates the cache when a vector is stored for one of the user plants', async () => {
      const first = await plantWithImage();
      await repo.save(first.imageId, 'm1', Float32Array.from([1]));
      expect(await repo.vectorsForUser(first.owner.user.id, 'm1')).toHaveLength(1);
      const second = await plantWithImage(first.owner);
      await repo.save(second.imageId, 'm1', Float32Array.from([1]));
      expect(await repo.vectorsForUser(first.owner.user.id, 'm1')).toHaveLength(2);
    });

    it('invalidates the cache explicitly after an image is deleted', async () => {
      const { owner, imageId } = await plantWithImage();
      await repo.save(imageId, 'm1', Float32Array.from([1]));
      expect(await repo.vectorsForUser(owner.user.id, 'm1')).toHaveLength(1);
      app.db.execute('DELETE FROM images WHERE id = ?', [imageId]);
      invalidateVectors(owner.user.id);
      expect(await repo.vectorsForUser(owner.user.id, 'm1')).toEqual([]);
    });

    it('keeps at most 20 users cached, dropping the least recently used', () => {
      const store = (id: number) =>
        cacheVectors(
          id,
          'm1',
          [{ plantId: id, imageId: id, vector: Float32Array.of(1) }],
          currentEpoch(),
        );
      for (let id = 1; id <= 20; id++) store(id);
      expect(cachedVectors(1, 'm1')).not.toBeNull();
      store(21);
      expect(cachedVectors(2, 'm1')).toBeNull();
      expect(cachedVectors(1, 'm1')).not.toBeNull();
      expect(cachedVectors(21, 'm1')).not.toBeNull();
    });

    it('never caches a set loaded before a concurrent save, even with an empty cache', async () => {
      const gated = new GatedRepository();
      const first = await plantWithImage();
      await gated.save(first.imageId, 'm1', Float32Array.from([1]));
      clearVectorCache();
      let release: () => void = () => undefined;
      gated.gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const read = new Promise<void>((resolve) => {
        gated.loaded = resolve;
      });
      const stale = gated.vectorsForUser(first.owner.user.id, 'm1');
      await read;
      const second = await plantWithImage(first.owner);
      await gated.save(second.imageId, 'm1', Float32Array.from([1]));
      release();
      expect(await stale).toHaveLength(1);
      expect(cachedVectors(first.owner.user.id, 'm1')).toBeNull();
      gated.gate = Promise.resolve();
      expect(await gated.vectorsForUser(first.owner.user.id, 'm1')).toHaveLength(2);
    });

    it('expires an entry after the TTL', () => {
      const vectors = [{ plantId: 1, imageId: 1, vector: Float32Array.of(1) }];
      cacheVectors(7, 'm1', vectors, currentEpoch(), 1_000);
      expect(cachedVectors(7, 'm1', 1_000 + 5 * 60_000)).toBe(vectors);
      expect(cachedVectors(7, 'm1', 1_000 + 5 * 60_000 + 1)).toBeNull();
    });

    it('sweeps expired entries of other users when storing', () => {
      const one = [{ plantId: 1, imageId: 1, vector: Float32Array.of(1) }];
      cacheVectors(8, 'm1', one, currentEpoch(), 1_000);
      cacheVectors(9, 'm1', one, currentEpoch(), 1_000 + 5 * 60_000 + 1);
      expect(cachedBytes()).toBe(4);
      expect(cachedVectors(8, 'm1', 1_000 + 5 * 60_000 + 1)).toBeNull();
    });

    it('evicts the entry when the model changes', () => {
      cacheVectors(
        10,
        'm1',
        [{ plantId: 1, imageId: 1, vector: Float32Array.of(1) }],
        currentEpoch(),
      );
      expect(cachedVectors(10, 'm2')).toBeNull();
      expect(cachedVectors(10, 'm1')).toBeNull();
      expect(cachedBytes()).toBe(0);
    });

    it('bounds the cache by total bytes, evicting the least recently used', () => {
      const dim = 384;
      const perVector = dim * 4;
      const count = Math.floor((MAX_CACHE_BYTES * 0.4) / perVector);
      const set = (): PlantVector[] =>
        Array.from({ length: count }, (_, i) => ({
          plantId: i,
          imageId: i,
          vector: new Float32Array(dim),
        }));
      cacheVectors(1, 'm1', set(), currentEpoch());
      cacheVectors(2, 'm1', set(), currentEpoch());
      expect(cachedVectors(1, 'm1')).not.toBeNull();
      cacheVectors(3, 'm1', set(), currentEpoch());
      expect(cachedBytes()).toBeLessThanOrEqual(MAX_CACHE_BYTES);
      expect(cachedVectors(2, 'm1')).toBeNull();
      expect(cachedVectors(1, 'm1')).not.toBeNull();
      expect(cachedVectors(3, 'm1')).not.toBeNull();
    });

    it('does not cache a single user set larger than the budget', () => {
      const count = Math.floor(MAX_CACHE_BYTES / 4) + 1;
      cacheVectors(
        4,
        'm1',
        [{ plantId: 1, imageId: 1, vector: new Float32Array(count) }],
        currentEpoch(),
      );
      expect(cachedVectors(4, 'm1')).toBeNull();
      expect(cachedBytes()).toBe(0);
    });

    it('never caches a load that raced with an invalidation', () => {
      const loadedAt = currentEpoch();
      invalidateVectors(5);
      cacheVectors(5, 'm1', [], loadedAt);
      expect(cachedVectors(5, 'm1')).toBeNull();
    });
  });
});
