/**
 * core/pagination/keyset.ts
 *
 * Keyset (seek) pagination over any Kysely select. Rows are ordered by
 * (column, id) in one direction and the next page starts strictly after the
 * cursor row, so inserts and deletes between pages never duplicate or skip
 * rows the way OFFSET does. The sort column must be NOT NULL: a NULL breaks
 * the row-value comparison.
 */

import { sql, type SelectQueryBuilder, type SqlBool } from 'kysely';
import { encodeCursor, type Cursor, type CursorValue } from './cursor';

export type SortDirection = 'asc' | 'desc';

export interface KeysetOptions {
  /** Qualified sort column, e.g. `p.created_at`. */
  column: string;
  /** Qualified unique tie breaker, e.g. `p.id`. */
  idColumn: string;
  direction: SortDirection;
  cursor: Cursor | null;
  limit: number;
  /** Compare and order the sort column case-insensitively (text columns). */
  collateNoCase?: boolean;
}

/** Adds the seek predicate, the (column, id) order and LIMIT limit + 1. */
export const applyKeyset = <DB, TB extends keyof DB, O>(
  qb: SelectQueryBuilder<DB, TB, O>,
  options: KeysetOptions,
): SelectQueryBuilder<DB, TB, O> => {
  const column = options.collateNoCase
    ? sql`${sql.ref(options.column)} COLLATE NOCASE`
    : sql`${sql.ref(options.column)}`;
  const id = sql`${sql.ref(options.idColumn)}`;
  const operator = options.direction === 'desc' ? sql.raw('<') : sql.raw('>');

  let query = qb;
  if (options.cursor) {
    query = query.where(
      sql<SqlBool>`(${column}, ${id}) ${operator} (${options.cursor.v}, ${options.cursor.id})`,
    );
  }
  return query
    .orderBy(column, options.direction)
    .orderBy(id, options.direction)
    .limit(options.limit + 1);
};

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ToPageOptions<T> {
  limit: number;
  sort: string;
  /** Sort column value and id of a row, as used in the keyset. */
  key: (row: T) => { v: CursorValue; id: CursorValue };
}

/** Trims the extra probe row and issues the cursor for the next page. */
export const toPage = <T>(rows: T[], options: ToPageOptions<T>): Page<T> => {
  if (rows.length <= options.limit) return { items: rows, nextCursor: null };
  const items = rows.slice(0, options.limit);
  const last = options.key(items[items.length - 1]);
  return { items, nextCursor: encodeCursor({ s: options.sort, v: last.v, id: last.id }) };
};
