/**
 * core/pagination/listQuery.ts
 *
 * Parses the shared list query string (`limit`, `cursor`, `q`, `sort`,
 * `scope`). Out-of-range limits above the maximum are clamped; everything
 * else that is malformed is a ValidationError.
 */

import { sql, type RawBuilder, type SqlBool } from 'kysely';
import { ValidationError } from '../errors';
import { LIST } from '../config/constants';
import { decodeCursor, type Cursor } from './cursor';

export interface ListQueryOptions<S extends string, Sc extends string> {
  sorts: readonly S[];
  defaultSort: S;
  scopes?: readonly Sc[];
  defaultScope?: Sc;
}

export interface ListQuery<S extends string, Sc extends string> {
  limit: number;
  cursor: Cursor | null;
  /** Trimmed search term; null when absent or blank. */
  q: string | null;
  sort: S;
  /** Null when the list has no scopes. */
  scope: Sc | null;
}

const single = (query: Record<string, unknown>, key: string): string | undefined => {
  const value = query[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ValidationError(`Query parameter "${key}" must be given once.`, { [key]: 'invalid' });
  }
  return value;
};

const parseLimit = (raw: string | undefined): number => {
  if (raw === undefined || raw.trim() === '') return LIST.DEFAULT_LIMIT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError('limit must be a positive integer.', { limit: 'invalid' });
  }
  return Math.min(value, LIST.MAX_LIMIT);
};

const parseQ = (raw: string | undefined): string | null => {
  const q = raw?.trim();
  if (!q) return null;
  if (q.length > LIST.MAX_QUERY_LENGTH) {
    throw new ValidationError(`q must be at most ${LIST.MAX_QUERY_LENGTH} characters.`, {
      q: 'too_long',
    });
  }
  return q;
};

const pick = <T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
  key: string,
): T => {
  if (raw === undefined || raw === '') return fallback;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new ValidationError(`${key} must be one of: ${allowed.join(', ')}.`, {
      [key]: 'invalid',
    });
  }
  return raw as T;
};

export const parseListQuery = <S extends string, Sc extends string = never>(
  query: unknown,
  options: ListQueryOptions<S, Sc>,
): ListQuery<S, Sc> => {
  const record = (query ?? {}) as Record<string, unknown>;
  const sort = pick(single(record, 'sort'), options.sorts, options.defaultSort, 'sort');

  let scope: Sc | null = null;
  if (options.scopes?.length) {
    const fallback = options.defaultScope ?? options.scopes[0];
    scope = pick(single(record, 'scope'), options.scopes, fallback, 'scope');
  }

  const rawCursor = single(record, 'cursor');
  return {
    limit: parseLimit(single(record, 'limit')),
    cursor: rawCursor ? decodeCursor(rawCursor, sort) : null,
    q: parseQ(single(record, 'q')),
    sort,
    scope,
  };
};

/** Escapes LIKE wildcards so `q` matches literally; pair with `ESCAPE '\'`. */
export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

/** `column LIKE '%' || q || '%' ESCAPE '\'` with the wildcards in `q` escaped. */
export const containsLike = (column: string, q: string): RawBuilder<SqlBool> =>
  sql<SqlBool>`${sql.ref(column)} LIKE '%' || ${escapeLike(q)} || '%' ESCAPE '\\'`;
