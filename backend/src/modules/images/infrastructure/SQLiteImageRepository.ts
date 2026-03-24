/**
 * modules/images/infrastructure/SQLiteImageRepository.ts
 *
 * Handles images in the new schema:
 *  • Single table `images` with columns: id, image_url, entity_type, entity_id, upload_date
 *  • All operations are straightforward, no join tables needed
 */

import { query, execute, transaction } from "../../../core/database/db";

export type EntityType = "plant" | "substrate" | "component";

export interface ImageRecord {
  image_id: number;
  image_url: string;
  upload_date: number; // timestamp in seconds
}

type SqlParam = string | number | boolean | null;

interface ImageRow {
  image_id: number;
  image_url: string;
  upload_date: number;
}

export class SQLiteImageRepository {
  /**
   * Fetch all images for a given entity
   */
  async findByEntity(
    entityType: EntityType,
    entityId: number,
  ): Promise<ImageRecord[]> {
    return query<ImageRow>(
      `SELECT id AS image_id, image_url, upload_date
       FROM images
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY upload_date ASC`,
      [entityType, entityId],
    );
  }

  /**
   * Fetch a single image by ID
   */
  async findById(imageId: number): Promise<ImageRecord | null> {
    const rows = query<ImageRow>(
      `SELECT id AS image_id, image_url, upload_date
       FROM images
       WHERE id = ?`,
      [imageId],
    );
    return rows[0] ?? null;
  }

  /**
   * Insert a new image
   */
  async create(
    entityType: EntityType,
    entityId: number,
    imageUrl: string,
    uploadDate?: number,
  ): Promise<number> {
    return transaction(({ execute: exec }) => {
      const result = exec(
        `INSERT INTO images (image_url, entity_type, entity_id, upload_date)
         VALUES (?, ?, ?, COALESCE(?, strftime('%s','now')))`,
        [imageUrl, entityType, entityId, uploadDate ?? null],
      );
      return result.insertId as number;
    });
  }

  /**
   * Update image URL and/or upload date
   */
  async update(
    imageId: number,
    fields: { imageUrl?: string; uploadDate?: number },
  ): Promise<void> {
    const updates: string[] = [];
    const params: SqlParam[] = [];
    if (fields.imageUrl !== undefined) {
      updates.push("image_url = ?");
      params.push(fields.imageUrl);
    }
    if (fields.uploadDate !== undefined) {
      updates.push("upload_date = ?");
      params.push(fields.uploadDate);
    }
    if (!updates.length) return;
    params.push(imageId);
    execute(`UPDATE images SET ${updates.join(", ")} WHERE id = ?`, params);
  }

  /**
   * Delete a single image
   */
  async delete(imageId: number): Promise<void> {
    execute(`DELETE FROM images WHERE id = ?`, [imageId]);
  }

  /**
   * Delete all images linked to a specific entity
   */
  async deleteByEntity(
    entityType: EntityType,
    entityId: number,
  ): Promise<ImageRecord[]> {
    const images = await this.findByEntity(entityType, entityId);

    transaction(({ execute: exec }) => {
      for (const img of images) {
        exec(`DELETE FROM images WHERE id = ?`, [img.image_id]);
      }
    });

    return images;
  }
}