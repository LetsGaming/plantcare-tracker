/**
 * tests/unit/modules/repositories.test.ts
 *
 * Tests for SQLite repository implementations.
 * The `src/core/database/db` module is mocked so better-sqlite3 is never
 * loaded — no native binary required during unit tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the db module BEFORE any repository imports ─────────────────────────

const mockQuery    = vi.fn().mockReturnValue([]);
const mockExecute  = vi.fn().mockReturnValue({ affectedRows: 1, insertId: 1 });
const mockTx       = vi.fn().mockImplementation((fn: Function) =>
  fn({ query: mockQuery, execute: mockExecute }),
);

vi.mock('../../../src/core/database/db', () => ({
  query:       (...args: unknown[]) => mockQuery(...args),
  execute:     (...args: unknown[]) => mockExecute(...args),
  transaction: (...args: unknown[]) => mockTx(...args),
  getDb:       vi.fn(),
  closeDb:     vi.fn(),
}));

// ── Imports (after mock registration) ────────────────────────────────────────

import { SQLitePlantRepository }     from '../../../src/modules/plants/infrastructure/SQLitePlantRepository';
import { SQLiteWateringRepository }  from '../../../src/modules/watering/infrastructure/SQLiteWateringRepository';
import { SQLiteSubstrateRepository } from '../../../src/modules/substrate/infrastructure/SQLiteSubstrateRepository';
import { SQLiteUserRepository }      from '../../../src/modules/auth/infrastructure/SQLiteUserRepository';
import { SQLiteImageRepository }     from '../../../src/modules/images/infrastructure/SQLiteImageRepository';
import { makePlantRow, makeWateringRow, makeSubstrateRow, makeUserRow } from '../../helpers/mockFactory';

beforeEach(() => {
  mockQuery.mockReset().mockReturnValue([]);
  mockExecute.mockReset().mockReturnValue({ affectedRows: 1, insertId: 1 });
  mockTx.mockReset().mockImplementation((fn: Function) =>
    fn({ query: mockQuery, execute: mockExecute }),
  );
});

// ── SQLitePlantRepository ─────────────────────────────────────────────────────

describe('SQLitePlantRepository', () => {
  it('findAllPublic returns mapped Plant entities', async () => {
    mockQuery.mockReturnValue([makePlantRow()]);
    const plants = await new SQLitePlantRepository().findAllPublic();
    expect(plants).toHaveLength(1);
    expect(plants[0].name).toBe('Monstera deliciosa');
    expect(plants[0].isPublic).toBe(true);
  });

  it('findAllPublic collapses multiple rows for same plant (multiple images)', async () => {
    mockQuery.mockReturnValue([
      makePlantRow({ image_id: 1, image_url: 'http://img1.jpg' }),
      makePlantRow({ image_id: 2, image_url: 'http://img2.jpg' }),
    ]);
    const plants = await new SQLitePlantRepository().findAllPublic();
    expect(plants).toHaveLength(1);
    expect(plants[0].images).toHaveLength(2);
  });

  it('findById returns null when no rows returned', async () => {
    mockQuery.mockReturnValue([]);
    const plant = await new SQLitePlantRepository().findById(999);
    expect(plant).toBeNull();
  });

  it('create inserts and returns insertId', async () => {
    mockExecute.mockReturnValue({ affectedRows: 1, insertId: 42 });
    const id = await new SQLitePlantRepository().create({
      name: 'Fern', species: 'Nephrolepis', substrateId: 1, isPublic: false, userId: 2,
    });
    expect(id).toBe(42);
  });

  it('update returns true when affectedRows > 0', async () => {
    mockExecute.mockReturnValue({ affectedRows: 1, insertId: 0 });
    const result = await new SQLitePlantRepository().update(1, 2, { name: 'Updated' });
    expect(result).toBe(true);
  });

  it('update returns false when affectedRows is 0', async () => {
    mockExecute.mockReturnValue({ affectedRows: 0, insertId: 0 });
    const result = await new SQLitePlantRepository().update(999, 2, { name: 'x' });
    expect(result).toBe(false);
  });

  it('delete returns false when affectedRows is 0', async () => {
    mockExecute.mockReturnValue({ affectedRows: 0, insertId: 0 });
    expect(await new SQLitePlantRepository().delete(999, 2)).toBe(false);
  });
});

// ── SQLiteWateringRepository ──────────────────────────────────────────────────

describe('SQLiteWateringRepository', () => {
  it('findByPlant maps used_fertilizer integer to boolean', async () => {
    mockQuery.mockReturnValue([makeWateringRow({ used_fertilizer: 1 })]);
    const records = await new SQLiteWateringRepository().findByPlant(1, 2);
    expect(records[0].used_fertilizer).toBe(true);
  });

  it('findById returns null when not found', async () => {
    mockQuery.mockReturnValue([]);
    expect(await new SQLiteWateringRepository().findById(999, 2)).toBeNull();
  });

  it('update builds correct SET clause', async () => {
    await new SQLiteWateringRepository().update(1, 2, { usedFertilizer: false, fertilizerTypeId: null });
    const sql = mockExecute.mock.calls[0][0] as string;
    expect(sql).toContain('used_fertilizer');
    expect(sql).toContain('fertilizer_type_id');
  });

  it('update allows setting fertilizerTypeId to null', async () => {
    await new SQLiteWateringRepository().update(1, 2, { fertilizerTypeId: null });
    const params = mockExecute.mock.calls[0][1] as unknown[];
    expect(params).toContain(null);
  });
});

// ── SQLiteSubstrateRepository ─────────────────────────────────────────────────

describe('SQLiteSubstrateRepository', () => {
  it('findById collapses components and images from JOIN rows', async () => {
    mockQuery.mockReturnValue([
      makeSubstrateRow({ component_id: 1, component_name: 'Perlite',   component_fineness_name: 'coarse', component_parts: 2 }),
      makeSubstrateRow({ component_id: 2, component_name: 'Coco Coir', component_fineness_name: 'fine',   component_parts: 3 }),
    ]);
    const substrate = await new SQLiteSubstrateRepository().findById(1);
    expect(substrate).not.toBeNull();
    expect(substrate!.components).toHaveLength(2);
  });

  it('upsertComponents uses INSERT OR REPLACE', async () => {
    await new SQLiteSubstrateRepository().upsertComponents(1, [{ componentId: 1, parts: 2 }]);
    // transaction mock delegates to mockExecute
    const sql = mockExecute.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT OR REPLACE');
  });

  it('deleteComponents builds correct IN clause', async () => {
    await new SQLiteSubstrateRepository().deleteComponents(1, [2, 3]);
    const sql = mockExecute.mock.calls[0][0] as string;
    expect(sql).toContain('IN (');
  });

  it('deleteComponents does nothing with empty array', async () => {
    await new SQLiteSubstrateRepository().deleteComponents(1, []);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

// ── SQLiteUserRepository ──────────────────────────────────────────────────────

describe('SQLiteUserRepository', () => {
  it('findByUsername returns null when not found', async () => {
    mockQuery.mockReturnValue([]);
    expect(await new SQLiteUserRepository().findByUsername('ghost')).toBeNull();
  });

  it('update only allows whitelisted columns', async () => {
    await new SQLiteUserRepository().update(1, { username: 'new', role_id: 1, malicious: 'DROP TABLE users' });
    const sql = mockExecute.mock.calls[0][0] as string;
    expect(sql).not.toContain('malicious');
    expect(sql).not.toContain('role_id');
    expect(sql).toContain('username');
  });

  it('update returns false when no valid fields are provided', async () => {
    const result = await new SQLiteUserRepository().update(1, { role_id: 99 });
    expect(result).toBe(false);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

// ── SQLiteImageRepository ─────────────────────────────────────────────────────

describe('SQLiteImageRepository', () => {
  it('delete only removes from images table (CASCADE handles join tables)', async () => {
    await new SQLiteImageRepository().delete(1);
    // transaction wraps the execute — check that it was called with DELETE FROM images
    const sql = mockExecute.mock.calls[0][0] as string;
    expect(sql).toContain('DELETE FROM images');
  });

  it('findByEntity queries the images table with entity_type for plant', async () => {
    mockQuery.mockReturnValue([]);
    await new SQLiteImageRepository().findByEntity('plant', 1);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('FROM images');
    expect(sql).toContain('entity_type');
  });

  it('findByEntity queries the images table with entity_type for substrate', async () => {
    mockQuery.mockReturnValue([]);
    await new SQLiteImageRepository().findByEntity('substrate', 1);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('FROM images');
    expect(sql).toContain('entity_type');
  });
});