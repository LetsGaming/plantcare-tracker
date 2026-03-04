/**
 * modules/images/infrastructure/MySQLImageRepository.ts
 *
 * The DB schema uses separate join tables per entity type:
 * plant_images, substrate_images, component_images.
 * This maps cleanly to the entityType string from V1.
 */

import type { Pool, RowDataPacket } from 'mysql2/promise';

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

interface ImageRow extends RowDataPacket {
  image_id: number;
  image_url: string;
  upload_date: string;
}

export class MySQLImageRepository {
  constructor(private readonly pool: Pool) {}

  async findByEntity(entityType: EntityType, entityId: number): Promise<ImageRecord[]> {
    const table = JOIN_TABLE[entityType];
    const [rows] = await this.pool.query<ImageRow[]>(
      `SELECT images.id as image_id, images.image_url, images.upload_date
       FROM images
       JOIN ${table} ON images.id = ${table}.image_id
       WHERE ${table}.${entityType}_id = ?`,
      [entityId],
    );
    return rows;
  }

  async findById(imageId: number): Promise<ImageRecord | null> {
    const [rows] = await this.pool.query<ImageRow[]>(
      'SELECT id as image_id, image_url, upload_date FROM images WHERE id = ?',
      [imageId],
    );
    return rows[0] ?? null;
  }

  async create(entityType: EntityType, entityId: number, imageUrl: string, uploadDate: string): Promise<number> {
    const table = JOIN_TABLE[entityType];
    const [result] = await this.pool.execute(
      'INSERT INTO images (image_url, upload_date) VALUES (?, ?)',
      [imageUrl, uploadDate],
    );
    const imageId = (result as { insertId: number }).insertId;
    await this.pool.execute(
      `INSERT INTO ${table} (${entityType}_id, image_id) VALUES (?, ?)`,
      [entityId, imageId],
    );
    return imageId;
  }

  async update(imageId: number, fields: { date?: string; imageUrl?: string }): Promise<void> {
    const updates: string[] = [];
    const params: unknown[] = [];
    if (fields.date) { updates.push('upload_date = ?'); params.push(fields.date); }
    if (fields.imageUrl) { updates.push('image_url = ?'); params.push(fields.imageUrl); }
    if (!updates.length) return;
    params.push(imageId);
    await this.pool.execute(`UPDATE images SET ${updates.join(', ')} WHERE id = ?`, params as (string | number)[]);
  }

  async delete(imageId: number): Promise<void> {
    // ON DELETE CASCADE in join tables handles plant_images / substrate_images / component_images
    await this.pool.execute('DELETE FROM images WHERE id = ?', [imageId]);
  }

  async deleteByEntity(entityType: EntityType, entityId: number): Promise<ImageRecord[]> {
    const images = await this.findByEntity(entityType, entityId);
    await Promise.all(images.map((img) => this.delete(img.image_id)));
    return images;
  }
}
