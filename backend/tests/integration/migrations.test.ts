import { describe, it, expect } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Migrator } from 'kysely/migration';
import { migrationProvider } from '../../src/core/database/migrations';
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
    expect(await applyMigrations(db)).toEqual([
      '0001_baseline',
      '0002_purge_orphan_images',
      '0003_relative_image_paths',
      '0004_source_health_issues',
    ]);
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

describe('image data migrations', () => {
  const BACKSLASH = String.fromCharCode(92);

  const atBaseline = async () => {
    const { sqlite, db } = open();
    const migrator = new Migrator({ db, provider: migrationProvider });
    const { error } = await migrator.migrateTo('0001_baseline');
    if (error) throw error;
    return { sqlite, db };
  };

  it('purges rows of deleted entities and keeps live ones', async () => {
    const { sqlite, db } = await atBaseline();
    sqlite.exec(`
      INSERT INTO users (id, username, password) VALUES (9, 'u', 'h');
      INSERT INTO plants (id, name, user_id) VALUES (1, 'live', 9);
      INSERT INTO substrates (id, name, user_id) VALUES (1, 's', 9);
      INSERT INTO images (id, image_url, entity_type, entity_id) VALUES
        (1, '/uploads/plant/live.webp', 'plant', 1),
        (2, '/uploads/plant/gone.webp', 'plant', 2),
        (3, '/uploads/substrate/gone.webp', 'substrate', 7),
        (4, '/uploads/component/gone.webp', 'component', 3),
        (5, '/uploads/substrate/live.webp', 'substrate', 1);
    `);

    const migrator = new Migrator({ db, provider: migrationProvider });
    const { error } = await migrator.migrateToLatest();
    expect(error).toBeUndefined();

    const ids = sqlite.prepare('SELECT id FROM images ORDER BY id').all();
    expect(ids).toEqual([{ id: 1 }, { id: 5 }]);
    await db.destroy();
  });

  it('turns absolute and Windows-style urls into origin-free paths', async () => {
    const { sqlite, db } = await atBaseline();
    sqlite.exec(`
      INSERT INTO users (id, username, password) VALUES (9, 'u', 'h');
      INSERT INTO plants (id, name, user_id) VALUES (1, 'p', 9);
    `);
    const insert = sqlite.prepare(
      "INSERT INTO images (image_url, entity_type, entity_id) VALUES (?, 'plant', 1)",
    );
    insert.run('https://api.example.com/uploads/plant/a.webp');
    insert.run(`http://localhost:5000/uploads${BACKSLASH}plant${BACKSLASH}b.webp`);
    insert.run('/uploads/plant/c.webp');
    insert.run('https://cdn.example.com/elsewhere/d.webp');

    const migrator = new Migrator({ db, provider: migrationProvider });
    await migrator.migrateToLatest();

    const urls = sqlite.prepare('SELECT image_url FROM images ORDER BY id').all();
    expect(urls).toEqual([
      { image_url: '/uploads/plant/a.webp' },
      { image_url: '/uploads/plant/b.webp' },
      { image_url: '/uploads/plant/c.webp' },
      { image_url: 'https://cdn.example.com/elsewhere/d.webp' },
    ]);
    await db.destroy();
  });
});
