/**
 * modules/images/infrastructure/SQLiteImageRepository.ts
 *
 * SQLite implementation of the ImageRepository port.
 * Single table `images`: id, image_url, entity_type, entity_id, upload_date.
 */

import { sql } from 'kysely';
import { getKysely } from '../../../core/database/db';
import type {
  ImageRepository,
  ImageRecord,
  StoredImage,
  EntityType,
  UpdateImageDTO,
} from '../domain/Image';

const imageRecords = () =>
  getKysely()
    .selectFrom('images')
    .select(['id', 'image_url as url', 'upload_date as date', 'entity_type as entityType']);

export class SQLiteImageRepository implements ImageRepository {
  async findByEntity(entityType: EntityType, entityId: number): Promise<ImageRecord[]> {
    return imageRecords()
      .where('entity_type', '=', entityType)
      .where('entity_id', '=', entityId)
      .orderBy('upload_date', 'asc')
      .execute();
  }

  async findById(imageId: number): Promise<StoredImage | null> {
    const row = await imageRecords()
      .select('entity_id as entityId')
      .where('id', '=', imageId)
      .executeTakeFirst();
    return row ?? null;
  }

  async create(
    entityType: EntityType,
    entityId: number,
    imageUrl: string,
    uploadDate?: number,
  ): Promise<number> {
    const result = await getKysely()
      .insertInto('images')
      .values({
        image_url: imageUrl,
        entity_type: entityType,
        entity_id: entityId,
        upload_date: sql<number>`COALESCE(${uploadDate ?? null}, strftime('%s','now'))`,
      })
      .executeTakeFirstOrThrow();
    return Number(result.insertId);
  }

  async update(imageId: number, fields: UpdateImageDTO): Promise<void> {
    const changes: { image_url?: string; upload_date?: number } = {};
    if (fields.imageUrl !== undefined) changes.image_url = fields.imageUrl;
    if (fields.uploadDate !== undefined) changes.upload_date = fields.uploadDate;
    if (!Object.keys(changes).length) return;
    await getKysely().updateTable('images').set(changes).where('id', '=', imageId).execute();
  }

  async delete(imageId: number): Promise<void> {
    await getKysely().deleteFrom('images').where('id', '=', imageId).execute();
  }

  /**
   * Deletes all images of an entity inside one transaction and returns
   * the deleted records so the caller can clean up the files.
   */
  async deleteByEntity(entityType: EntityType, entityId: number): Promise<ImageRecord[]> {
    return getKysely()
      .transaction()
      .execute(async (trx) => {
        const images = await trx
          .selectFrom('images')
          .select(['id', 'image_url as url', 'upload_date as date', 'entity_type as entityType'])
          .where('entity_type', '=', entityType)
          .where('entity_id', '=', entityId)
          .orderBy('upload_date', 'asc')
          .execute();
        if (images.length) {
          await trx
            .deleteFrom('images')
            .where(
              'id',
              'in',
              images.map((i) => i.id),
            )
            .execute();
        }
        return images;
      });
  }
}
