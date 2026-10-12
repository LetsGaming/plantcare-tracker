/**
 * src/core/database/db.ts
 *
 * SQLite connection and Kysely instance.
 *
 *  - WAL mode lets reads proceed while a write is in progress.
 *  - synchronous NORMAL is safe with WAL and faster than FULL.
 *  - foreign_keys must be enabled per connection.
 *  - One connection per process: better-sqlite3 is synchronous, so a pool
 *    would only add overhead.
 *
 * `initDatabase()` applies pending migrations and must complete before the
 * app serves requests. Repositories use `getKysely()`; the raw handle
 * (`getSqlite()`) is for health checks and the synchronous source-health
 * store.
 */

import BetterSqlite3 from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { Kysely, SqliteDialect } from 'kysely';
import { Migrator } from 'kysely/migration';
import { logger } from '../logging';
import { getConfig } from '../config';
import type { Database } from './schema';
import { migrationProvider } from './migrations';

let sqlite: SqliteDatabase | null = null;
let kysely: Kysely<Database> | null = null;

const IN_MEMORY = ':memory:';

const openSqlite = (): SqliteDatabase => {
  const { dbPath } = getConfig();
  if (dbPath !== IN_MEMORY) fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new BetterSqlite3(dbPath);
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); // 64 MB
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 134217728'); // 128 MB memory-mapped I/O
  db.pragma('journal_size_limit = 67108864'); // 64 MB

  logger.debug(`SQLite database opened at ${dbPath}`);
  return db;
};

/** The raw better-sqlite3 connection, opened on first use. */
export const getSqlite = (): SqliteDatabase => (sqlite ??= openSqlite());

/** The typed query builder over the shared connection. */
export const getKysely = (): Kysely<Database> =>
  (kysely ??= new Kysely<Database>({ dialect: new SqliteDialect({ database: getSqlite() }) }));

/** Applies every pending migration to the given database. Throws when one fails. */
export const applyMigrations = async (db: Kysely<Database>): Promise<string[]> => {
  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error, results } = await migrator.migrateToLatest();
  if (error) throw error instanceof Error ? error : new Error(String(error));
  return (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName);
};

/** Brings the process database up to date; must finish before requests are served. */
export const initDatabase = async (): Promise<void> => {
  for (const name of await applyMigrations(getKysely())) logger.info(`Applied migration ${name}`);
  const db = getSqlite();
  db.pragma('analysis_limit = 1000');
  db.pragma('optimize = 0x10002');
};

/** Closes the connection; call during shutdown so the WAL is checkpointed. */
export const closeDb = async (): Promise<void> => {
  if (!sqlite) return;
  if (sqlite.open) {
    try {
      sqlite.pragma('optimize');
    } catch (error) {
      logger.warn(`SQLite optimize failed during shutdown: ${String(error)}`);
    }
  }
  // Destroying Kysely closes the underlying connection.
  if (kysely) await kysely.destroy();
  else sqlite.close();
  kysely = null;
  sqlite = null;
  logger.debug('SQLite database closed.');
};
