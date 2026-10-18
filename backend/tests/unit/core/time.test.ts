import { describe, expect, it } from 'vitest';
import { toEpochMillis, toEpochSeconds } from '../../../src/core/utils/time';

describe('toEpochSeconds', () => {
  it('converts an ISO string to epoch seconds', () => {
    expect(toEpochSeconds('2024-06-01T10:00:00.000Z')).toBe(1717236000);
  });

  it('converts a Date', () => {
    expect(toEpochSeconds(new Date(1717236000500))).toBe(1717236000);
  });

  it('treats large numbers as epoch milliseconds', () => {
    expect(toEpochSeconds(1717236000000)).toBe(1717236000);
  });

  it('passes through epoch seconds unchanged', () => {
    expect(toEpochSeconds(1717236000)).toBe(1717236000);
  });

  it('returns null for an unparsable string, an invalid Date and NaN', () => {
    expect(toEpochSeconds('not-a-date')).toBeNull();
    expect(toEpochSeconds(new Date('nope'))).toBeNull();
    expect(toEpochSeconds(NaN)).toBeNull();
  });
});

describe('toEpochMillis', () => {
  it('scales seconds up and keeps milliseconds', () => {
    expect(toEpochMillis(1717236000)).toBe(1717236000000);
    expect(toEpochMillis(1717236000000)).toBe(1717236000000);
  });
});
