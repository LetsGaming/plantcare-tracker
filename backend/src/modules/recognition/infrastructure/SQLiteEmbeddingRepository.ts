import { getKysely } from '../../../core/database/db';
import type { EmbeddingRepository, MissingImage, PlantVector } from '../domain/Recognition';

const toBlob = (v: Float32Array): Buffer => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
const fromBlob = (b: Buffer): Float32Array =>
  new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

export class SQLiteEmbeddingRepository implements EmbeddingRepository {
  async save(imageId: number, model: string, vector: Float32Array): Promise<void> {
    const blob = toBlob(vector);
    await getKysely()
      .insertInto('image_embeddings')
      .values({ image_id: imageId, model, vector: blob })
      .onConflict((oc) => oc.column('image_id').doUpdateSet({ model, vector: blob }))
      .execute();
  }

  async vectorsForUser(userId: number, model: string): Promise<PlantVector[]> {
    const rows = await getKysely()
      .selectFrom('image_embeddings as e')
      .innerJoin('images as i', 'i.id', 'e.image_id')
      .innerJoin('plants as p', 'p.id', 'i.entity_id')
      .where('i.entity_type', '=', 'plant')
      .where('p.user_id', '=', userId)
      .where('e.model', '=', model)
      .select(['p.id as plantId', 'e.image_id as imageId', 'e.vector'])
      .execute();
    return rows.map((r) => ({
      plantId: r.plantId,
      imageId: r.imageId,
      vector: fromBlob(r.vector),
    }));
  }

  async plantImagesMissing(model: string): Promise<MissingImage[]> {
    return getKysely()
      .selectFrom('images as i')
      .leftJoin('image_embeddings as e', (join) =>
        join.onRef('e.image_id', '=', 'i.id').on('e.model', '=', model),
      )
      .where('i.entity_type', '=', 'plant')
      .where('e.image_id', 'is', null)
      .select(['i.id as imageId', 'i.image_url as imageUrl'])
      .execute();
  }

  async purgeOrphans(): Promise<void> {
    await getKysely()
      .deleteFrom('image_embeddings')
      .where('image_id', 'not in', (qb) => qb.selectFrom('images').select('id'))
      .execute();
  }
}
