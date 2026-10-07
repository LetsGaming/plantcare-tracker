import { describe, it, expect } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { applyMigrations } from '../../src/core/database/db';
import type { Database } from '../../src/core/database/schema';

const open = () => {
  const sqlite = new BetterSqlite3(':memory:');
  const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
  return { sqlite, db };
};

describe('baseline migration', () => {
  it('builds the full schema on an empty database', async () => {
    const { sqlite, db } = open();
    expect(await applyMigrations(db)).toEqual(['0001_baseline']);
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toEqual(
      expect.arrayContaining([
        'users',
        'plants',
        'images',
        'watering_records',
        'substrate_components',
        'scrape_source_health',
        'kysely_migration',
      ]),
    );
    await db.destroy();
  });

  it('is recorded once and is a no-op afterwards', async () => {
    const { db } = open();
    await applyMigrations(db);
    expect(await applyMigrations(db)).toEqual([]);
    await db.destroy();
  });

  it('adopts a database created before migrations existed without touching its data', async () => {
    const { sqlite, db } = open();
    sqlite.exec(`
      CREATE TABLE roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password TEXT NOT NULL,
        role_id INTEGER NOT NULL DEFAULT 3,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
      INSERT INTO roles (id, name) VALUES (1, 'admin'), (2, 'user'), (3, 'guest');
      INSERT INTO users (id, username, password, role_id) VALUES (2, 'guest', 'legacy-hash', 3);
      INSERT INTO users (id, username, password, role_id) VALUES (5, 'alice', 'alice-hash', 2);
    `);

    await applyMigrations(db);

    const users = sqlite.prepare('SELECT id, username, password FROM users ORDER BY id').all();
    expect(users).toEqual([
      { id: 2, username: 'guest', password: 'legacy-hash' },
      { id: 5, username: 'alice', password: 'alice-hash' },
    ]);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM roles').get()).toEqual({ n: 3 });
    await db.destroy();
  });
});
