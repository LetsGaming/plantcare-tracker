/**
 * tests/unit/modules/sales.test.ts
 *
 * Tests for the Sale entity, scrape helpers, the sales replay and SSE framing.
 */

import type { ServerResponse } from 'node:http';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { parse } from 'node-html-parser';
import { Sale, type SaleRow } from '../../../src/modules/sales/domain/Sale';
import {
  parsePrice,
  commercialRound,
  resolveLink,
  buildPageUrl,
  normalizeImageUrl,
  extractImageUrl,
} from '../../../src/modules/sales/infrastructure/scrapeHelpers';
import {
  REPLAY_PAGE_SIZE,
  replayActiveSales,
} from '../../../src/modules/sales/presentation/salesController';
import type { SalesRepository } from '../../../src/modules/sales/domain/SalesRepository';
import { SALES_CURSOR_TYPES, SALES_SORT } from '../../../src/modules/sales/domain/SalesRepository';
import { decodeCursor, encodeCursor } from '../../../src/core/pagination';
import { SseManager } from '../../../src/core/sse';

const SCRAPED_AT = 1_700_000_000_000;

// ── Sale entity ───────────────────────────────────────────────────────────────

describe('Sale.fromRaw', () => {
  const seller = 'TestShop';

  it('creates a Sale from valid raw data', () => {
    const sale = Sale.fromRaw(
      { name: 'Monstera', link: 'https://shop.com/monstera', newPrice: 9.99, oldPrice: 19.99 },
      seller,
      SCRAPED_AT,
    );
    expect(sale).not.toBeNull();
    expect(sale!.sale_name).toBe('Monstera');
    expect(sale!.sale_seller).toBe(seller);
    expect(sale!.sale_new_price).toBe(9.99);
  });

  it('returns null when link is missing', () => {
    expect(Sale.fromRaw({ name: 'x', newPrice: 5 }, seller, SCRAPED_AT)).toBeNull();
  });

  it('returns null when newPrice is missing', () => {
    expect(Sale.fromRaw({ name: 'x', link: 'https://shop.com' }, seller, SCRAPED_AT)).toBeNull();
  });

  it('generates a deterministic sale_id from seller + link', () => {
    const a = Sale.fromRaw({ link: 'https://shop.com/p1', newPrice: 5 }, seller, SCRAPED_AT);
    const b = Sale.fromRaw({ link: 'https://shop.com/p1', newPrice: 5 }, seller, SCRAPED_AT);
    expect(a!.sale_id).toBe(b!.sale_id);
  });

  it('normalizes URLs for ID generation (strips www, trailing slash, hash)', () => {
    const a = Sale.fromRaw({ link: 'https://www.shop.com/p', newPrice: 5 }, seller, SCRAPED_AT);
    const b = Sale.fromRaw({ link: 'https://shop.com/p', newPrice: 5 }, seller, SCRAPED_AT);
    expect(a!.sale_id).toBe(b!.sale_id);
  });

  it('gives one Shopify product the same id under every path it is served from', () => {
    const paths = [
      'https://shop.com/products/monstera',
      'https://shop.com/collections/sale/products/monstera?variant=1',
      'https://www.shop.com/de/products/monstera/',
      'https://shop.com/de/collections/sale/products/monstera#reviews',
    ];
    const ids = paths.map(
      (link) => Sale.fromRaw({ link, newPrice: 5 }, seller, SCRAPED_AT)!.sale_id,
    );
    expect(new Set(ids).size).toBe(1);
  });

  it('keeps different products distinct', () => {
    const a = Sale.fromRaw(
      { link: 'https://shop.com/products/monstera', newPrice: 5 },
      seller,
      SCRAPED_AT,
    )!;
    const b = Sale.fromRaw(
      { link: 'https://shop.com/products/pilea', newPrice: 5 },
      seller,
      SCRAPED_AT,
    )!;
    expect(a.sale_id).not.toBe(b.sale_id);
  });

  it('uses "Unnamed Product" as fallback name', () => {
    const sale = Sale.fromRaw(
      { link: 'https://shop.com', newPrice: 5, name: null },
      seller,
      SCRAPED_AT,
    );
    expect(sale!.sale_name).toBe('Unnamed Product');
  });

  it('stamps the given fetch time instead of the call time', () => {
    const fetchedAt = 1_700_000_000_000;
    const sale = Sale.fromRaw({ link: 'https://shop.com/p', newPrice: 5 }, seller, fetchedAt)!;
    expect(sale.sale_scraped_at).toBe(fetchedAt);
  });

  it('rejects prices that are not finite non-negative numbers', () => {
    const fromPrices = (newPrice: number, oldPrice?: number | null) =>
      Sale.fromRaw({ link: 'https://shop.com/p', newPrice, oldPrice }, seller, SCRAPED_AT);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN, -1, 0]) {
      expect(fromPrices(bad), `new ${bad}`).toBeNull();
    }
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, -5]) {
      expect(fromPrices(5, bad), `old ${bad}`).toBeNull();
    }
    expect(fromPrices(5, 0)!.sale_old_price).toBe(0);
    expect(fromPrices(5, null)!.sale_old_price).toBeNull();
  });

  it('computes an integer discount percent, null without an old price', () => {
    const pct = (newPrice: number, oldPrice?: number | null) =>
      Sale.fromRaw({ link: 'https://shop.com/p', newPrice, oldPrice }, seller, 1)!
        .sale_discount_pct;
    expect(pct(9.99, 19.99)).toBe(50);
    expect(pct(7, 10)).toBe(30);
    expect(pct(5)).toBeNull();
    expect(pct(5, null)).toBeNull();
    expect(pct(12, 10)).toBe(0);
  });
});

