/**
 * src/tools/importMysqlDump.ts
 *
 * One-off import of a legacy MySQL dump into a fresh SQLite database.
 * The dump is first loaded into a scratch SQLite file after a regex
 * translation of the MySQL dialect, then copied table by table into a
 * database built by the migrations. Dump rows win over the seed rows the
 * baseline migration inserts (roles, guest user, lookup tables).
 */

import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Kysely, SqliteDialect } from 'kysely';
import { applyMigrations } from '../core/database/db';
import type { Database } from '../core/database/schema';

/** Converts a MySQL dump into SQL that SQLite accepts. */
export const sanitizeDump = (sql: string): string =>
  sql
    .replace(/\/\*![\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
    .replace(/^.*LOCK TABLES.*$/gim, '')
    .replace(/^.*UNLOCK TABLES.*$/gim, '')
    .replace(/^SET\s+[^;]+;/gim, '')
    .replace(/\b(int|varchar)\(\d+\)/gi, '$1')
    .replace(/\bENUM\s*\([^)]+\)/gi, 'TEXT')
    .replace(/\bSET\s*\([^)]+\)/gi, 'TEXT')
    .replace(/\bAUTO_INCREMENT\b/gi, '')
    .replace(/\bCHARACTER SET \w+\b/gi, '')
    .replace(/\bCOLLATE \w+\b/gi, '')
    .replace(/^\s*(?:UNIQUE\s+)?KEY\s+.*$/gm, '')
    .replace(/^\s*CONSTRAINT\s+.*$/gm, '')
    .replace(/\)\s*ENGINE=[^;]+;/gi, ');')
    .replace(/\bDEFAULT\s+CHARSET=\w+\b/gi, '')
    .replace(/\bCOLLATE=\w+\b/gi, '')
    .replace(/,\s*\)/g, ')')
    .replace(/DROP TABLE IF EXISTS .*?;/gi, '')
    .replace(/`/g, '')
    .replace(/\bCURRENT_TIMESTAMP\s*\(\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\\'/g, "''")
    .replace(/\n{2,}/g, '\n');

const loadDump = (rawDb: BetterSqlite3.Database, dumpSql: string): void => {
  const statements = sanitizeDump(dumpSql)
    .split(/;\s*\n/)
    .filter((s) => s.trim() !== '');
  rawDb.pragma('foreign_keys = OFF');
  statements.forEach((statement, index) => {
    try {
      rawDb.exec(`${statement.trim()};`);
    } catch (err) {
      const preview = statement.trim().slice(0, 300);
      throw new Error(
        `Dump statement #${index + 1} failed: ${(err as Error).message}\n${preview}`,
        { cause: err },
      );
    }
  });
};

const COPY_STATEMENTS = [
  `INSERT OR REPLACE INTO roles (id, name) SELECT id, name FROM raw.roles`,
  `INSERT OR REPLACE INTO users (id, username, password, role_id, created_at)
     SELECT id, username, password, role_id, strftime('%s', created_at) FROM raw.users`,
  `INSERT OR REPLACE INTO fineness_levels (id, name) SELECT id, name FROM raw.fineness_levels`,
  `INSERT OR REPLACE INTO components (id, name, fineness_id)
     SELECT id, name, fineness_id FROM raw.components`,
  `INSERT OR REPLACE INTO fertilizer_types (id, name) SELECT id, name FROM raw.fertilizer_types`,
  `INSERT OR REPLACE INTO substrates (id, name, user_id, is_public, created_at)
     SELECT id, name, user_id, is_public, strftime('%s', created_at) FROM raw.substrates`,
  `INSERT OR IGNORE INTO species (name)
     SELECT DISTINCT species FROM raw.plants WHERE species IS NOT NULL`,
  `INSERT OR REPLACE INTO plants (id, name, species_id, substrate_id, user_id, is_public, created_at)
     SELECT p.id, p.name, s.id, p.substrate_id, p.user_id, p.is_public, strftime('%s', p.created_at)
     FROM raw.plants p LEFT JOIN species s ON s.name = p.species`,
  `INSERT OR REPLACE INTO images (id, image_url, entity_type, entity_id, upload_date)
     SELECT id, image_url, 'plant', 0, strftime('%s', upload_date) FROM raw.images`,
  `UPDATE images SET entity_type = 'plant',
     entity_id = (SELECT plant_id FROM raw.plant_images pi WHERE pi.image_id = images.id)
     WHERE id IN (SELECT image_id FROM raw.plant_images)`,
  `UPDATE images SET entity_type = 'substrate',
     entity_id = (SELECT substrate_id FROM raw.substrate_images si WHERE si.image_id = images.id)
     WHERE id IN (SELECT image_id FROM raw.substrate_images)`,
  `UPDATE images SET entity_type = 'component',
     entity_id = (SELECT component_id FROM raw.component_images ci WHERE ci.image_id = images.id)
     WHERE id IN (SELECT image_id FROM raw.component_images)`,
  `INSERT OR REPLACE INTO substrate_components (substrate_id, component_id, parts)
     SELECT substrate_id, component_id, parts FROM raw.substrate_components`,
  `INSERT OR REPLACE INTO watering_records (id, plant_id, date, used_fertilizer, fertilizer_type_id)
     SELECT id, plant_id, strftime('%s', date), used_fertilizer, fertilizer_type_id
     FROM raw.watering_records`,
];

export interface ImportResult {
  /** Rows reported by PRAGMA foreign_key_check after the copy; empty means consistent. */
  foreignKeyViolations: unknown[];
}

/** Imports `dumpSql` into the SQLite file at `targetPath` (created if missing). */
export const importMysqlDump = async (
  dumpSql: string,
  targetPath: string,
): Promise<ImportResult> => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plantcare-import-'));
  const scratchPath = path.join(scratchDir, 'raw.db');

  const sqlite = new BetterSqlite3(targetPath);
  const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
  try {
    const raw = new BetterSqlite3(scratchPath);
    try {
      loadDump(raw, dumpSql);
    } finally {
      raw.close();
    }

    await applyMigrations(db);
    sqlite.pragma('foreign_keys = OFF');
    sqlite.exec(`ATTACH DATABASE '${scratchPath.replace(/'/g, "''")}' AS raw`);
    sqlite.transaction(() => {
      for (const statement of COPY_STATEMENTS) sqlite.exec(statement);
    })();
    sqlite.exec('DETACH DATABASE raw');
    sqlite.pragma('foreign_keys = ON');

    return { foreignKeyViolations: sqlite.pragma('foreign_key_check') as unknown[] };
  } finally {
    await db.destroy();
    if (sqlite.open) sqlite.close();
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
};
