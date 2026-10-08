import { describe, it, expect, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { importMysqlDump } from '../../src/tools/importMysqlDump';

const dump = fs.readFileSync(path.join(__dirname, '../fixtures/mysql-dump.sql'), 'utf-8');

let dir: string | null = null;
const targetPath = () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plantcare-import-test-'));
  return path.join(dir, 'imported.db');
};

afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
});

const rows = <T>(file: string, sql: string): T[] => {
  const db = new BetterSqlite3(file, { readonly: true });
  try {
    return db.prepare(sql).all() as T[];
  } finally {
    db.close();
  }
};

describe('importMysqlDump', () => {
  it('imports a dump whose roles and guest user collide with the seed rows', async () => {
    const file = targetPath();
    const { foreignKeyViolations } = await importMysqlDump(dump, file);
    expect(foreignKeyViolations).toEqual([]);

    expect(rows(file, 'SELECT id, name FROM roles ORDER BY id')).toEqual([
      { id: 1, name: 'admin' },
      { id: 2, name: 'user' },
      { id: 3, name: 'guest' },
    ]);
    expect(rows(file, 'SELECT id, username, role_id FROM users ORDER BY id')).toEqual([
      { id: 1, username: 'owner', role_id: 1 },
      { id: 2, username: 'guest', role_id: 3 },
    ]);
  });

  it('copies domain data, converting timestamps and folding species case', async () => {
    const file = targetPath();
    await importMysqlDump(dump, file);

    expect(rows(file, 'SELECT name FROM species')).toEqual([{ name: 'Monstera deliciosa' }]);
    expect(rows(file, 'SELECT id, species_id FROM plants ORDER BY id')).toEqual([
      { id: 1, species_id: 1 },
      { id: 2, species_id: 1 },
      { id: 3, species_id: null },
    ]);
    expect(rows(file, 'SELECT created_at FROM users WHERE id = 1')).toEqual([
      { created_at: Date.UTC(2024, 0, 2, 3, 4, 5) / 1000 },
    ]);
    expect(rows(file, 'SELECT name FROM components ORDER BY id')).toEqual([
      { name: 'Perlite' },
      { name: "Owner's mix" },
    ]);
    expect(rows(file, 'SELECT parts FROM substrate_components ORDER BY component_id')).toEqual([
      { parts: 2.5 },
      { parts: 1 },
    ]);
    expect(rows(file, 'SELECT used_fertilizer, fertilizer_type_id FROM watering_records')).toEqual([
      { used_fertilizer: 1, fertilizer_type_id: 2 },
    ]);
  });

  it('maps images to their entities', async () => {
    const file = targetPath();
    await importMysqlDump(dump, file);
    expect(rows(file, 'SELECT id, entity_type, entity_id FROM images ORDER BY id')).toEqual([
      { id: 1, entity_type: 'plant', entity_id: 1 },
      { id: 2, entity_type: 'substrate', entity_id: 1 },
    ]);
  });

  it('records the baseline migration so the app can start on the result', async () => {
    const file = targetPath();
    await importMysqlDump(dump, file);
    expect(rows(file, 'SELECT name FROM kysely_migration')).toEqual([
      { name: '0001_baseline' },
      { name: '0002_purge_orphan_images' },
      { name: '0003_relative_image_paths' },
      { name: '0004_source_health_issues' },
    ]);
  });

  it('names the failing statement when the dump cannot be loaded', async () => {
    const file = targetPath();
    await expect(importMysqlDump('CREATE TABLE broken (;\n', file)).rejects.toThrow(
      /statement #1 failed/,
    );
  });
});