describe('Sale.toDto', () => {
  it('maps a stored row to the API shape in epoch milliseconds', () => {
    expect(
      Sale.toDto({
        sale_id: 'abc',
        source_key: 'shop',
        seller: 'Shop',
        name: 'Fern',
        link: 'https://shop.com/fern',
        image_url: null,
        old_price: 10,
        new_price: 7,
        discount_pct: 30,
        first_seen_at: 1_000,
        last_seen_at: 3_000,
        scraped_at: 2_500,
        active: 1,
      }),
    ).toEqual({
      sale_id: 'abc',
      sale_name: 'Fern',
      sale_seller: 'Shop',
      sale_link: 'https://shop.com/fern',
      sale_image_url: null,
      sale_old_price: 10,
      sale_new_price: 7,
      sale_discount_pct: 30,
      sale_first_seen_at: 1_000,
      sale_scraped_at: 2_500,
    });
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
    expect(buildPageUrl('https://shop.com/sale', 1, '?page={{page}}')).toBe(
      'https://shop.com/sale',
    );
  });

  it('appends query pattern', () => {
    expect(buildPageUrl('https://shop.com/sale', 2, '?page={{page}}')).toBe(
      'https://shop.com/sale?page=2',
    );
  });

  it('appends to existing query string', () => {
    expect(buildPageUrl('https://shop.com/sale?sort=asc', 2, '&page={{page}}')).toBe(
      'https://shop.com/sale?sort=asc&page=2',
    );
  });

  it('appends path pattern', () => {
    expect(buildPageUrl('https://shop.com/sale', 2, 'page/{{page}}/')).toBe(
      'https://shop.com/sale/page/2/',
    );
  });

  it('uses explicit urlTemplate over pagePattern', () => {
    expect(
      buildPageUrl('https://shop.com', 3, '?p={{page}}', 'https://other.com/page/{{page}}'),
    ).toBe('https://other.com/page/3');
  });
});

// ── Sales replay ──────────────────────────────────────────────────────────────

const saleRow = (n: number): SaleRow => ({
  sale_id: `sale-${String(n).padStart(4, '0')}`,
  source_key: 'shop',
  seller: 'Shop',
  name: `Plant ${n}`,
  link: `https://shop.com/p${n}`,
  image_url: null,
  old_price: 10,
  new_price: 5,
  discount_pct: 50,
  first_seen_at: 1_000_000 - n,
  last_seen_at: 2_000_000,
  scraped_at: 1_500_000,
  active: 1,
});

