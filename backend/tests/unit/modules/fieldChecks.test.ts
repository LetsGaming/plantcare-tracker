/**
 * tests/unit/modules/fieldChecks.test.ts
 *
 * Field-level checks on accepted scrape results, with a fake image probe.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  checkFields,
  ISSUE_THRESHOLD,
  type ImageProbe,
} from '../../../src/modules/sales/infrastructure/scrapers/fieldChecks';
import type { RawSaleItem } from '../../../src/modules/sales/domain/Sale';

const item = (n: number, extra: Partial<RawSaleItem> = {}): RawSaleItem => ({
  name: `Plant ${n}`,
  link: `https://shop.example/products/${n}`,
  img: `https://shop.example/img/${n}.jpg`,
  oldPrice: 20,
  newPrice: 10,
  ...extra,
});

const items = (count: number, extra: (n: number) => Partial<RawSaleItem> = () => ({})) =>
  Array.from({ length: count }, (_, i) => item(i + 1, extra(i + 1)));

const reachable: ImageProbe = async () => true;

describe('checkFields', () => {
  it('uses a threshold of 20 percent', () => {
    expect(ISSUE_THRESHOLD).toBe(0.2);
  });

  it('reports nothing for complete, reachable items', async () => {
    await expect(checkFields(items(10), reachable)).resolves.toEqual([]);
  });

  it('reports nothing for an empty result', async () => {
    const probe = vi.fn();
    await expect(checkFields([], probe)).resolves.toEqual([]);
    expect(probe).not.toHaveBeenCalled();
  });

  it('reports images_missing only above the threshold', async () => {
    const atThreshold = items(10, (n) => (n <= 2 ? { img: null } : {}));
    await expect(checkFields(atThreshold, reachable)).resolves.toEqual([]);

    const above = items(10, (n) => (n <= 3 ? { img: null } : {}));
    await expect(checkFields(above, reachable)).resolves.toEqual([
      { code: 'images_missing', affected: 3, total: 10 },
    ]);
  });

  it('reports old_price_missing and names_missing', async () => {
    const result = await checkFields(
      items(5, (n) => (n <= 2 ? { oldPrice: null, name: '  ' } : {})),
      reachable,
    );
    expect(result).toEqual([
      { code: 'old_price_missing', affected: 2, total: 5 },
      { code: 'names_missing', affected: 2, total: 5 },
    ]);
  });

  it('probes up to two spread-out images and flags them when none loads', async () => {
    const probe = vi.fn<ImageProbe>().mockResolvedValue(false);

    const result = await checkFields(items(9), probe);

    expect(probe.mock.calls.map((c) => c[0])).toEqual([
      'https://shop.example/img/1.jpg',
      'https://shop.example/img/9.jpg',
    ]);
    expect(result).toEqual([{ code: 'images_unreachable', affected: 2, total: 2 }]);
  });

  it('does not flag unreachable images when one sample loads', async () => {
    const probe = vi.fn<ImageProbe>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(checkFields(items(9), probe)).resolves.toEqual([]);
  });

  it('treats a throwing probe as unreachable', async () => {
    const probe: ImageProbe = async () => {
      throw new Error('socket hang up');
    };
    await expect(checkFields(items(1), probe)).resolves.toEqual([
      { code: 'images_unreachable', affected: 1, total: 1 },
    ]);
  });

  it('does not probe when no item has an image', async () => {
    const probe = vi.fn();
    const result = await checkFields(
      items(4, () => ({ img: null })),
      probe,
    );
    expect(probe).not.toHaveBeenCalled();
    expect(result).toEqual([{ code: 'images_missing', affected: 4, total: 4 }]);
  });
});
