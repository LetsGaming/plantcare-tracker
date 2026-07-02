/**
 * modules/images/infrastructure/SQLiteImageRepository.ts
 *
 * SQLite implementation of the ImageRepository port.
 * Single table `images`: id, image_url, entity_type, entity_id, upload_date.
 */

import { query, execute, transaction } from "../../../core/database/db";
import type {
  ImageRepository,
  ImageRecord,
  EntityType,
  UpdateImageDTO,
} from "../domain/Image";

type SqlParam = string | number | boolean | null;

interface ImageRow {
  id: number;
  url: string;
  date: number;
  entityType: EntityType;
}

export class SQLiteImageRepository implements ImageRepository {
  async findByEntity(
    entityType: EntityType,
    entityId: number,
  ): Promise<ImageRecord[]> {
    return query<ImageRow>(
      `SELECT id, image_url AS url, upload_date AS date, entity_type AS "entityType"
       FROM images
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY upload_date ASC`,
      [entityType, entityId],
    );
  }

  async findById(imageId: number): Promise<ImageRecord | null> {
    const rows = query<ImageRow>(
      `SELECT id, image_url AS url, upload_date AS date, entity_type AS "entityType"
       FROM images
       WHERE id = ?`,
      [imageId],
    );
    return rows[0] ?? null;
  }

  async create(
    entityType: EntityType,
    entityId: number,
    imageUrl: string,
    uploadDate?: number,
  ): Promise<number> {
    const result = execute(
      `INSERT INTO images (image_url, entity_type, entity_id, upload_date)
       VALUES (?, ?, ?, COALESCE(?, strftime('%s','now')))`,
      [imageUrl, entityType, entityId, uploadDate ?? null],
    );
    return result.insertId;
  }

  async update(imageId: number, fields: UpdateImageDTO): Promise<void> {
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

  async delete(imageId: number): Promise<void> {
    execute(`DELETE FROM images WHERE id = ?`, [imageId]);
  }

  /**
   * Deletes all images of an entity inside one transaction and returns
   * the deleted records so the caller can clean up the files.
   */
  async deleteByEntity(
    entityType: EntityType,
    entityId: number,
  ): Promise<ImageRecord[]> {
    const images = await this.findByEntity(entityType, entityId);

    transaction(({ execute: exec }) => {
      for (const img of images) {
        exec(`DELETE FROM images WHERE id = ?`, [img.id]);
      }
    });

    return images;
  }
}
