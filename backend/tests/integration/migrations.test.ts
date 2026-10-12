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
      '0005_image_embeddings',
      '0006_list_indexes',
      '0007_image_variants',
      '0008_sales',
      '0009_sessions',
      '0010_watering_history_id_index',
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

describe('list index migration', () => {
  it('keeps existing rows and swaps the plants list index', async () => {
    const { sqlite, db } = open();
    const migrator = new Migrator({ db, provider: migrationProvider });
    const { error: baselineError } = await migrator.migrateTo('0001_baseline');
    if (baselineError) throw baselineError;
    sqlite.exec(`
      INSERT INTO users (id, username, password) VALUES (9, 'u', 'h');
      INSERT INTO plants (id, name, user_id) VALUES (1, 'a', 9), (2, 'b', 9);
      INSERT INTO images (id, image_url, entity_type, entity_id) VALUES (1, '/uploads/plant/a.webp', 'plant', 1);
    `);

    const { error } = await migrator.migrateToLatest();
    expect(error).toBeUndefined();

    expect(sqlite.prepare('SELECT id FROM plants ORDER BY id').all()).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
    expect(sqlite.prepare('SELECT id FROM images').all()).toEqual([{ id: 1 }]);
    const indexes = (sqlite.prepare('PRAGMA index_list(plants)').all() as { name: string }[]).map(
      (r) => r.name,
    );
    expect(indexes).toContain('idx_plants_user_created');
    expect(indexes).not.toContain('idx_plants_list');
    await db.destroy();
  });
});

describe('variant, sales and session migrations', () => {
  it('apply on a populated 0006 database without touching existing rows', async () => {
    const { sqlite, db } = open();
    const migrator = new Migrator({ db, provider: migrationProvider });
    const { error: earlierError } = await migrator.migrateTo('0006_list_indexes');
    if (earlierError) throw earlierError;
    sqlite.exec(`
      INSERT INTO users (id, username, password) VALUES (9, 'u', 'h');
      INSERT INTO plants (id, name, user_id) VALUES (1, 'a', 9);
      INSERT INTO images (id, image_url, entity_type, entity_id, upload_date)
        VALUES (1, '/uploads/plant/a.webp', 'plant', 1, 1700000000);
    `);

    const { error } = await migrator.migrateToLatest();
    expect(error).toBeUndefined();

    expect(sqlite.prepare('SELECT * FROM images').all()).toEqual([
      {
        id: 1,
        image_url: '/uploads/plant/a.webp',
        entity_type: 'plant',
        entity_id: 1,
        upload_date: 1700000000,
        width: null,
        height: null,
        placeholder: null,
        variants: 0,
      },
    ]);
    expect(sqlite.prepare('SELECT id, name FROM plants').all()).toEqual([{ id: 1, name: 'a' }]);
    const tables = (
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        'sales_items',
        'sales_price_points',
        'sales_source_state',
        'sessions',
      ]),
    );
    await db.destroy();
  });

  const latest = async () => {
    const { sqlite, db } = open();
    sqlite.pragma('foreign_keys = ON');
    await applyMigrations(db);
    return { sqlite, db };
  };

  it('creates the sales indexes with their partial predicates and a rowid-less price table', async () => {
    const { sqlite, db } = await latest();
    const master = sqlite
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE tbl_name IN ('sales_items', 'sales_price_points')",
      )
      .all() as { name: string; sql: string | null }[];
    const sqlOf = (name: string) => master.find((r) => r.name === name)?.sql ?? '';

    expect(sqlOf('idx_sales_active_first_seen')).toMatch(
      /\(first_seen_at DESC, sale_id DESC\) WHERE active = 1/,
    );
    expect(sqlOf('idx_sales_inactive_seen')).toMatch(/WHERE active = 0/);
    expect(sqlOf('idx_sales_source')).toContain('(source_key, active)');
    expect(sqlOf('sales_price_points')).toMatch(/WITHOUT ROWID/);
    await db.destroy();
  });

  it('serves the active sales page from the partial index without a temp b-tree', async () => {
    const { sqlite, db } = await latest();
    const plan = (
      sqlite
        .prepare(
          'EXPLAIN QUERY PLAN SELECT sale_id FROM sales_items WHERE active = 1 ORDER BY first_seen_at DESC, sale_id DESC LIMIT 100',
        )
        .all() as { detail: string }[]
    )
      .map((r) => r.detail)
      .join('\n');
    expect(plan).toMatch(/USING (COVERING )?INDEX idx_sales_active_first_seen/);
    expect(plan).not.toContain('USE TEMP B-TREE');
    await db.destroy();
  });

  it('cascades user deletes to sessions and sales item deletes to price points', async () => {
    const { sqlite, db } = await latest();
    sqlite.exec(`
      INSERT INTO users (id, username, password) VALUES (9, 'u', 'h');
      INSERT INTO sessions (sid, user_id, expires_at, created_at) VALUES ('s1', 9, 2000000000, 1700000000);
      INSERT INTO sales_items (sale_id, source_key, seller, name, link, new_price, first_seen_at, last_seen_at, scraped_at)
        VALUES ('i1', 'k', 'seller', 'n', 'https://x.test', 5, 1, 1, 1);
      INSERT INTO sales_price_points (sale_id, observed_at, price) VALUES ('i1', 1, 5), ('i1', 2, 4);
    `);

    sqlite.exec('DELETE FROM users WHERE id = 9');
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });

    sqlite.exec("DELETE FROM sales_items WHERE sale_id = 'i1'");
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM sales_price_points').get()).toEqual({ n: 0 });
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
