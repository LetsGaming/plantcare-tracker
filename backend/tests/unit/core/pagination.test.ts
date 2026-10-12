import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';

import {
  applyKeyset,
  containsLike,
  decodeCursor,
  encodeCursor,
  escapeLike,
  parseListQuery,
  toEnvelope,
  toPage,
  type Cursor,
  type SortDirection,
} from '../../../src/core/pagination';
import { LIST } from '../../../src/core/config/constants';
import { ValidationError } from '../../../src/core/errors';

const SORTS = ['created', 'name'] as const;
const SCOPES = ['mine', 'public'] as const;
const options = {
  sorts: SORTS,
  defaultSort: 'created' as const,
  scopes: SCOPES,
  defaultScope: 'mine' as const,
};

const expect400 = (fn: () => unknown) => {
  let error: unknown;
  try {
    fn();
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(ValidationError);
  expect((error as ValidationError).statusCode).toBe(400);
};

describe('cursor', () => {
  it('round trips sort key, value and id through an opaque base64url string', () => {
    const cursor: Cursor = { s: 'name', v: 'Monstera "Thai" ü', id: 42 };
    const encoded = encodeCursor(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(encoded, 'name')).toEqual(cursor);
    expect(
      decodeCursor(encodeCursor({ s: 'created', v: 1_700_000_000, id: 'sale-1' }), 'created'),
    ).toEqual({
      s: 'created',
      v: 1_700_000_000,
      id: 'sale-1',
    });
  });

  it('rejects malformed and tampered cursors with a 400', () => {
    const valid = encodeCursor({ s: 'created', v: 5, id: 1 });
    expect400(() => decodeCursor('not a cursor!', 'created'));
    expect400(() => decodeCursor(valid.slice(0, -4), 'created'));
    expect400(() => decodeCursor(`x${valid}`, 'created'));
    expect400(() => decodeCursor(Buffer.from('[1,2]').toString('base64url'), 'created'));
    expect400(() =>
      decodeCursor(Buffer.from('{"s":"created","v":null,"id":1}').toString('base64url'), 'created'),
    );
    expect400(() =>
      decodeCursor(Buffer.from('{"s":"created","v":1}').toString('base64url'), 'created'),
    );
    expect400(() => decodeCursor('A'.repeat(LIST.MAX_CURSOR_LENGTH + 1), 'created'));
  });

  it('rejects a cursor issued for another sort', () => {
    expect400(() => decodeCursor(encodeCursor({ s: 'name', v: 'a', id: 1 }), 'created'));
  });

  it('rejects a cursor whose value or id type differs from the declared types', () => {
    const stringValue = encodeCursor({ s: 'created', v: '5', id: 1 });
    const stringId = encodeCursor({ s: 'created', v: 5, id: '1' });
    expect400(() => decodeCursor(stringValue, 'created', { valueType: 'number' }));
    expect400(() => decodeCursor(stringId, 'created', { idType: 'number' }));
    expect400(() =>
      decodeCursor(encodeCursor({ s: 'name', v: 5, id: 1 }), 'name', { valueType: 'string' }),
    );
    expect(decodeCursor(stringValue, 'created', { valueType: 'string', idType: 'number' })).toEqual(
      { s: 'created', v: '5', id: 1 },
    );
  });
});

describe('parseListQuery', () => {
  it('applies defaults', () => {
    expect(parseListQuery({}, options)).toEqual({
      limit: LIST.DEFAULT_LIMIT,
      cursor: null,
      q: null,
      sort: 'created',
      scope: 'mine',
    });
    expect(parseListQuery(undefined, { sorts: SORTS, defaultSort: 'name' })).toMatchObject({
      sort: 'name',
      scope: null,
    });
  });

  it('clamps the limit to the maximum and rejects invalid limits', () => {
    expect(parseListQuery({ limit: '7' }, options).limit).toBe(7);
    expect(parseListQuery({ limit: '1000' }, options).limit).toBe(LIST.MAX_LIMIT);
    expect(parseListQuery({ limit: '' }, options).limit).toBe(LIST.DEFAULT_LIMIT);
    for (const limit of ['0', '-1', '2.5', 'abc'])
      expect400(() => parseListQuery({ limit }, options));
  });

  it('trims q, treats blank as absent and rejects overly long terms', () => {
    expect(parseListQuery({ q: '  fern  ' }, options).q).toBe('fern');
    expect(parseListQuery({ q: '   ' }, options).q).toBeNull();
    expect(
      parseListQuery({ q: `  ${'a'.repeat(LIST.MAX_QUERY_LENGTH)}  ` }, options).q,
    ).toHaveLength(LIST.MAX_QUERY_LENGTH);
    expect400(() => parseListQuery({ q: 'a'.repeat(LIST.MAX_QUERY_LENGTH + 1) }, options));
  });

  it('validates sort, scope and repeated parameters', () => {
    expect(parseListQuery({ sort: 'name', scope: 'public' }, options)).toMatchObject({
      sort: 'name',
      scope: 'public',
    });
    expect400(() => parseListQuery({ sort: 'price' }, options));
    expect400(() => parseListQuery({ scope: 'everyone' }, options));
    expect400(() => parseListQuery({ limit: ['1', '2'] }, options));
  });

  it('decodes the cursor against the requested sort', () => {
    const cursor = encodeCursor({ s: 'name', v: 'b', id: 3 });
    expect(parseListQuery({ sort: 'name', cursor }, options).cursor).toEqual({
      s: 'name',
      v: 'b',
      id: 3,
    });
    expect400(() => parseListQuery({ cursor }, options));
    expect400(() => parseListQuery({ cursor: 'garbage!' }, options));
  });
});

describe('parseListQuery options', () => {
  const typed = {
    sorts: {
      created: { direction: 'desc', valueType: 'number', idType: 'number' },
      name: { direction: 'asc', valueType: 'string', idType: 'number' },
    },
    defaultSort: 'created',
  } as const;

  it('reads the cursor from cursorParam and ignores the default name', () => {
    const cursor = encodeCursor({ s: 'created', v: 5, id: 1 });
    const config = { ...typed, cursorParam: 'before' };
    expect(parseListQuery({ before: cursor }, config).cursor).toEqual({
      s: 'created',
      v: 5,
      id: 1,
    });
    expect(parseListQuery({ cursor }, config).cursor).toBeNull();
    expect400(() => parseListQuery({ before: 'garbage!' }, config));
  });

  it('applies defaultLimit, clamped to the maximum, unless the request gives a limit', () => {
    expect(parseListQuery({}, { ...typed, defaultLimit: 50 }).limit).toBe(50);
    expect(parseListQuery({}, { ...typed, defaultLimit: 5000 }).limit).toBe(LIST.MAX_LIMIT);
    expect(parseListQuery({ limit: '10' }, { ...typed, defaultLimit: 50 }).limit).toBe(10);
  });

  it('rejects cursors whose types contradict the sort declaration', () => {
    const wrongValue = encodeCursor({ s: 'name', v: 5, id: 1 });
    const wrongId = encodeCursor({ s: 'created', v: 5, id: 'x' });
    expect400(() => parseListQuery({ sort: 'name', cursor: wrongValue }, typed));
    expect400(() => parseListQuery({ cursor: wrongId }, typed));
    expect(
      parseListQuery({ cursor: encodeCursor({ s: 'created', v: 5, id: 1 }) }, typed).cursor,
    ).toEqual({ s: 'created', v: 5, id: 1 });
  });

  it('validates sort keys from the record form', () => {
    expect(parseListQuery({ sort: 'name' }, typed).sort).toBe('name');
    expect400(() => parseListQuery({ sort: 'price' }, typed));
  });

  it('accepts numeric query values as a coerced querystring would deliver them', () => {
    expect(parseListQuery({ limit: 7 }, options).limit).toBe(7);
    expect(parseListQuery({ q: 12 }, options).q).toBe('12');
    expect400(() => parseListQuery({ limit: Number.NaN }, options));
    expect400(() => parseListQuery({ limit: true }, options));
  });
});

describe('escapeLike', () => {
  it('escapes %, _ and the escape character itself', () => {
    expect(escapeLike('50%_off\\now')).toBe('50\\%\\_off\\\\now');
    expect(escapeLike('plain')).toBe('plain');
  });
});

describe('envelope', () => {
  it('wraps a page and adds total only when given', () => {
    expect(toEnvelope({ items: [1], nextCursor: 'c' })).toEqual({
      data: { items: [1], next_cursor: 'c' },
    });
    expect(toEnvelope({ items: [], nextCursor: null }, 0)).toEqual({
      data: { items: [], next_cursor: null, total: 0 },
    });
  });
});

// ── Keyset walks against a real SQLite database ──────────────────────────────

interface ItemTable {
  id: number;
  name: string;
  created_at: number;
}
interface TestDb {
  items: ItemTable;
}

let sqlite: BetterSqlite3.Database;
let db: Kysely<TestDb>;

beforeEach(() => {
  sqlite = new BetterSqlite3(':memory:');
  sqlite.exec(
    'CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL)',
  );
  db = new Kysely<TestDb>({ dialect: new SqliteDialect({ database: sqlite }) });
});

afterEach(async () => {
  await db.destroy();
});

const insert = (name: string, createdAt: number): number =>
  Number(
    sqlite.prepare('INSERT INTO items (name, created_at) VALUES (?, ?)').run(name, createdAt)
      .lastInsertRowid,
  );

interface Sort {
  key: string;
  column: 'created_at' | 'name';
  direction: SortDirection;
  collateNoCase?: boolean;
}
const BY_CREATED: Sort = { key: 'created', column: 'created_at', direction: 'desc' };
const BY_NAME: Sort = { key: 'name', column: 'name', direction: 'asc', collateNoCase: true };

const fetchPage = async (sort: Sort, limit: number, cursor: Cursor | null) => {
  const rows = await applyKeyset(db.selectFrom('items as i').selectAll('i'), {
    column: `i.${sort.column}`,
    idColumn: 'i.id',
    direction: sort.direction,
    cursor,
    limit,
    collateNoCase: sort.collateNoCase,
  }).execute();
  expect(rows.length).toBeLessThanOrEqual(limit + 1);
  return toPage(rows, {
    limit,
    sort: sort.key,
    key: (row) => ({ v: row[sort.column], id: row.id }),
  });
};

const walk = async (sort: Sort, limit: number, between?: (page: number) => void) => {
  const seen: number[] = [];
  let cursor: Cursor | null = null;
  for (let page = 0; page < 100; page++) {
    const result = await fetchPage(sort, limit, cursor);
    seen.push(...result.items.map((row) => row.id));
    if (!result.nextCursor) return seen;
    cursor = decodeCursor(result.nextCursor, sort.key);
    between?.(page);
  }
  throw new Error('walk did not terminate');
};

const expectedOrder = (sort: Sort): number[] =>
  (
    sqlite
      .prepare(
        sort.column === 'name'
          ? 'SELECT id FROM items ORDER BY name COLLATE NOCASE ASC, id ASC'
          : 'SELECT id FROM items ORDER BY created_at DESC, id DESC',
      )
      .all() as { id: number }[]
  ).map((row) => row.id);

describe('keyset walk', () => {
  beforeEach(() => {
    // 50 rows over only 5 distinct timestamps: ties must be broken by id.
    for (let i = 0; i < 50; i++) insert(`Plant ${i}`, 1_000 + (i % 5));
  });

  it('returns every row exactly once in created_at DESC, id DESC order with limit 7', async () => {
    const seen = await walk(BY_CREATED, 7);
    expect(seen).toHaveLength(50);
    expect(new Set(seen).size).toBe(50);
    expect(seen).toEqual(expectedOrder(BY_CREATED));
  });

  it('neither skips nor repeats rows when rows are inserted mid-walk', async () => {
    const original = expectedOrder(BY_CREATED);
    let newest = 0;
    let older = 0;
    const seen = await walk(BY_CREATED, 7, (page) => {
      if (page !== 2) return;
      newest = insert('Newest', 9_999);
      older = insert('Older', 1_001);
    });
    expect(new Set(seen).size).toBe(seen.length);
    for (const id of original) expect(seen.filter((x) => x === id)).toHaveLength(1);
    expect(seen).not.toContain(newest);
    expect(seen.filter((x) => x === older)).toHaveLength(1);
  });

  it('pages case-insensitive name ordering with mixed-case duplicates', async () => {
    sqlite.exec('DELETE FROM items');
    const names = [
      'banana',
      'Apple',
      'apple',
      'APPLE',
      'cherry',
      'Banana',
      'date',
      'Cherry',
      'b',
      'B',
      'Zeta',
      'alpha',
    ];
    for (let i = 0; i < 50; i++) insert(names[i % names.length], i);
    const seen = await walk(BY_NAME, 7);
    expect(seen).toHaveLength(50);
    expect(seen).toEqual(expectedOrder(BY_NAME));
    const ordered = seen.map((id) =>
      (
        sqlite.prepare('SELECT name FROM items WHERE id = ?').get(id) as { name: string }
      ).name.toLowerCase(),
    );
    expect(ordered).toEqual([...ordered].sort());
  });

  it('ends with a null cursor and no empty trailing page on an exact multiple', async () => {
    sqlite.exec('DELETE FROM items');
    for (let i = 0; i < 49; i++) insert(`Plant ${i}`, 1_000 + (i % 5));
    const pages: number[] = [];
    let cursor: Cursor | null = null;
    let next: string | null = 'start';
    for (let page = 0; page < 20 && next; page++) {
      const result = await fetchPage(BY_CREATED, 7, cursor);
      pages.push(result.items.length);
      next = result.nextCursor;
      cursor = next ? decodeCursor(next, BY_CREATED.key) : null;
    }
    expect(pages).toEqual([7, 7, 7, 7, 7, 7, 7]);
    expect(next).toBeNull();
  });

  it('asks for exactly limit + 1 rows and reports the last page without a cursor', async () => {
    const page = await fetchPage(BY_CREATED, 100, null);
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).toBeNull();
    const { sql: text } = applyKeyset(db.selectFrom('items as i').selectAll('i'), {
      column: 'i.name',
      idColumn: 'i.id',
      direction: 'asc',
      cursor: { s: 'name', v: 'a', id: 1 },
      limit: 7,
      collateNoCase: true,
    }).compile();
    expect(text).toContain('("i"."name" COLLATE NOCASE, "i"."id") > (?, ?)');
    expect(text).toMatch(/order by "i"\."name" COLLATE NOCASE asc, "i"\."id" asc limit \?$/);
  });
});

describe('containsLike', () => {
  it('matches wildcard characters literally', async () => {
    insert('100% organic', 1);
    insert('100 organic', 2);
    insert('a_b', 3);
    insert('axb', 4);
    insert('back\\slash', 5);
    const names = async (q: string) =>
      (
        await db
          .selectFrom('items')
          .select('name')
          .where(containsLike('name', q))
          .orderBy('id')
          .execute()
      ).map((row) => row.name);
    expect(await names('0%')).toEqual(['100% organic']);
    expect(await names('a_b')).toEqual(['a_b']);
    expect(await names('k\\s')).toEqual(['back\\slash']);
    expect(await names('ORGANIC')).toEqual(['100% organic', '100 organic']);
  });
});
