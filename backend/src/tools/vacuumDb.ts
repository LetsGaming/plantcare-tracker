/**
 * Usage: pnpm run db:vacuum
 *
 * Rebuilds the database file to reclaim free pages. Stop the server first:
 * VACUUM needs exclusive access and temporary space as large as the database.
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { closeDb, getSqlite } from '../core/database/db';

const main = async (): Promise<void> => {
  const db = getSqlite();
  const before = db.pragma('page_count', { simple: true }) as number;
  db.exec('VACUUM');
  db.pragma('wal_checkpoint(TRUNCATE)');
  const after = db.pragma('page_count', { simple: true }) as number;
  console.log(`Pages before: ${before}, after: ${after}`);
  await closeDb();
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
