/**
 * modules/images/infrastructure/SQLiteImageEntityLookup.ts
 *
 * Resolves the owner and visibility of the entity an image belongs to.
 * Reads the tables of other modules directly because images are keyed
 * by (entity_type, entity_id) and carry no foreign key.
 */

import { query } from '../../../core/database/db';
import type { EntityType, ImageEntityInfo, ImageEntityLookup } from '../domain/Image';

const OWNED_ENTITY_TABLE = {
  plant: 'plants',
  substrate: 'substrates',
} as const;

export class SQLiteImageEntityLookup implements ImageEntityLookup {
  async find(entityType: EntityType, entityId: number): Promise<ImageEntityInfo | null> {
    if (entityType === 'component') {
      const rows = query<{ id: number }>('SELECT id FROM components WHERE id = ?', [entityId]);
      return rows[0] ? { ownerId: null, isPublic: true } : null;
    }

    const table = OWNED_ENTITY_TABLE[entityType];
    const rows = query<{ ownerId: number; isPublic: number }>(
      `SELECT user_id AS ownerId, is_public AS isPublic FROM ${table} WHERE id = ?`,
      [entityId],
    );
    const row = rows[0];
    return row ? { ownerId: row.ownerId, isPublic: Boolean(row.isPublic) } : null;
  }
}
