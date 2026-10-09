import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContractApp, type ContractApp } from '../contract/harness';
import { createPlant, createSubstrate } from '../contract/support';
import { SQLiteEmbeddingRepository } from '../../src/modules/recognition/infrastructure/SQLiteEmbeddingRepository';

let app: ContractApp;
beforeAll(async () => {
  app = await createContractApp();
});
afterAll(() => app.close());

const plantWithImage = async () => {
  const owner = await app.signIn('user');
  const substrate = await createSubstrate(app, owner.auth);
  const plant = await createPlant(app, owner.auth, substrate.substrate_id);
  const { insertId } = app.db.execute(
    "INSERT INTO images (image_url, entity_type, entity_id, upload_date) VALUES (?, 'plant', ?, 0)",
    [`/uploads/plant/${plant.plant_id}.webp`, plant.plant_id],
  );
  return { owner, plant, imageId: insertId };
};

describe('SQLiteEmbeddingRepository', () => {
  const repo = new SQLiteEmbeddingRepository();

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

  it('purges vectors whose image row is gone without a cascade', async () => {
    const { imageId } = await plantWithImage();
    await repo.save(imageId, 'm1', Float32Array.from([1]));
    app.db.execute('PRAGMA foreign_keys = OFF');
    try {
      app.db.execute('DELETE FROM images WHERE id = ?', [imageId]);
    } finally {
      app.db.execute('PRAGMA foreign_keys = ON');
    }
    const count = () =>
      app.db.query<{ n: number }>('SELECT COUNT(*) AS n FROM image_embeddings WHERE image_id = ?', [
        imageId,
      ])[0].n;
    expect(count()).toBe(1);
    await repo.purgeOrphans();
    expect(count()).toBe(0);
  });
});
