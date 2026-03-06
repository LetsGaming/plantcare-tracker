/**
 * tests/unit/core/utils.test.ts
 *
 * Tests for shared utility functions.
 */

import { describe, it, expect } from 'vitest';
import { formatToDBDate, ensureArray, filterDuplicatesById } from '../../../src/core/utils';

describe('formatToDBDate', () => {
  it('formats a timestamp number to MySQL datetime string', () => {
    const ts = new Date('2024-06-15T10:30:00.000Z').getTime();
    expect(formatToDBDate(ts)).toBe('2024-06-15 10:30:00');
  });

  it('formats a Date object', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    expect(formatToDBDate(date)).toBe('2024-01-01 00:00:00');
  });

  it('formats an ISO string', () => {
    expect(formatToDBDate('2024-12-31T23:59:59.000Z')).toBe('2024-12-31 23:59:59');
  });

  it('pads single-digit months and days', () => {
    const date = new Date('2024-03-05T08:05:07.000Z');
    expect(formatToDBDate(date)).toBe('2024-03-05 08:05:07');
  });
});

describe('ensureArray', () => {
  it('returns arrays unchanged', () => {
    expect(ensureArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('wraps a single value in an array', () => {
    expect(ensureArray('hello')).toEqual(['hello']);
  });

  it('returns empty array for null', () => {
    expect(ensureArray(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(ensureArray(undefined)).toEqual([]);
  });

  it('converts a Set to array', () => {
    const result = ensureArray(new Set([1, 2, 3]));
    expect(result).toEqual([1, 2, 3]);
  });

  it('converts object values to array', () => {
    const result = ensureArray({ a: 1, b: 2 });
    expect(result).toEqual([1, 2]);
  });
});

describe('filterDuplicatesById', () => {
  it('removes duplicate items by key', () => {
    const items = [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 1, name: 'a-duplicate' },
    ];
    const result = filterDuplicatesById(items, 'id');
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('a');
  });

  it('returns all items when no duplicates', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(filterDuplicatesById(items, 'id')).toHaveLength(3);
  });

  it('returns empty array for empty input', () => {
    expect(filterDuplicatesById([], 'id')).toEqual([]);
  });

  it('preserves first occurrence over subsequent duplicates', () => {
    const items = [
      { id: 1, value: 'first' },
      { id: 1, value: 'second' },
    ];
    expect(filterDuplicatesById(items, 'id')[0].value).toBe('first');
  });
});
