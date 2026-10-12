import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { applyMigrations } from '../../src/core/database/db';
import type { Database } from '../../src/core/database/schema';

const ROWS = 3000;
const USERS = 20;

const sqlite = new BetterSqlite3(':memory:');
const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });

const plan = (statement: string, ...params: unknown[]): string =>
  (sqlite.prepare(`EXPLAIN QUERY PLAN ${statement}`).all(...params) as { detail: string }[])
    .map((r) => r.detail)
    .join('\n');

const expectIndexed = (statement: string, index: string, ...params: unknown[]) => {
  const detail = plan(statement, ...params);
  expect(detail).toContain(`USING INDEX ${index}`);
  expect(detail).not.toContain('USE TEMP B-TREE FOR ORDER BY');
};

beforeAll(async () => {
  await applyMigrations(db);

  const insertUser = sqlite.prepare('INSERT INTO users (id, username, password) VALUES (?, ?, ?)');
  const insertPlant = sqlite.prepare(
    'INSERT INTO plants (name, user_id, is_public, created_at, substrate_id) VALUES (?, ?, ?, ?, ?)',
  );
  const insertSubstrate = sqlite.prepare(
    'INSERT INTO substrates (name, user_id, is_public, created_at) VALUES (?, ?, ?, ?)',
  );
  const insertComponent = sqlite.prepare(
    'INSERT INTO components (name, fineness_id) VALUES (?, 1)',
  );
  const insertLink = sqlite.prepare(
    'INSERT INTO substrate_components (substrate_id, component_id, parts) VALUES (?, ?, 1)',
  );
  sqlite.transaction(() => {
    for (let u = 1; u <= USERS; u++) insertUser.run(100 + u, `plan-user-${u}`, 'h');
    for (let i = 0; i < ROWS; i++) {
      const owner = 101 + (i % USERS);
      const isPublic = i % 10 === 0 ? 1 : 0;
      insertSubstrate.run(`Substrate ${i}`, owner, isPublic, 1_700_000_000 + i);
      insertPlant.run(`Plant ${i}`, owner, isPublic, 1_700_000_000 + i, i % 4 === 0 ? i + 1 : null);
    }
    for (let c = 0; c < 100; c++) insertComponent.run(`Component ${c}`);
    for (let s = 1; s <= 500; s++) insertLink.run(s, 1 + (s % 100));
  })();
  sqlite.exec('ANALYZE');
});

afterAll(async () => {
  await db.destroy();
});

describe('list query plans', () => {
  it.each([
    ['plants', 'p'],
    ['substrates', 'p'],
  ])('%s: mine, newest first', (table, alias) => {
    expectIndexed(
      `SELECT ${alias}.id FROM ${table} ${alias} WHERE ${alias}.user_id = ? ORDER BY ${alias}.created_at DESC, ${alias}.id DESC LIMIT ?`,
      `idx_${table}_user_created`,
      105,
      31,
    );
  });

  it.each(['plants', 'substrates'])('%s: mine, newest first, keyset continuation', (table) => {
    expectIndexed(
      `SELECT p.id FROM ${table} p WHERE p.user_id = ? AND (p.created_at, p.id) < (?, ?) ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
      `idx_${table}_user_created`,
      105,
      1_700_001_000,
      500,
      31,
    );
  });

  it.each(['plants', 'substrates'])('%s: mine, by name', (table) => {
    expectIndexed(
      `SELECT p.id FROM ${table} p WHERE p.user_id = ? ORDER BY p.name COLLATE NOCASE ASC, p.id ASC LIMIT ?`,
      `idx_${table}_user_name`,
      105,
      31,
    );
  });

  it.each(['plants', 'substrates'])('%s: public, newest first', (table) => {
    expectIndexed(
      `SELECT p.id FROM ${table} p WHERE p.is_public = 1 ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
      `idx_${table}_public_created`,
      31,
    );
  });

  it.each(['plants', 'substrates'])('%s: public, keyset continuation', (table) => {
    expectIndexed(
      `SELECT p.id FROM ${table} p WHERE p.is_public = 1 AND (p.created_at, p.id) < (?, ?) ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
      `idx_${table}_public_created`,
      1_700_001_000,
      500,
      31,
    );
  });

  it.each(['plants', 'substrates'])('%s: public, by name', (table) => {
    expectIndexed(
      `SELECT p.id FROM ${table} p WHERE p.is_public = 1 ORDER BY p.name COLLATE NOCASE ASC, p.id ASC LIMIT ?`,
      `idx_${table}_public_name`,
      31,
    );
  });

  it('components: by name', () => {
    expectIndexed(
      'SELECT c.id FROM components c ORDER BY c.name COLLATE NOCASE ASC, c.id ASC LIMIT ?',
      'idx_components_name',
      31,
    );
  });
});

describe('lookup query plans', () => {
  it('finds the substrates using a component through the component index', () => {
    const detail = plan('SELECT substrate_id FROM substrate_components WHERE component_id = ?', 7);
    expect(detail).toContain('idx_substrate_components_component');
  });

  it('finds the plants using a substrate through the partial substrate index', () => {
    const detail = plan('SELECT id FROM plants WHERE substrate_id = ?', 5);
    expect(detail).toContain('idx_plants_substrate');
  });

  it('reads the newest image of an entity from the lookup index without sorting', () => {
    const detail = plan(
      "SELECT id FROM images WHERE entity_type = 'plant' AND entity_id = ? ORDER BY upload_date DESC, id DESC LIMIT 1",
      5,
    );
    expect(detail).toContain('idx_images_lookup');
    expect(detail).not.toContain('USE TEMP B-TREE FOR ORDER BY');
  });

  it('no longer carries the old plants list index', () => {
    const names = (
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    expect(names).not.toContain('idx_plants_list');
  });
});
