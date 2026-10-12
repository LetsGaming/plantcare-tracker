import { sql, type RawBuilder } from 'kysely';
import { getKysely } from '../../../core/database/db';
import type { EmbeddingRepository, MissingImage, PlantVector } from '../domain/Recognition';
import {
  cacheVectors,
  cachedVectors,
  currentEpoch,
  hasCachedVectors,
  invalidateVectors,
} from './vectorCache';

export { invalidateVectors } from './vectorCache';

const DEFAULT_BATCH = 50;
const DEFAULT_PURGE_LIMIT = 200;

const toBlob = (v: Float32Array): Buffer => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
const fromBlob = (b: Buffer): Float32Array =>
  new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

interface VectorRow {
  plantId: number;
  imageId: number;
  vector: Buffer;
}

/** CROSS JOIN pins the join order so the plan starts from the caller's plants. */
export const vectorsQuery = (userId: number, model: string): RawBuilder<VectorRow> => sql`
  SELECT p.id AS plantId, e.image_id AS imageId, e.vector AS vector
  FROM plants p
  CROSS JOIN images i ON i.entity_type = 'plant' AND i.entity_id = p.id
  CROSS JOIN image_embeddings e ON e.image_id = i.id
  WHERE p.user_id = ${userId} AND e.model = ${model}`;

export class SQLiteEmbeddingRepository implements EmbeddingRepository {
  async save(imageId: number, model: string, vector: Float32Array): Promise<void> {
    const blob = toBlob(vector);
    const db = getKysely();
    await db
      .insertInto('image_embeddings')
      .values({ image_id: imageId, model, vector: blob })
      .onConflict((oc) => oc.column('image_id').doUpdateSet({ model, vector: blob }))
      .execute();
    if (!hasCachedVectors()) return;
    const owner = await db
      .selectFrom('images as i')
      .innerJoin('plants as p', 'p.id', 'i.entity_id')
      .where('i.id', '=', imageId)
      .where('i.entity_type', '=', 'plant')
      .select('p.user_id as userId')
      .executeTakeFirst();
    if (owner) invalidateVectors(owner.userId);
  }

  async vectorsForUser(userId: number, model: string): Promise<PlantVector[]> {
    const hit = cachedVectors(userId, model);
    if (hit) return hit;
    const loadedAt = currentEpoch();
    const { rows } = await vectorsQuery(userId, model).execute(getKysely());
    const vectors = rows.map((r) => ({
      plantId: r.plantId,
      imageId: r.imageId,
      vector: fromBlob(r.vector),
    }));
    cacheVectors(userId, model, vectors, loadedAt);
    return vectors;
  }

  async plantImagesMissing(
    model: string,
    limit = DEFAULT_BATCH,
    afterId = 0,
  ): Promise<MissingImage[]> {
    return getKysely()
      .selectFrom('images as i')
      .leftJoin('image_embeddings as e', (join) =>
        join.onRef('e.image_id', '=', 'i.id').on('e.model', '=', model),
      )
      .where('i.entity_type', '=', 'plant')
      .where('e.image_id', 'is', null)
      .where('i.id', '>', afterId)
      .orderBy('i.id')
      .limit(limit)
      .select(['i.id as imageId', 'i.image_url as imageUrl'])
      .execute();
  }

  async anyMissing(model: string): Promise<boolean> {
    const { rows } = await sql<{ found: number }>`
      SELECT EXISTS (
        SELECT 1 FROM images i
        LEFT JOIN image_embeddings e ON e.image_id = i.id AND e.model = ${model}
        WHERE i.entity_type = 'plant' AND e.image_id IS NULL
      ) AS found`.execute(getKysely());
    return rows[0]?.found === 1;
  }

  async countMissing(model: string): Promise<number> {
    const row = await getKysely()
      .selectFrom('images as i')
      .leftJoin('image_embeddings as e', (join) =>
        join.onRef('e.image_id', '=', 'i.id').on('e.model', '=', model),
      )
      .where('i.entity_type', '=', 'plant')
      .where('e.image_id', 'is', null)
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirst();
    return Number(row?.n ?? 0);
  }

  async purgeOrphans(limit = DEFAULT_PURGE_LIMIT): Promise<number> {
    const result = await sql`
      DELETE FROM image_embeddings WHERE image_id IN (
        SELECT e.image_id FROM image_embeddings e
        LEFT JOIN images i ON i.id = e.image_id
        WHERE i.id IS NULL
        LIMIT ${limit}
      )`.execute(getKysely());
    return Number(result.numAffectedRows ?? 0);
  }
}
