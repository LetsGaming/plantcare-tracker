/**
 * src/core/database/db.ts
 *
 * SQLite connection wrapper using better-sqlite3.
 *
 * Design decisions for performance & correctness:
 *
 *  • WAL mode       — allows concurrent reads while a write is in progress.
 *                     Best choice for a web server with frequent reads.
 *  • synchronous NORMAL — safe with WAL (a crash cannot corrupt the DB);
 *                         faster than FULL while still durable on power-loss.
 *  • foreign_keys ON  — enforced at connection open; required every session.
 *  • cache_size 64 MB — reduces I/O for repeated scans of the same pages.
 *  • temp_store MEMORY — aggregates / sorts done in RAM, not temp files.
 *  • Singleton pattern — one Database instance per process (better-sqlite3
 *    is NOT async; keeping one connection avoids per-request open overhead).
 *
 * Query helper API mirrors the mysql2 pool surface used in the repositories
 * so the diff between MySQL↔SQLite repos stays minimal:
 *
 *   db.query(sql, params?)   → rows[]   (SELECT)
 *   db.execute(sql, params?) → { affectedRows, insertId }  (INSERT/UPDATE/DELETE)
 *   db.transaction(fn)       → wraps fn in BEGIN/COMMIT, rolls back on throw
 */

import BetterSqlite3 from 'better-sqlite3';
import type { Database as BetterSqlite3DB } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { logger } from '../logging';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SqlParam = string | number | boolean | null | Buffer;

export interface RunResult {
  affectedRows: number;
  insertId: number;
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: BetterSqlite3DB | null = null;

function openDb(): BetterSqlite3DB {
  const dbPath = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(process.cwd(), 'data', 'plantcare.db');

  // Ensure the directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new BetterSqlite3(dbPath);

  // Performance & safety PRAGMAs (applied once per connection)
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');   // 64 MB
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 134217728'); // 128 MB memory-mapped I/O

  logger.info(`SQLite database opened at ${dbPath}`);
  return db;
}

/**
 * Returns the singleton SQLite database instance, opening it on first call.
 */
export function getDb(): BetterSqlite3DB {
  if (!_instance) {
    _instance = openDb();
    initSchema(_instance);
  }
  return _instance;
}

/**
 * Applies the schema SQL if the database is empty (i.e. first run).
 * Idempotent — all CREATE TABLE statements use IF NOT EXISTS.
 */
function initSchema(db: BetterSqlite3DB): void {
  const schemaPath = path.resolve(process.cwd(), 'database', 'database-v3-sqlite.sql');
  if (!fs.existsSync(schemaPath)) {
    logger.warn(`Schema file not found at ${schemaPath} — skipping auto-init`);
    return;
  }

  const schema = fs.readFileSync(schemaPath, 'utf-8');
  // better-sqlite3 exec() runs multi-statement SQL in one shot
  db.exec(schema);
  logger.info('SQLite schema initialised (CREATE IF NOT EXISTS — safe to re-run)');
}

/**
 * Closes the database connection gracefully.
 * Call this during process shutdown (SIGTERM / SIGINT).
 */
export function closeDb(): void {
  if (_instance) {
    _instance.close();
    _instance = null;
    logger.info('SQLite database closed.');
  }
}

// ── Thin helper layer ─────────────────────────────────────────────────────────
//
// These wrappers let the repository classes use an API that closely mirrors
// the mysql2 pool (pool.query / pool.execute) so the diff between drivers
// stays small.
//
// better-sqlite3 is *synchronous*, but the repositories are still declared
// async so that callers never need to know which driver is underneath.

/**
 * Execute a SELECT statement and return all matching rows.
 * T can be any object shape — better-sqlite3 returns plain objects,
 * so there is no RowDataPacket constraint to satisfy.
 */
export function query<T extends object>(
  sql: string,
  params: SqlParam[] = [],
): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  return stmt.all(...params) as T[];
}

/**
 * Execute an INSERT, UPDATE, or DELETE statement.
 * Returns { affectedRows, insertId } to match the mysql2 result shape.
 */
export function execute(
  sql: string,
  params: SqlParam[] = [],
): RunResult {
  const db = getDb();
  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  return {
    affectedRows: result.changes,
    insertId: Number(result.lastInsertRowid),
  };
}

/**
 * Run multiple operations inside a single BEGIN/COMMIT transaction.
 * Automatically rolls back on any thrown error.
 */
export function transaction<T>(fn: (helpers: { query: typeof query; execute: typeof execute }) => T): T {
  const db = getDb();
  const run = db.transaction(() => fn({ query, execute }));
  return run();
}
