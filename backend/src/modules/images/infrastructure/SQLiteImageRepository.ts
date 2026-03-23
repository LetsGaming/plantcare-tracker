/**
 * modules/images/infrastructure/SQLiteImageRepository.ts
 *
 * SQLite-specific note:
 *  • All three join tables (plant_images / substrate_images / component_images)
 *    have ON DELETE CASCADE on the FK to images, so deleting from images
 *    automatically cleans up the join rows.
 *  • create() uses a transaction to insert into images then the join table
 *    atomically, avoiding orphaned rows if the second insert fails.
 */

import { query, execute, transaction } from '../../../core/database/db';

export type EntityType = 'plant' | 'substrate' | 'component';

export interface ImageRecord {
  image_id: number;
  image_url: string;
  upload_date: string;
}

const JOIN_TABLE: Record<EntityType, string> = {
  plant: 'plant_images',
  substrate: 'substrate_images',
  component: 'component_images',
};

type SqlParam = string | number | boolean | null;

interface ImageRow {
  image_id: number;
  image_url: string;
  upload_date: string;
}

export class SQLiteImageRepository {
  async findByEntity(entityType: EntityType, entityId: number): Promise<ImageRecord[]> {
    const table = JOIN_TABLE[entityType];
    return query<ImageRow>(
      `SELECT images.id AS image_id, images.image_url, images.upload_date
       FROM images
       JOIN ${table} ON images.id = ${table}.image_id
       WHERE ${table}.${entityType}_id = ?`,
      [entityId],
    );
  }

  async findById(imageId: number): Promise<ImageRecord | null> {
    const rows = query<ImageRow>(
      'SELECT id AS image_id, image_url, upload_date FROM images WHERE id = ?',
      [imageId],
    );
    return rows[0] ?? null;
  }

  async create(
    entityType: EntityType,
    entityId: number,
    imageUrl: string,
    uploadDate: string,
  ): Promise<number> {
    const table = JOIN_TABLE[entityType];

    // Wrap both inserts in a transaction so we never get an orphaned images row
    return transaction(({ execute: exec }) => {
      const imgResult = exec(
        'INSERT INTO images (image_url, upload_date) VALUES (?, ?)',
        [imageUrl, uploadDate],
      );
      const imageId = imgResult.insertId;
      exec(
        `INSERT INTO ${table} (${entityType}_id, image_id) VALUES (?, ?)`,
        [entityId, imageId],
      );
      return imageId;
    });
  }

  async update(imageId: number, fields: { date?: string; imageUrl?: string }): Promise<void> {
    const updates: string[] = [];
    const params: SqlParam[] = [];
    if (fields.date)     { updates.push('upload_date = ?'); params.push(fields.date); }
    if (fields.imageUrl) { updates.push('image_url = ?');   params.push(fields.imageUrl); }
    if (!updates.length) return;
    params.push(imageId);
    execute(`UPDATE images SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  async delete(imageId: number): Promise<void> {
    // ON DELETE CASCADE in join tables cleans up plant_images / substrate_images / component_images
    execute('DELETE FROM images WHERE id = ?', [imageId]);
  }

  async deleteByEntity(entityType: EntityType, entityId: number): Promise<ImageRecord[]> {
    const images = await this.findByEntity(entityType, entityId);
    // Batch delete in a single transaction
    transaction(({ execute: exec }) => {
      for (const img of images) {
        exec('DELETE FROM images WHERE id = ?', [img.image_id]);
      }
    });
    return images;
  }
}
