/**
 * tests/unit/modules/sales.test.ts
 *
 * Tests for Sale entity, scrape helpers, and FetchSalesOverview use case.
 */

import { describe, it, expect, vi } from 'vitest';
import { Sale } from '../../../src-v2/modules/sales/domain/Sale';
import { parsePrice, commercialRound, resolveLink, buildPageUrl } from '../../../src-v2/modules/sales/infrastructure/scrapeHelpers';
import { FetchSalesOverview } from '../../../src-v2/modules/sales/application/FetchSalesOverview';
import type { SalesSource } from '../../../src-v2/modules/sales/domain/SalesSource';

// ── Sale entity ───────────────────────────────────────────────────────────────

describe('Sale.fromRaw', () => {
  const seller = 'TestShop';

  it('creates a Sale from valid raw data', () => {
    const sale = Sale.fromRaw({ name: 'Monstera', link: 'https://shop.com/monstera', newPrice: 9.99, oldPrice: 19.99 }, seller);
    expect(sale).not.toBeNull();
    expect(sale!.sale_name).toBe('Monstera');
    expect(sale!.sale_seller).toBe(seller);
    expect(sale!.sale_new_price).toBe(9.99);
  });

  it('returns null when link is missing', () => {
    expect(Sale.fromRaw({ name: 'x', newPrice: 5 }, seller)).toBeNull();
  });

  it('returns null when newPrice is missing', () => {
    expect(Sale.fromRaw({ name: 'x', link: 'https://shop.com' }, seller)).toBeNull();
  });

  it('generates a deterministic sale_id from seller + link', () => {
    const a = Sale.fromRaw({ link: 'https://shop.com/p1', newPrice: 5 }, seller);
    const b = Sale.fromRaw({ link: 'https://shop.com/p1', newPrice: 5 }, seller);
    expect(a!.sale_id).toBe(b!.sale_id);
  });

  it('normalizes URLs for ID generation (strips www, trailing slash, hash)', () => {
    const a = Sale.fromRaw({ link: 'https://www.shop.com/p', newPrice: 5 }, seller);
    const b = Sale.fromRaw({ link: 'https://shop.com/p', newPrice: 5 }, seller);
    expect(a!.sale_id).toBe(b!.sale_id);
  });

  it('uses "Unnamed Product" as fallback name', () => {
    const sale = Sale.fromRaw({ link: 'https://shop.com', newPrice: 5, name: null }, seller);
    expect(sale!.sale_name).toBe('Unnamed Product');
  });

  it('toJSON round-trips correctly', () => {
    const sale = Sale.fromRaw({ link: 'https://shop.com', newPrice: 5, oldPrice: 10, name: 'Fern' }, seller)!;
    const json = sale.toJSON();
    expect(json.sale_name).toBe('Fern');
    expect(json.sale_old_price).toBe(10);
    expect(json.sale_new_price).toBe(5);
  });
});

// ── parsePrice ────────────────────────────────────────────────────────────────

describe('parsePrice', () => {
  it('parses German price format (comma as decimal)', () => {
    expect(parsePrice('9,99 €')).toBe(9.99);
  });

  it('parses English price format (period as decimal)', () => {
    expect(parsePrice('9.99')).toBe(9.99);
  });

  it('handles thousand separators', () => {
    expect(parsePrice('1.299,00')).toBe(1299);
  });

  it('strips currency symbols', () => {
    expect(parsePrice('€ 12,50')).toBe(12.5);
  });

  it('returns null for empty input', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice(null)).toBeNull();
  });

  it('returns null for non-numeric string', () => {
    expect(parsePrice('sold out')).toBeNull();
  });
});

// ── commercialRound ───────────────────────────────────────────────────────────

describe('commercialRound', () => {
  it('rounds to 2 decimal places', () => {
    expect(commercialRound(9.999)).toBe(10);
    expect(commercialRound(9.994)).toBe(9.99);
  });

  it('returns null for null input', () => {
    expect(commercialRound(null)).toBeNull();
  });
});

// ── resolveLink ───────────────────────────────────────────────────────────────

describe('resolveLink', () => {
  it('returns absolute URLs unchanged', () => {
    expect(resolveLink('https://shop.com/p', 'https://base.com')).toBe('https://shop.com/p');
  });

  it('resolves protocol-relative links', () => {
    expect(resolveLink('//shop.com/p', 'https://base.com')).toBe('https://shop.com/p');
  });

  it('resolves root-relative paths against base', () => {
    expect(resolveLink('/products/p1', 'https://shop.com')).toBe('https://shop.com/products/p1');
  });

  it('returns null for empty href', () => {
    expect(resolveLink(null, 'https://shop.com')).toBeNull();
    expect(resolveLink('', 'https://shop.com')).toBeNull();
  });
});

