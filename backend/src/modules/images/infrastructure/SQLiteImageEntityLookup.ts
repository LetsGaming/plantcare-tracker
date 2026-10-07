/**
 * modules/images/infrastructure/SQLiteImageEntityLookup.ts
 *
 * Resolves the owner and visibility of the entity an image belongs to.
 * Reads the tables of other modules directly because images are keyed
 * by (entity_type, entity_id) and carry no foreign key.
 */

import { getKysely } from '../../../core/database/db';
import type { EntityType, ImageEntityInfo, ImageEntityLookup } from '../domain/Image';

export class SQLiteImageEntityLookup implements ImageEntityLookup {
  async find(entityType: EntityType, entityId: number): Promise<ImageEntityInfo | null> {
    const db = getKysely();

    if (entityType === 'component') {
      const row = await db
        .selectFrom('components')
        .select('id')
        .where('id', '=', entityId)
        .executeTakeFirst();
      return row ? { ownerId: null, isPublic: true } : null;
    }

    const table = entityType === 'plant' ? 'plants' : 'substrates';
    const row = await db
      .selectFrom(table)
      .select(['user_id as ownerId', 'is_public as isPublic'])
      .where('id', '=', entityId)
      .executeTakeFirst();
    return row ? { ownerId: row.ownerId, isPublic: Boolean(row.isPublic) } : null;
  }
}
