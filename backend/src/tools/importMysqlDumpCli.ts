/**
 * Usage: pnpm run db:import -- <path-to-mysql-dump.sql>
 *
 * Writes to DB_PATH (default ./data/plantcare.db). Refuses to touch a
 * database that already contains users other than the seeded guest.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import BetterSqlite3 from 'better-sqlite3';
import { getConfig } from '../core/config';
import { importMysqlDump } from './importMysqlDump';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const hasRealUsers = (dbPath: string): boolean => {
  if (!fs.existsSync(dbPath)) return false;
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const table = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'users'").get();
    if (!table) return false;
    const row = db.prepare("SELECT COUNT(*) AS n FROM users WHERE username <> 'guest'").get() as {
      n: number;
    };
    return row.n > 0;
  } finally {
    db.close();
  }
};

const main = async (): Promise<void> => {
  const dumpPath = process.argv[2];
  if (!dumpPath || !fs.existsSync(dumpPath)) {
    console.error('Usage: pnpm run db:import -- <path-to-mysql-dump.sql>');
    process.exit(1);
  }

  const { dbPath } = getConfig();
  if (hasRealUsers(dbPath)) {
    console.error(`Refusing to import into ${dbPath}: it already contains users.`);
    process.exit(1);
  }

  console.log(`Importing ${dumpPath} into ${dbPath}`);
  const { foreignKeyViolations } = await importMysqlDump(
    fs.readFileSync(dumpPath, 'utf-8'),
    dbPath,
  );
  if (foreignKeyViolations.length) {
    console.error('Import finished with foreign key violations:', foreignKeyViolations);
    process.exit(1);
  }
  console.log('Import finished, foreign keys consistent.');
};

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
