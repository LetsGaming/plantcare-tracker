/**
 * core/pagination/cursor.ts
 *
 * Opaque keyset cursors: base64url JSON of the sort key, the sort column
 * value of the last returned row and that row's id. A cursor only resumes
 * the sort it was issued for.
 */

import { ValidationError } from '../errors';
import { LIST } from '../config/constants';

export type CursorValue = string | number;

export interface Cursor {
  /** Sort key the cursor was issued for. */
  s: string;
  /** Sort column value of the last returned row. */
  v: CursorValue;
  /** Id of the last returned row. */
  id: CursorValue;
}

const isCursorValue = (value: unknown): value is CursorValue =>
  typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));

const invalid = () => new ValidationError('Invalid cursor.', { cursor: 'invalid' });

export const encodeCursor = (cursor: Cursor): string =>
  Buffer.from(JSON.stringify({ s: cursor.s, v: cursor.v, id: cursor.id }), 'utf8').toString(
    'base64url',
  );

export const decodeCursor = (raw: string, sort: string): Cursor => {
  if (!raw || raw.length > LIST.MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw invalid();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw invalid();
  const { s, v, id } = parsed as Record<string, unknown>;
  if (typeof s !== 'string' || !isCursorValue(v) || !isCursorValue(id)) throw invalid();
  if (s !== sort) {
    throw new ValidationError('Cursor was issued for a different sort.', { cursor: 'sort' });
  }
  return { s, v, id };
};
