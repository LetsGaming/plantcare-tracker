/**
 * Field-level problems found in the latest scrape of a source, stored as a
 * JSON array of { code, affected, total }.
 */

import { sql, type Kysely } from 'kysely';

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await sql`ALTER TABLE scrape_source_health ADD COLUMN issues TEXT NOT NULL DEFAULT '[]'`.execute(
    db,
  );
};
