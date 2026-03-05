/**
 * tests/unit/modules/repositories.test.ts
 *
 * Tests for MySQL repository implementations using a mocked pool.
 * These verify that repositories build correct SQL and map rows correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MySQLPlantRepository } from '../../../src-v2/modules/plants/infrastructure/MySQLPlantRepository';
import { MySQLWateringRepository } from '../../../src-v2/modules/watering/infrastructure/MySQLWateringRepository';
import { MySQLSubstrateRepository } from '../../../src-v2/modules/substrate/infrastructure/MySQLSubstrateRepository';
import { MySQLUserRepository } from '../../../src-v2/modules/auth/infrastructure/MySQLUserRepository';
import { MySQLImageRepository } from '../../../src-v2/modules/images/infrastructure/MySQLImageRepository';
import { createMockPool, makePlantRow, makeWateringRow, makeSubstrateRow, makeUserRow } from '../../helpers/mockFactory';
import type { ResultSetHeader } from 'mysql2/promise';

// ── MySQLPlantRepository ──────────────────────────────────────────────────────

describe('MySQLPlantRepository', () => {
  it('findAllPublic returns mapped Plant entities', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[makePlantRow()], []]);
    const repo = new MySQLPlantRepository(pool);
    const plants = await repo.findAllPublic();
    expect(plants).toHaveLength(1);
    expect(plants[0].name).toBe('Monstera deliciosa');
    expect(plants[0].isPublic).toBe(true);
  });

  it('findAllPublic collapses multiple rows for same plant (multiple images)', async () => {
    const row1 = makePlantRow({ image_id: 1, image_url: 'http://img1.jpg' });
    const row2 = makePlantRow({ image_id: 2, image_url: 'http://img2.jpg' });
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[row1, row2], []]);
    const plants = await new MySQLPlantRepository(pool).findAllPublic();
    expect(plants).toHaveLength(1);
    expect(plants[0].images).toHaveLength(2);
  });

  it('findById returns null when no rows returned', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[], []]);
    const plant = await new MySQLPlantRepository(pool).findById(999);
    expect(plant).toBeNull();
  });

  it('create inserts and returns insertId', async () => {
    const pool = createMockPool();
    (pool.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ insertId: 42 } as ResultSetHeader, []]);
    const id = await new MySQLPlantRepository(pool).create({
      name: 'Fern', species: 'Nephrolepis', substrateId: 1, isPublic: false, userId: 2,
    });
    expect(id).toBe(42);
  });

  it('update returns true when affectedRows > 0', async () => {
    const pool = createMockPool();
    (pool.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ affectedRows: 1 } as ResultSetHeader, []]);
    const result = await new MySQLPlantRepository(pool).update(1, 2, { name: 'Updated' });
    expect(result).toBe(true);
  });

  it('update returns false when affectedRows is 0', async () => {
    const pool = createMockPool();
    (pool.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ affectedRows: 0 } as ResultSetHeader, []]);
    const result = await new MySQLPlantRepository(pool).update(999, 2, { name: 'x' });
    expect(result).toBe(false);
  });

  it('delete returns false when affectedRows is 0', async () => {
    const pool = createMockPool();
    (pool.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ affectedRows: 0 } as ResultSetHeader, []]);
    expect(await new MySQLPlantRepository(pool).delete(999, 2)).toBe(false);
  });
});

// ── MySQLWateringRepository ───────────────────────────────────────────────────

describe('MySQLWateringRepository', () => {
  it('findByPlant maps used_fertilizer to boolean', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[makeWateringRow({ used_fertilizer: 1 })], []]);
    const records = await new MySQLWateringRepository(pool).findByPlant(1);
    expect(records[0].used_fertilizer).toBe(true);
  });

  it('findById returns null when not found', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[], []]);
    expect(await new MySQLWateringRepository(pool).findById(999)).toBeNull();
  });

  it('update builds correct SET clause without magic sentinel', async () => {
    const pool = createMockPool();
    (pool.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ affectedRows: 1 } as ResultSetHeader, []]);
    const repo = new MySQLWateringRepository(pool);
    await repo.update(1, 2, { usedFertilizer: false, fertilizerTypeId: null });
    const sql = (pool.execute as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('used_fertilizer');
    expect(sql).toContain('fertilizer_type_id');
  });

  it('update allows setting fertilizerTypeId to null', async () => {
    const pool = createMockPool();
    (pool.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ affectedRows: 1 } as ResultSetHeader, []]);
    await new MySQLWateringRepository(pool).update(1, 2, { fertilizerTypeId: null });
    const params = (pool.execute as ReturnType<typeof vi.fn>).mock.calls[0][1] as unknown[];
    expect(params).toContain(null);
  });
});

// ── MySQLSubstrateRepository ──────────────────────────────────────────────────

describe('MySQLSubstrateRepository', () => {
  it('findById collapses components and images from JOIN rows', async () => {
    const row1 = makeSubstrateRow({ component_id: 1, component_name: 'Perlite', component_fineness_name: 'coarse', component_parts: 2 });
    const row2 = makeSubstrateRow({ component_id: 2, component_name: 'Coco Coir', component_fineness_name: 'fine', component_parts: 3 });
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[row1, row2], []]);
    const substrate = await new MySQLSubstrateRepository(pool).findById(1);
    expect(substrate).not.toBeNull();
    expect(substrate!.components).toHaveLength(2);
  });

  it('upsertComponents uses ON DUPLICATE KEY UPDATE', async () => {
    const pool = createMockPool();
    await new MySQLSubstrateRepository(pool).upsertComponents(1, [{ componentId: 1, parts: 2 }]);
    const sql = (pool.execute as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('ON DUPLICATE KEY UPDATE');
  });

  it('deleteComponents builds correct IN clause', async () => {
    const pool = createMockPool();
    await new MySQLSubstrateRepository(pool).deleteComponents(1, [2, 3]);
    const sql = (pool.execute as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('IN (');
  });

  it('deleteComponents does nothing with empty array', async () => {
    const pool = createMockPool();
    await new MySQLSubstrateRepository(pool).deleteComponents(1, []);
    expect(pool.execute).not.toHaveBeenCalled();
  });
});

// ── MySQLUserRepository ───────────────────────────────────────────────────────

describe('MySQLUserRepository', () => {
  it('findByUsername returns null when not found', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[], []]);
    expect(await new MySQLUserRepository(pool).findByUsername('ghost')).toBeNull();
  });

  it('update only allows whitelisted columns', async () => {
    const pool = createMockPool();
    (pool.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ affectedRows: 1 } as ResultSetHeader, []]);
    const repo = new MySQLUserRepository(pool);
    // Attempt to inject a non-whitelisted column
    await repo.update(1, { username: 'new', role_id: 1, malicious: 'DROP TABLE users' });
    const sql = (pool.execute as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).not.toContain('malicious');
    expect(sql).not.toContain('role_id');
    expect(sql).toContain('username');
  });

  it('update returns false when no valid fields are provided', async () => {
    const pool = createMockPool();
    const result = await new MySQLUserRepository(pool).update(1, { role_id: 99 });
    expect(result).toBe(false);
    expect(pool.execute).not.toHaveBeenCalled();
  });
});

// ── MySQLImageRepository ──────────────────────────────────────────────────────

describe('MySQLImageRepository', () => {
  it('delete only removes from images table (CASCADE handles join tables)', async () => {
    const pool = createMockPool();
    await new MySQLImageRepository(pool).delete(1);
    const calls = (pool.execute as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    expect((calls[0][0] as string)).toContain('DELETE FROM images');
  });

  it('findByEntity uses correct join table', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[], []]);
    await new MySQLImageRepository(pool).findByEntity('plant', 1);
    const sql = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('plant_images');
  });

  it('findByEntity uses substrate_images for substrate type', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[], []]);
    await new MySQLImageRepository(pool).findByEntity('substrate', 1);
    const sql = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('substrate_images');
  });
});