// ── buildPageUrl ──────────────────────────────────────────────────────────────

describe('buildPageUrl', () => {
  it('returns base URL for page 1', () => {
    expect(buildPageUrl('https://shop.com/sale', 1, '?page={{page}}')).toBe('https://shop.com/sale');
  });

  it('appends query pattern', () => {
    expect(buildPageUrl('https://shop.com/sale', 2, '?page={{page}}')).toBe('https://shop.com/sale?page=2');
  });

  it('appends to existing query string', () => {
    expect(buildPageUrl('https://shop.com/sale?sort=asc', 2, '&page={{page}}')).toBe('https://shop.com/sale?sort=asc&page=2');
  });

  it('appends path pattern', () => {
    expect(buildPageUrl('https://shop.com/sale', 2, 'page/{{page}}/')).toBe('https://shop.com/sale/page/2/');
  });

  it('uses explicit urlTemplate over pagePattern', () => {
    expect(buildPageUrl('https://shop.com', 3, '?p={{page}}', 'https://other.com/page/{{page}}')).toBe('https://other.com/page/3');
  });
});

// ── FetchSalesOverview ────────────────────────────────────────────────────────

describe('FetchSalesOverview', () => {
  const makeMockSource = (key: string, items: object[] = []): SalesSource => ({
    key,
    seller: key,
    priority: 1,
    maxPages: 1,
    useChromium: false,
    fetchPage: vi.fn().mockResolvedValue(items),
  });

  it('streams deduplicated items via onItems', async () => {
    const items = [
      { name: 'P1', link: 'https://shop.com/p1', newPrice: 5, oldPrice: 10 },
      { name: 'P2', link: 'https://shop.com/p2', newPrice: 8, oldPrice: 15 },
    ];
    const source = makeMockSource('shop', items);
    const onItems = vi.fn().mockResolvedValue(undefined);

    await new FetchSalesOverview([source]).execute({ onItems, isAborted: () => false });

    expect(onItems).toHaveBeenCalled();
    const sentItems = onItems.mock.calls.flatMap((c) => c[0]);
    expect(sentItems).toHaveLength(2);
  });

  it('deduplicates items with same link across calls', async () => {
    const dup = { name: 'P1', link: 'https://shop.com/p1', newPrice: 5, oldPrice: 10 };
    const source = makeMockSource('shop', [dup, dup]);
    const onItems = vi.fn().mockResolvedValue(undefined);

    await new FetchSalesOverview([source]).execute({ onItems, isAborted: () => false });

    const sentItems = onItems.mock.calls.flatMap((c) => c[0]);
    expect(sentItems).toHaveLength(1);
  });

  it('skips items without valid link or price', async () => {
    const items = [
      { name: 'Bad', link: null, newPrice: 5, oldPrice: 10 },
      { name: 'Also bad', link: 'https://shop.com', newPrice: null, oldPrice: 10 },
    ];
    const source = makeMockSource('shop', items);
    const onItems = vi.fn().mockResolvedValue(undefined);

    await new FetchSalesOverview([source]).execute({ onItems, isAborted: () => false });

    expect(onItems).not.toHaveBeenCalled();
  });

  it('aborts when isAborted returns true', async () => {
    const source = makeMockSource('shop', [{ name: 'P', link: 'https://x.com', newPrice: 5, oldPrice: 10 }]);
    const onItems = vi.fn().mockResolvedValue(undefined);

    await new FetchSalesOverview([source]).execute({ onItems, isAborted: () => true });

    expect(onItems).not.toHaveBeenCalled();
  });

  it('continues other sources when one fails', async () => {
    const failingSource = makeMockSource('failing');
    (failingSource.fetchPage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    const goodItems = [{ name: 'P', link: 'https://good.com/p', newPrice: 5, oldPrice: 10 }];
    const goodSource = makeMockSource('good', goodItems);
    const onItems = vi.fn().mockResolvedValue(undefined);

    await new FetchSalesOverview([failingSource, goodSource]).execute({ onItems, isAborted: () => false });

    const sent = onItems.mock.calls.flatMap((c) => c[0]);
    expect(sent.some((i) => i.sale_seller === 'good')).toBe(true);
  });
});