/** A repository whose pageActive serves `rows` in pages, like the keyset query. */
const pagedRepo = (rows: SaleRow[]) => {
  const pageActive = vi.fn(async ({ limit, cursor }: { limit: number; cursor: unknown }) => {
    const start = cursor
      ? rows.findIndex((r) => r.sale_id === (cursor as { id: string }).id) + 1
      : 0;
    const items = rows.slice(start, start + limit);
    const last = items.at(-1);
    const more = start + limit < rows.length;
    return {
      items,
      nextCursor:
        more && last
          ? encodeCursor({ s: SALES_SORT, v: last.first_seen_at, id: last.sale_id })
          : null,
    };
  });
  return { repo: { pageActive } as unknown as SalesRepository, pageActive };
};

describe('replayActiveSales', () => {
  it('sends every page as DTOs in order, resuming from each page cursor', async () => {
    const rows = Array.from({ length: REPLAY_PAGE_SIZE * 2 + 5 }, (_, i) => saleRow(i));
    const { repo, pageActive } = pagedRepo(rows);
    const sendUnique = vi.fn().mockResolvedValue(undefined);

    await replayActiveSales(repo, { sse: { sendUnique }, isAborted: () => false });

    expect(pageActive).toHaveBeenCalledTimes(3);
    expect(pageActive.mock.calls.map((c) => c[0].limit)).toEqual([100, 100, 100]);
    expect(pageActive.mock.calls[0][0].cursor).toBeNull();
    expect(pageActive.mock.calls[1][0].cursor).toEqual(
      decodeCursor(
        encodeCursor({ s: SALES_SORT, v: rows[99].first_seen_at, id: rows[99].sale_id }),
        SALES_SORT,
        SALES_CURSOR_TYPES,
      ),
    );
    const sent = sendUnique.mock.calls.flatMap((c) => c[0]);
    expect(sent.map((s: { sale_id: string }) => s.sale_id)).toEqual(rows.map((r) => r.sale_id));
    expect(sent[0]).toEqual(Sale.toDto(rows[0]));
    expect(sendUnique.mock.calls.every((c) => c[1] === 'sale_id')).toBe(true);
  });

  it('stops reading pages once the client disconnects', async () => {
    const rows = Array.from({ length: REPLAY_PAGE_SIZE * 5 }, (_, i) => saleRow(i));
    const { repo, pageActive } = pagedRepo(rows);
    let aborted = false;
    const sendUnique = vi.fn(async () => {
      aborted = true;
    });

    await replayActiveSales(repo, { sse: { sendUnique }, isAborted: () => aborted });

    expect(pageActive).toHaveBeenCalledTimes(1);
    expect(sendUnique).toHaveBeenCalledTimes(1);
  });

  it('does not send a page that arrives after the client disconnected', async () => {
    const { repo } = pagedRepo([saleRow(1)]);
    let aborted = false;
    (repo.pageActive as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      aborted = true;
      return { items: [saleRow(1)], nextCursor: null };
    });
    const sendUnique = vi.fn();

    await replayActiveSales(repo, { sse: { sendUnique }, isAborted: () => aborted });

    expect(sendUnique).not.toHaveBeenCalled();
  });
});

// ── SSE framing ───────────────────────────────────────────────────────────────

