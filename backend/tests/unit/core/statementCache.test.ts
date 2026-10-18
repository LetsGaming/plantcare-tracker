import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { Kysely, sql } from 'kysely';
import { createCachedSqliteDialect } from '../../../src/core/database/cachedSqliteDialect';
import type { CachedSqliteDatabase } from '../../../src/core/database/cachedSqliteDialect';

interface TestDb {
  item: { id: number; name: string };
}

describe('prepared statement cache', () => {
  let raw: BetterSqlite3.Database;
  let db: Kysely<TestDb>;
  let statements: CachedSqliteDatabase;
  let prepare: ReturnType<typeof vi.spyOn>;

  const build = (capacity?: number): void => {
    const created = createCachedSqliteDialect(raw, capacity);
    statements = created.statements;
    db = new Kysely<TestDb>({ dialect: created.dialect });
  };

  const prepared = (text: string): number =>
    prepare.mock.calls.filter((call: unknown[]) => call[0] === text).length;

  beforeEach(() => {
    raw = new BetterSqlite3(':memory:');
    raw.exec('CREATE TABLE item (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    prepare = vi.spyOn(raw, 'prepare');
    build();
  });

  afterEach(async () => {
    if (raw.open) await db.destroy();
  });

  it('prepares the same SQL once across calls with different parameters', async () => {
    for (let i = 1; i <= 5; i++) {
      await db.selectFrom('item').selectAll().where('id', '=', i).execute();
    }
    expect(prepared('select * from "item" where "id" = ?')).toBe(1);
    expect(statements.size).toBe(1);
  });

  it('keeps reads and writes correct while statements are reused', async () => {
    for (let i = 1; i <= 3; i++) {
      await db
        .insertInto('item')
        .values({ id: i, name: `n${i}` })
        .execute();
    }
    await db.updateTable('item').set({ name: 'changed' }).where('id', '=', 2).execute();
    const rows = await db.selectFrom('item').selectAll().orderBy('id').execute();
    expect(rows.map((r) => r.name)).toEqual(['n1', 'changed', 'n3']);

    const result = await db.deleteFrom('item').where('id', '=', 1).executeTakeFirst();
    expect(result.numDeletedRows).toBe(1n);
    expect(await db.selectFrom('item').select('id').execute()).toHaveLength(2);
    expect(prepared('insert into "item" ("id", "name") values (?, ?)')).toBe(1);
  });

  it('evicts the least recently used statement at capacity', async () => {
    build(2);
    const byId = (id: number) => db.selectFrom('item').select('id').where('id', '=', id).execute();
    const byName = () => db.selectFrom('item').select('name').where('id', '=', 1).execute();
    const both = () => db.selectFrom('item').select(['id', 'name']).where('id', '=', 1).execute();

    await byId(1);
    await byName();
    await byId(2);
    await both();
    expect(statements.size).toBe(2);

    await byId(3);
    await byName();
    expect(prepared('select "id" from "item" where "id" = ?')).toBe(1);
    expect(prepared('select "name" from "item" where "id" = ?')).toBe(2);
    expect(prepared('select "id", "name" from "item" where "id" = ?')).toBe(1);
  });

  it('does not cache DDL, pragma or transaction statements', async () => {
    await sql`create table extra (id integer)`.execute(db);
    await sql`pragma user_version = 3`.execute(db);
    await sql`begin`.execute(db);
    await sql`commit`.execute(db);
    expect(statements.size).toBe(0);
  });

  it('keeps cached statements working after a schema change', async () => {
    await db.insertInto('item').values({ id: 1, name: 'a' }).execute();
    await db.selectFrom('item').selectAll().execute();
    raw.exec('ALTER TABLE item ADD COLUMN extra TEXT');
    const rows = await db.selectFrom('item').selectAll().execute();
    expect(rows).toEqual([{ id: 1, name: 'a', extra: null }]);
  });

  it('commits and rolls back transactions with reused statements', async () => {
    await db.transaction().execute(async (trx) => {
      await trx.insertInto('item').values({ id: 1, name: 'x' }).execute();
    });
    await expect(
      db.transaction().execute(async (trx) => {
        await trx.insertInto('item').values({ id: 2, name: 'x' }).execute();
        await trx.insertInto('item').values({ id: 1, name: 'dup' }).execute();
      }),
    ).rejects.toThrow();
    expect(await db.selectFrom('item').select('id').execute()).toEqual([{ id: 1 }]);
  });

  it('streams the same SQL repeatedly, including after an abandoned stream', async () => {
    for (let i = 1; i <= 3; i++) {
      await db
        .insertInto('item')
        .values({ id: i, name: `n${i}` })
        .execute();
    }
    const stream = () => db.selectFrom('item').select('id').orderBy('id').stream();

    const abandoned = stream()[Symbol.asyncIterator]();
    expect((await abandoned.next()).value).toEqual({ id: 1 });
    await abandoned.return?.();

    const ids: number[] = [];
    for await (const row of stream()) ids.push(row.id);
    expect(ids).toEqual([1, 2, 3]);
    expect(await db.selectFrom('item').select('id').execute()).toHaveLength(3);
  });

  it('clears the cache on destroy', async () => {
    await db.selectFrom('item').selectAll().execute();
    expect(statements.size).toBe(1);
    await db.destroy();
    expect(statements.size).toBe(0);
    expect(raw.open).toBe(false);
  });
});
