import { describe, it, expect } from 'vitest';

import { loadConfig } from '../../../src/core/config/env';

const base = { JWT_SECRET: 's', JWT_REFRESH_SECRET: 'r' };
const load = (extra: Record<string, string> = {}) => loadConfig({ ...base, ...extra });

describe('loadConfig defaults', () => {
  it('uses the documented defaults when nothing is set', () => {
    const config = load();
    expect(config.trustProxyHops).toBe(1);
    expect(config.sales).toEqual({
      refreshEnabled: true,
      refreshIntervalMin: 120,
      refreshWarmDelayMs: 5000,
      retentionDays: 30,
      pricePointsMax: 30,
    });
    expect(config.imageBackfillOnStart).toBe(false);
    expect(config.uploadMaxPixels).toBe(40_000_000);
  });

  it('treats blank values as unset', () => {
    expect(load({ SALES_RETENTION_DAYS: '  ' }).sales.retentionDays).toBe(30);
  });
});

describe('integer parsing', () => {
  it('accepts plain decimal integers at the bounds', () => {
    expect(load({ TRUST_PROXY_HOPS: '0' }).trustProxyHops).toBe(0);
    expect(load({ TRUST_PROXY_HOPS: '10' }).trustProxyHops).toBe(10);
    expect(load({ SALES_REFRESH_INTERVAL_MIN: ' 10080 ' }).sales.refreshIntervalMin).toBe(10_080);
    expect(load({ SALES_REFRESH_WARM_DELAY_MS: '600000' }).sales.refreshWarmDelayMs).toBe(600_000);
    expect(load({ SALES_RETENTION_DAYS: '3650' }).sales.retentionDays).toBe(3650);
    expect(load({ SALES_PRICE_POINTS_MAX: '1000' }).sales.pricePointsMax).toBe(1000);
    expect(load({ UPLOAD_MAX_PIXELS: '400000000' }).uploadMaxPixels).toBe(400_000_000);
  });

  it.each(['abc', '1e3', '0x10', '0b1', '0o7', '-1', '+1', '1.5', '1_000', 'Infinity'])(
    'rejects the non-decimal form "%s"',
    (value) => {
      expect(() => load({ SALES_REFRESH_INTERVAL_MIN: value })).toThrow(
        /SALES_REFRESH_INTERVAL_MIN must be a plain integer/,
      );
    },
  );

  it('rejects values below the minimum', () => {
    expect(() => load({ SALES_REFRESH_INTERVAL_MIN: '0' })).toThrow(/between 1 and 10080/);
    expect(() => load({ SALES_RETENTION_DAYS: '0' })).toThrow(/SALES_RETENTION_DAYS/);
    expect(() => load({ SALES_PRICE_POINTS_MAX: '0' })).toThrow(/SALES_PRICE_POINTS_MAX/);
    expect(() => load({ UPLOAD_MAX_PIXELS: '0' })).toThrow(/UPLOAD_MAX_PIXELS/);
  });

  it('rejects values above the maximum so no timer can overflow', () => {
    expect(() => load({ TRUST_PROXY_HOPS: '11' })).toThrow(/TRUST_PROXY_HOPS.*between 0 and 10/);
    expect(() => load({ SALES_REFRESH_INTERVAL_MIN: '10081' })).toThrow(
      /SALES_REFRESH_INTERVAL_MIN/,
    );
    expect(() => load({ SALES_REFRESH_INTERVAL_MIN: '99999999999' })).toThrow(
      /SALES_REFRESH_INTERVAL_MIN/,
    );
    expect(() => load({ SALES_REFRESH_WARM_DELAY_MS: '600001' })).toThrow(
      /SALES_REFRESH_WARM_DELAY_MS/,
    );
    expect(() => load({ SALES_RETENTION_DAYS: '3651' })).toThrow(/SALES_RETENTION_DAYS/);
    expect(() => load({ SALES_PRICE_POINTS_MAX: '1001' })).toThrow(/SALES_PRICE_POINTS_MAX/);
    expect(() => load({ UPLOAD_MAX_PIXELS: '400000001' })).toThrow(/UPLOAD_MAX_PIXELS/);
  });
});

describe('boolean parsing', () => {
  it.each([
    ['true', true],
    ['TRUE', true],
    ['1', true],
    [' True ', true],
    ['false', false],
    ['False', false],
    ['0', false],
  ])('accepts "%s"', (value, expected) => {
    expect(load({ SALES_REFRESH_ENABLED: value }).sales.refreshEnabled).toBe(expected);
    expect(load({ IMAGE_BACKFILL_ON_START: value }).imageBackfillOnStart).toBe(expected);
  });

  it.each(['yes', 'no', 'on', '2', 'tru', 'enabled'])('rejects "%s"', (value) => {
    expect(() => load({ SALES_REFRESH_ENABLED: value })).toThrow(
      /SALES_REFRESH_ENABLED must be true, false, 1 or 0/,
    );
    expect(() => load({ IMAGE_BACKFILL_ON_START: value })).toThrow(/IMAGE_BACKFILL_ON_START/);
  });
});