describe('SseManager.sendUnique', () => {
  const fakeResponse = () => {
    const frames: string[] = [];
    const res = {
      writableEnded: false,
      writeHead: vi.fn(),
      write: vi.fn((chunk: string) => {
        frames.push(chunk);
        return true;
      }),
      once: vi.fn(),
      end: vi.fn(),
    };
    return { res: res as unknown as ServerResponse, frames };
  };
  const payloads = (frames: string[]) =>
    frames.filter((f) => f.startsWith('data: ')).map((f) => f.slice('data: '.length, -2));

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serializes each item exactly once and never the whole batch', async () => {
    const { res } = fakeResponse();
    const sse = new SseManager(res, {}, 16_384);
    const items = Array.from({ length: 5 }, (_, i) => ({ sale_id: `s${i}`, name: `Plant ${i}` }));
    const stringify = vi.spyOn(JSON, 'stringify');

    await sse.sendUnique(items, 'sale_id');
    const calls = stringify.mock.calls.map((c) => c[0]);
    stringify.mockRestore();
    sse.dispose();

    for (const item of items) {
      expect(calls.filter((arg) => arg === item)).toHaveLength(1);
    }
    expect(calls.some((arg) => Array.isArray(arg))).toBe(false);
  });

  it('keeps every frame within the chunk size and every item in order', async () => {
    const { res, frames } = fakeResponse();
    const maxChunk = 200;
    const sse = new SseManager(res, {}, maxChunk);
    const items = Array.from({ length: 20 }, (_, i) => ({ sale_id: `s${i}`, name: 'ü'.repeat(i) }));

    await sse.sendUnique(items, 'sale_id');
    await sse.sendUnique(items.slice(0, 3), 'sale_id');
    sse.dispose();

    const sent = payloads(frames);
    expect(sent.length).toBeGreaterThan(1);
    for (const payload of sent) {
      expect(Buffer.byteLength(payload, 'utf8')).toBeLessThanOrEqual(maxChunk);
    }
    expect(sent.flatMap((p) => JSON.parse(p))).toEqual(items);
  });

  it('sends an item larger than the chunk size in a frame of its own', async () => {
    const { res, frames } = fakeResponse();
    const sse = new SseManager(res, {}, 50);
    const big = { sale_id: 'big', name: 'x'.repeat(100) };
    const small = { sale_id: 'small', name: 'y' };

    await sse.sendUnique([small, big, small], 'sale_id');
    sse.dispose();

    expect(payloads(frames).map((p) => JSON.parse(p))).toEqual([[small], [big]]);
  });
});

// ── Image URLs ────────────────────────────────────────────────────────────────

describe('normalizeImageUrl', () => {
  const base = 'https://shop.example/de/sale';

  it('unwraps an optimizer proxy whose options contain commas', () => {
    expect(
      normalizeImageUrl(
        '/cdn-cgi/image/width=3840,quality=80,format=auto/https://webshop.plnts.com/media/a.jpg',
        base,
      ),
    ).toBe('https://webshop.plnts.com/media/a.jpg');
  });

  it('takes the first srcset candidate without splitting on option commas', () => {
    expect(
      normalizeImageUrl(
        '/cdn-cgi/image/width=640,quality=80/https://cdn.example/a.jpg 640w, /cdn-cgi/image/width=1080,quality=80/https://cdn.example/a.jpg 1080w',
        base,
      ),
    ).toBe('https://cdn.example/a.jpg');
    expect(
      normalizeImageUrl('https://cdn.example/s.jpg 1x, https://cdn.example/l.jpg 2x', base),
    ).toBe('https://cdn.example/s.jpg');
  });

  it('resolves protocol-relative and relative urls', () => {
    expect(normalizeImageUrl('//cdn.example/a.jpg', base)).toBe('https://cdn.example/a.jpg');
    expect(normalizeImageUrl('/media/a.jpg', base)).toBe('https://shop.example/media/a.jpg');
    expect(normalizeImageUrl('a.jpg', base)).toBe('https://shop.example/de/a.jpg');
  });

  it('rejects data urls, other schemes and empty values', () => {
    expect(normalizeImageUrl('data:image/png;base64,AAAA', base)).toBeNull();
    expect(normalizeImageUrl('ftp://cdn.example/a.jpg', base)).toBeNull();
    expect(normalizeImageUrl('   ', base)).toBeNull();
    expect(normalizeImageUrl(null, base)).toBeNull();
    expect(normalizeImageUrl(undefined, base)).toBeNull();
  });
});

describe('extractImageUrl', () => {
  const imgOf = (html: string) => parse(html).querySelector('img');

  it('falls through attributes that hold a data url', () => {
    const img = imgOf('<img src="data:image/gif;base64,R0lG" data-src="//cdn.example/a.jpg">');
    expect(extractImageUrl(img, 'https://shop.example')).toBe('https://cdn.example/a.jpg');
  });

  it('returns null without an element or usable attribute', () => {
    expect(extractImageUrl(null, 'https://shop.example')).toBeNull();
    expect(extractImageUrl(imgOf('<img alt="x">'), 'https://shop.example')).toBeNull();
  });
});
