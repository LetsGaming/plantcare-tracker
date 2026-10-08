/**
 * Images carry no foreign key to their entity, so rows (and files) of deleted
 * plants, substrates and components were never removed. This deletes the rows
 * that point at nothing, along with their files on a best-effort basis.
 */

import fs from 'fs/promises';
import path from 'path';
import { sql, type Kysely } from 'kysely';
import { getConfig } from '../../config/env';
import { logger } from '../../logging';

interface OrphanImage {
  id: number;
  entity_type: string;
  image_url: string;
}

const BACKSLASH = String.fromCharCode(92);

export const up = async (db: Kysely<unknown>): Promise<void> => {
  const { rows } = await sql<OrphanImage>`
    SELECT id, entity_type, image_url FROM images
    WHERE (entity_type = 'plant' AND entity_id NOT IN (SELECT id FROM plants))
       OR (entity_type = 'substrate' AND entity_id NOT IN (SELECT id FROM substrates))
       OR (entity_type = 'component' AND entity_id NOT IN (SELECT id FROM components))
  `.execute(db);
  if (rows.length === 0) return;

  const { uploadsDir } = getConfig();
  for (const row of rows) {
    const filename = path.basename(row.image_url.split(BACKSLASH).join('/'));
    await fs.unlink(path.join(uploadsDir, row.entity_type, filename)).catch(() => undefined);
  }

  await sql`DELETE FROM images WHERE id IN (${sql.join(rows.map((r) => r.id))})`.execute(db);
  logger.info(`Removed ${rows.length} orphaned image rows`);
};
