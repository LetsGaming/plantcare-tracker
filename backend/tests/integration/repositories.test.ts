/**
 * Repository tests against a real in-memory SQLite database built by the
 * migrations, so queries, constraints and migrations are exercised together.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.DB_PATH = ':memory:';

import { initDatabase, closeDb, getKysely, getSqlite } from '../../src/core/database/db';
import { SQLitePlantRepository } from '../../src/modules/plants/infrastructure/SQLitePlantRepository';
import { SQLiteSpeciesCatalog } from '../../src/modules/plants/infrastructure/SQLiteSpeciesCatalog';
import { SpeciesResolver } from '../../src/modules/plants/domain/SpeciesResolver';
import { SQLiteWateringRepository } from '../../src/modules/watering/infrastructure/SQLiteWateringRepository';
import { SQLiteSubstrateRepository } from '../../src/modules/substrate/infrastructure/SQLiteSubstrateRepository';
import { SQLiteComponentRepository } from '../../src/modules/components/infrastructure/SQLiteComponentRepository';
import { SQLiteUserRepository } from '../../src/modules/auth/infrastructure/SQLiteUserRepository';
import { SQLiteImageRepository } from '../../src/modules/images/infrastructure/SQLiteImageRepository';
import { SQLiteImageEntityLookup } from '../../src/modules/images/infrastructure/SQLiteImageEntityLookup';
import { SQLiteSourceHealthRepository } from '../../src/core/scrapeHealth/SQLiteSourceHealthRepository';

const users = new SQLiteUserRepository();
const plants = new SQLitePlantRepository(new SpeciesResolver(new SQLiteSpeciesCatalog()));
const substrates = new SQLiteSubstrateRepository();
const components = new SQLiteComponentRepository();
const watering = new SQLiteWateringRepository();
const images = new SQLiteImageRepository();

let seq = 0;
const newUser = async () => (await users.create(`repo-user-${++seq}`, 'hash')).id;

beforeAll(async () => {
  await initDatabase();
});

afterAll(async () => {
  await closeDb();
});

describe('migrations', () => {
  it('records the baseline and seeds the lookup rows', async () => {
    const applied = await getKysely()
      .selectFrom('kysely_migration' as never)
      .selectAll()
      .execute();
    expect(applied.map((m) => (m as { name: string }).name)).toEqual(['0001_baseline']);

    const roles = await getKysely().selectFrom('roles').select('name').orderBy('id').execute();
    expect(roles.map((r) => r.name)).toEqual(['admin', 'user', 'guest']);
    expect(await watering.findFertilizerTypes()).toHaveLength(2);
    expect(await components.findFinenessLevels()).toHaveLength(3);
  });

  it('can run again without changing anything', async () => {
    await initDatabase();
    const roles = await getKysely().selectFrom('roles').select('id').execute();
    expect(roles).toHaveLength(3);
  });
});

describe('SQLiteUserRepository', () => {
  it('creates a user with the least privileged named role and finds it case-insensitively', async () => {
    const { id } = await users.create('Alice', 'hash');
    const found = await users.findByUsername('alice');
    expect(found).toMatchObject({ id, username: 'Alice', role: 'user' });
  });

  it('returns null for an unknown user', async () => {
    expect(await users.findByUsername('ghost')).toBeNull();
  });

  it('updates only username and password', async () => {
    const id = await newUser();
    expect(await users.update(id, { username: `renamed-${id}`, role_id: 1 })).toBe(true);
    const found = await users.findByUsername(`renamed-${id}`);
    expect(found?.role).toBe('user');
  });

  it('returns false when no valid fields are given', async () => {
    expect(await users.update(await newUser(), { role_id: 99 })).toBe(false);
  });

  it('never edits or deletes the guest account', async () => {
    const guest = await users.findByUsername('guest');
    expect(await users.update(guest!.id, { username: 'x' })).toBe(false);
    expect(await users.delete(guest!.id)).toBe(false);
    expect(await users.findByUsername('guest')).not.toBeNull();
  });
});

describe('SQLitePlantRepository', () => {
  it('creates a plant, reuses a close species and reads it back with its substrate', async () => {
    const userId = await newUser();
    const substrateId = await substrates.create('Mix', userId, false);
    const first = await plants.create({
      name: 'Monty',
      species: 'Monstera deliciosa',
      substrateId,
      isPublic: false,
      userId,
    });
    const second = await plants.create({
      name: 'Monty 2',
      species: 'monstera delicosa',
      substrateId,
      isPublic: true,
      userId,
    });

    const a = await plants.findById(first);
    const b = await plants.findById(second);
    expect(a).toMatchObject({ name: 'Monty', species: 'Monstera deliciosa' });
    expect(b?.species).toBe('Monstera deliciosa');
    expect(a?.substrate).toMatchObject({ substrate_id: substrateId, substrate_name: 'Mix' });
    expect(await getKysely().selectFrom('species').select('id').execute()).toHaveLength(1);
  });

  it('lists public plants and a user plants separately', async () => {
    const userId = await newUser();
    const substrateId = await substrates.create('S', userId, false);
    const priv = await plants.create({
      name: 'p',
      species: 'Aloe',
      substrateId,
      isPublic: false,
      userId,
    });
    const pub = await plants.create({
      name: 'q',
      species: 'Aloe',
      substrateId,
      isPublic: true,
      userId,
    });

    expect((await plants.findAllByUser(userId)).map((p) => p.id).sort()).toEqual(
      [priv, pub].sort(),
    );
    const publicIds = (await plants.findAllPublic()).map((p) => p.id);
    expect(publicIds).toContain(pub);
    expect(publicIds).not.toContain(priv);
  });

  it('updates only for the owner and reports whether a row changed', async () => {
    const userId = await newUser();
    const substrateId = await substrates.create('S', userId, false);
    const id = await plants.create({
      name: 'p',
      species: 'Aloe',
      substrateId,
      isPublic: false,
      userId,
    });

    expect(await plants.update(id, userId, { name: 'renamed', isPublic: true })).toBe(true);
    expect(await plants.update(id, userId + 999, { name: 'x' })).toBe(false);
    expect(await plants.update(id, userId, {})).toBe(false);
    expect((await plants.findById(id))?.isPublic).toBe(true);
  });

  it('deletes only for the owner', async () => {
    const userId = await newUser();
    const substrateId = await substrates.create('S', userId, false);
    const id = await plants.create({
      name: 'p',
      species: 'Aloe',
      substrateId,
      isPublic: false,
      userId,
    });
    expect(await plants.delete(id, userId + 999)).toBe(false);
    expect(await plants.delete(id, userId)).toBe(true);
    expect(await plants.findById(id)).toBeNull();
  });

  it('normalises Windows separators in stored image urls', async () => {
    const userId = await newUser();
    const substrateId = await substrates.create('S', userId, false);
    const id = await plants.create({
      name: 'p',
      species: 'Aloe',
      substrateId,
      isPublic: false,
      userId,
    });
    await images.create('plant', id, 'http://h/uploads\\plant\\a.webp');
    expect((await plants.findById(id))?.images[0].url).toBe('http://h/uploads/plant/a.webp');
  });
});

describe('SQLiteWateringRepository', () => {
  const setup = async () => {
    const userId = await newUser();
    const substrateId = await substrates.create('S', userId, false);
    const plantId = await plants.create({
      name: 'p',
      species: 'Aloe',
      substrateId,
      isPublic: false,
      userId,
    });
    return { userId, plantId };
  };

  it('creates records only for plants the user owns', async () => {
    const { userId, plantId } = await setup();
    const id = await watering.create(
      { plantId, date: 1_700_000_000, usedFertilizer: true, fertilizerTypeId: 1 },
      userId,
    );
    expect(id).toBeGreaterThan(0);
    const foreign = await watering.create(
      { plantId, date: 1_700_000_000, usedFertilizer: false, fertilizerTypeId: null },
      userId + 999,
    );
    expect(foreign).toBe(0);
  });

  it('maps fertilizer data and booleans', async () => {
    const { userId, plantId } = await setup();
    await watering.create(
      { plantId, date: 1_700_000_000, usedFertilizer: true, fertilizerTypeId: 2 },
      userId,
    );
    const [record] = await watering.findByPlant(plantId, userId);
    expect(record).toMatchObject({
      used_fertilizer: true,
      fertilizer_type: 'synthetic',
      watering_date: 1_700_000_000,
      owner_id: userId,
    });
    expect(await watering.findById(record.record_id, userId + 999)).toBeNull();
  });

  it('updates fields, allows clearing the fertilizer type, and scopes by owner', async () => {
    const { userId, plantId } = await setup();
    const id = await watering.create(
      { plantId, date: 1_700_000_000, usedFertilizer: true, fertilizerTypeId: 1 },
      userId,
    );
    expect(
      await watering.update(id, userId, { usedFertilizer: false, fertilizerTypeId: null }),
    ).toBe(true);
    expect((await watering.findById(id, userId))?.fertilizer_type_id).toBeNull();
    expect(await watering.update(id, userId + 999, { date: 5 })).toBe(false);
    expect(await watering.delete(id, userId + 999)).toBe(false);
    expect(await watering.delete(id, userId)).toBe(true);
  });
});

describe('SQLiteSubstrateRepository', () => {
  it('collapses components and images and rounds parts to two decimals', async () => {
    const userId = await newUser();
    const substrateId = await substrates.create('Mix', userId, true);
    const perlite = await components.create('Perlite', 1);
    const coir = await components.create('Coco', 3);
    await substrates.addComponents(substrateId, [
      { componentId: perlite, parts: 2.345 },
      { componentId: coir, parts: 3 },
    ]);
    await images.create('substrate', substrateId, 'http://h/a.webp');
    await images.create('substrate', substrateId, 'http://h/b.webp');

    const substrate = await substrates.findById(substrateId);
    expect(substrate?.components.map((c) => c.component_name).sort()).toEqual(['Coco', 'Perlite']);
    expect(substrate?.components.find((c) => c.component_name === 'Perlite')?.component_parts).toBe(
      2.35,
    );
    expect(substrate?.images).toHaveLength(2);
  });

  it('rejects a duplicate component and rolls the whole batch back', async () => {
    const userId = await newUser();
    const substrateId = await substrates.create('Mix', userId, false);
    const a = await components.create('A', 1);
    const b = await components.create('B', 1);
    await substrates.addComponents(substrateId, [{ componentId: a, parts: 1 }]);

    await expect(
      substrates.addComponents(substrateId, [
        { componentId: b, parts: 1 },
        { componentId: a, parts: 1 },
      ]),
    ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
    expect((await substrates.findById(substrateId))?.components).toHaveLength(1);
  });

  it('upserts and deletes components', async () => {
    const userId = await newUser();
    const substrateId = await substrates.create('Mix', userId, false);
    const a = await components.create('A', 1);
    const b = await components.create('B', 1);
    await substrates.upsertComponents(substrateId, [{ componentId: a, parts: 1 }]);
    await substrates.upsertComponents(substrateId, [
      { componentId: a, parts: 4 },
      { componentId: b, parts: 2 },
    ]);
    let substrate = await substrates.findById(substrateId);
    expect(substrate?.components.find((c) => c.component_id === a)?.component_parts).toBe(4);

    await substrates.deleteComponents(substrateId, []);
    await substrates.deleteComponents(substrateId, [a]);
    substrate = await substrates.findById(substrateId);
    expect(substrate?.components.map((c) => c.component_id)).toEqual([b]);
  });

  it('scopes updates and deletes to the owner', async () => {
    const userId = await newUser();
    const id = await substrates.create('Mix', userId, false);
    expect(await substrates.update(id, userId + 999, { name: 'x' })).toBe(false);
    expect(await substrates.update(id, userId, { name: 'y', isPublic: true })).toBe(true);
    expect(await substrates.delete(id, userId + 999)).toBe(false);
    expect(await substrates.delete(id, userId)).toBe(true);
  });
});

describe('SQLiteImageRepository', () => {
  it('stores, lists in date order, updates and deletes images', async () => {
    const entityId = 4242;
    const later = await images.create('plant', entityId, 'http://h/2.webp', 200);
    const earlier = await images.create('plant', entityId, 'http://h/1.webp', 100);

    expect((await images.findByEntity('plant', entityId)).map((i) => i.id)).toEqual([
      earlier,
      later,
    ]);
    expect(await images.findById(later)).toMatchObject({
      entityId,
      entityType: 'plant',
      url: 'http://h/2.webp',
    });

    await images.update(later, { uploadDate: 50 });
    expect((await images.findByEntity('plant', entityId))[0].id).toBe(later);

    await images.delete(later);
    expect(await images.findById(later)).toBeNull();
  });

  it('deletes every image of an entity and returns them', async () => {
    await images.create('substrate', 777, 'http://h/a.webp');
    await images.create('substrate', 777, 'http://h/b.webp');
    const removed = await images.deleteByEntity('substrate', 777);
    expect(removed).toHaveLength(2);
    expect(await images.findByEntity('substrate', 777)).toEqual([]);
  });

  it('defaults the upload date to now', async () => {
    const id = await images.create('component', 9, 'http://h/c.webp');
    expect((await images.findById(id))!.date).toBeGreaterThan(1_700_000_000);
  });
});

describe('SQLiteImageEntityLookup', () => {
  it('resolves owner and visibility per entity type', async () => {
    const lookup = new SQLiteImageEntityLookup();
    const userId = await newUser();
    const substrateId = await substrates.create('S', userId, true);
    const componentId = await components.create('C', 1);

    expect(await lookup.find('substrate', substrateId)).toEqual({
      ownerId: userId,
      isPublic: true,
    });
    expect(await lookup.find('component', componentId)).toEqual({ ownerId: null, isPublic: true });
    expect(await lookup.find('plant', 987654)).toBeNull();
    expect(await lookup.find('component', 987654)).toBeNull();
  });
});

describe('SQLiteSourceHealthRepository', () => {
  it('upserts and reads source health rows', () => {
    const repo = new SQLiteSourceHealthRepository();
    const row = {
      source_key: 'shopA',
      kind: 'sales' as const,
      seller: 'Shop A',
      status: 'ok' as const,
      active_strategy: 'selector' as const,
      last_item_count: 12,
      consecutive_failures: 0,
      last_success_at: '2026-10-08T10:00:00.000Z',
      last_failure_at: null,
      last_error: null,
      updated_at: '2026-10-08T10:00:00.000Z',
    };
    repo.upsert(row);
    repo.upsert({ ...row, status: 'failing', consecutive_failures: 2, last_error: 'boom' });

    expect(repo.findByKey('shopA')).toMatchObject({ status: 'failing', consecutive_failures: 2 });
    expect(repo.findAll().map((r) => r.source_key)).toContain('shopA');
    expect(repo.findByKey('missing')).toBeNull();
  });
});

describe('connection', () => {
  it('enforces foreign keys', () => {
    expect(getSqlite().pragma('foreign_keys', { simple: true })).toBe(1);
  });
});
