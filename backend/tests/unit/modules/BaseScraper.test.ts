/**
 * tests/unit/modules/BaseScraper.test.ts
 *
 * Strategy orchestration: ordering, fallback, validation, caching and the
 * health outcomes reported for each case. No network access.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../../src/modules/sales/infrastructure/HttpFetcher', () => ({
  fetchJson: vi.fn(),
  fetchDocument: vi.fn(),
  fetchHtml: vi.fn(),
}));

import {
  fetchDocument,
  fetchJson,
} from '../../../src/modules/sales/infrastructure/HttpFetcher';
import { BaseScraper } from '../../../src/modules/sales/infrastructure/scrapers/BaseScraper';
import type { ScraperConfig } from '../../../src/modules/sales/infrastructure/scrapers/types';
import type { ScrapeOutcome } from '../../../src/core/scrapeHealth';
import { NodeCacheAdapter } from '../../../src/core/cache';

const fixture = (name: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../fixtures/scrapers', name), 'utf-8');

const COLLECTION_URL = 'https://shop.example/collections/sale';

const themeHtml = fixture('shopify-theme-collection.html');
const productsFeed = JSON.parse(fixture('shopify-products.json'));

const selectors = {
  container: 'product-card',
  oldPrice: '.price del',
  newPrice: '.price ins',
  link: 'a.product-card-title',
  name: 'a.product-card-title',
  img: '.product-primary-image',
};

class TestScraper extends BaseScraper {}

const setup = (config: Partial<ScraperConfig> = {}) => {
  const outcomes: ScrapeOutcome[] = [];
  const scraper = new TestScraper(
    { key: 'shop', seller: 'Shop', baseUrl: COLLECTION_URL, selectors, ...config },
    new NodeCacheAdapter(),
    { record: (o) => outcomes.push(o) },
  );
  return { scraper, outcomes };
};

const serveHtml = (html: string | null, finalUrl = COLLECTION_URL) =>
  vi.mocked(fetchDocument).mockResolvedValue(html === null ? null : { html, finalUrl });

beforeEach(() => {
  vi.mocked(fetchDocument).mockReset();
  vi.mocked(fetchJson).mockReset();
});

describe('BaseScraper strategy order', () => {
  it('uses the first strategy when it yields valid items and reports ok', async () => {
    serveHtml(themeHtml);
    const { scraper, outcomes } = setup();

    const items = await scraper.fetchPage(1);

    expect(items).toHaveLength(2);
    expect(outcomes).toEqual([
      expect.objectContaining({
        key: 'shop', kind: 'sales', strategy: 'selector', usedFallback: false, itemCount: 2, error: null,
      }),
    ]);
  });

  it('prefers the Shopify feed over theme markup when a collection url is configured', async () => {
    vi.mocked(fetchJson).mockResolvedValue(productsFeed);
    const { scraper, outcomes } = setup({ shopifyCollectionUrl: COLLECTION_URL });

    const items = await scraper.fetchPage(1);

    expect(items).toHaveLength(2);
    expect(fetchDocument).not.toHaveBeenCalled();
    expect(outcomes[0]).toMatchObject({ strategy: 'shopifyJson', usedFallback: false });
  });

  it('falls back to the next strategy and reports degraded with the primary failure', async () => {
    vi.mocked(fetchJson).mockResolvedValue(null);
    serveHtml(themeHtml);
    const { scraper, outcomes } = setup({ shopifyCollectionUrl: COLLECTION_URL });

    const items = await scraper.fetchPage(1);

    expect(items).toHaveLength(2);
    expect(outcomes[0]).toMatchObject({ strategy: 'selector', usedFallback: true });
    expect(outcomes[0].error).toContain('shopifyJson: products.json unavailable');
  });

  it('rejects a strategy whose items are mostly incomplete', async () => {
    serveHtml(themeHtml);
    const { scraper, outcomes } = setup({
      selectors: { ...selectors, name: '.renamed-title' },
      strategies: ['selector', 'heuristic'],
    });

    await scraper.fetchPage(1);

    expect(outcomes[0].error).toContain('selector: only 0% of items are complete');
  });

  it('survives broken selectors by using the heuristic strategy', async () => {
    serveHtml(fixture('unknown-theme-cards.html'));
    const { scraper, outcomes } = setup({
      selectors: { ...selectors, container: '.removed-by-redesign' },
    });

    const items = await scraper.fetchPage(1);

    expect(items.map((i) => i.name)).toEqual(['Calathea Stella', 'Ficus Audrey']);
    expect(outcomes[0]).toMatchObject({ strategy: 'heuristic', usedFallback: true });
    expect(outcomes[0].error).toContain('selector: no items found');
  });
});

describe('BaseScraper failure handling', () => {
  it('reports failing and returns no items when every strategy fails', async () => {
    serveHtml(null);
    const { scraper, outcomes } = setup();

    await expect(scraper.fetchPage(1)).resolves.toEqual([]);

    expect(outcomes[0]).toMatchObject({ strategy: null, usedFallback: false, itemCount: 0 });
    expect(outcomes[0].error).toContain('selector: No HTML returned');
  });

  it('treats an empty Shopify feed as a valid, empty sale', async () => {
    vi.mocked(fetchJson).mockResolvedValue({ products: [] });
    const { scraper, outcomes } = setup({ shopifyCollectionUrl: COLLECTION_URL });

    await expect(scraper.fetchPage(1)).resolves.toEqual([]);

    expect(outcomes[0]).toMatchObject({ strategy: 'shopifyJson', itemCount: 0 });
  });

  it('treats an empty HTML page 1 as a failure, since it is indistinguishable from broken markup', async () => {
    serveHtml('<html><body></body></html>');
    const { scraper, outcomes } = setup();

    await scraper.fetchPage(1);

    expect(outcomes[0].strategy).toBeNull();
  });

  it('accepts an empty later page and only reports page 1', async () => {
    serveHtml('<html><body></body></html>');
    const { scraper, outcomes } = setup();

    await expect(scraper.fetchPage(2)).resolves.toEqual([]);

    expect(outcomes).toHaveLength(0);
  });
});

describe('BaseScraper Shopify detection', () => {
  const unusableSelectors = { ...selectors, container: '.removed-by-redesign' };

  it('uses the products feed of the redirected collection when the storefront is Shopify', async () => {
    serveHtml('<html><link href="https://cdn.shopify.com/x.css"><body></body></html>', 'https://shop.example/collections/sale?page=1');
    vi.mocked(fetchJson).mockResolvedValue(productsFeed);
    const { scraper, outcomes } = setup({
      selectors: unusableSelectors,
      strategies: ['selector'],
    });

    const items = await scraper.fetchPage(1);

    expect(items).toHaveLength(2);
    expect(fetchJson).toHaveBeenCalledWith(
      'https://shop.example/collections/sale/products.json?limit=250&page=1',
    );
    expect(outcomes[0]).toMatchObject({ strategy: 'shopifyJson', usedFallback: true });
  });

  it('does not probe the feed for storefronts without Shopify markers', async () => {
    serveHtml('<html><body></body></html>');
    const { scraper } = setup({ selectors: unusableSelectors, strategies: ['selector'] });

    await scraper.fetchPage(1);

    expect(fetchJson).not.toHaveBeenCalled();
  });
});

describe('BaseScraper caching', () => {
  it('serves cached items without fetching or reporting again', async () => {
    serveHtml(themeHtml);
    const { scraper, outcomes } = setup();

    await scraper.fetchPage(1);
    await scraper.fetchPage(1);

    expect(fetchDocument).toHaveBeenCalledTimes(1);
    expect(outcomes).toHaveLength(1);
  });

  it('bypasses the cache when asked, e.g. for an admin re-check', async () => {
    serveHtml(themeHtml);
    const { scraper, outcomes } = setup();

    await scraper.fetchPage(1);
    await scraper.fetchPage(1, { bypassCache: true });

    expect(fetchDocument).toHaveBeenCalledTimes(2);
    expect(outcomes).toHaveLength(2);
  });

  it('does not cache empty results', async () => {
    serveHtml('<html><body></body></html>');
    const { scraper } = setup();

    await scraper.fetchPage(2);
    await scraper.fetchPage(2);

    expect(fetchDocument).toHaveBeenCalledTimes(2);
  });
});
