/**
 * tests/unit/modules/scraperStrategies.test.ts
 *
 * Each extraction strategy against saved markup. No network access.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../../src/modules/sales/infrastructure/HttpFetcher', () => ({
  fetchJson: vi.fn(),
  fetchDocument: vi.fn(),
  fetchHtml: vi.fn(),
  probeImage: vi.fn(),
}));

import { fetchJson } from '../../../src/modules/sales/infrastructure/HttpFetcher';
import { ShopifyJsonStrategy } from '../../../src/modules/sales/infrastructure/scrapers/strategies/ShopifyJsonStrategy';
import { JsonLdStrategy } from '../../../src/modules/sales/infrastructure/scrapers/strategies/JsonLdStrategy';
import { PlntsScraper } from '../../../src/modules/sales/infrastructure/scrapers';
import { NodeCacheAdapter } from '../../../src/core/cache';
import { SelectorStrategy } from '../../../src/modules/sales/infrastructure/scrapers/strategies/SelectorStrategy';
import { HeuristicStrategy } from '../../../src/modules/sales/infrastructure/scrapers/strategies/HeuristicStrategy';
import type {
  ScraperConfig,
  StrategyContext,
} from '../../../src/modules/sales/infrastructure/scrapers/types';

const fixture = (name: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../fixtures/scrapers', name), 'utf-8');

const baseConfig: ScraperConfig = {
  key: 'shop',
  seller: 'Shop',
  baseUrl: 'https://shop.example/collections/sale',
};

const ctxFor = (
  html: string | null,
  overrides: Partial<StrategyContext> & { config?: ScraperConfig } = {},
): StrategyContext => ({
  config: baseConfig,
  page: 1,
  pageUrl: baseConfig.baseUrl,
  loadHtml: async () =>
    html === null ? null : { html, finalUrl: 'https://shop.example/collections/sale' },
  ...overrides,
});

beforeEach(() => {
  vi.mocked(fetchJson).mockReset();
});

// ── ShopifyJsonStrategy ───────────────────────────────────────────────────────

describe('ShopifyJsonStrategy', () => {
  const strategy = new ShopifyJsonStrategy();
  const config = {
    ...baseConfig,
    shopifyCollectionUrl: 'https://shop.example/de/collections/sale',
  };

  it('is only applicable with a collection url', () => {
    expect(strategy.isApplicable(baseConfig)).toBe(false);
    expect(strategy.isApplicable(config)).toBe(true);
  });

  it('requests the paged products feed of the collection', async () => {
    vi.mocked(fetchJson).mockResolvedValue({ products: [] });
    await strategy.extract(ctxFor(null, { config, page: 3 }));
    expect(fetchJson).toHaveBeenCalledWith(
      'https://shop.example/de/collections/sale/products.json?limit=250&page=3',
    );
  });

  it('keeps only available, discounted products and picks the cheapest discounted variant', async () => {
    vi.mocked(fetchJson).mockResolvedValue(JSON.parse(fixture('shopify-products.json')));

    const items = await strategy.extract(ctxFor(null, { config }));

    expect(items).toEqual([
      {
        name: "Alocasia 'Nobilis'",
        link: 'https://shop.example/de/products/alocasia-nobilis',
        img: 'https://cdn.example/nobilis.jpg',
        newPrice: 19.99,
        oldPrice: 29.99,
      },
      {
        name: 'Philodendron Florida Beauty',
        link: 'https://shop.example/de/products/philodendron-sizes',
        img: 'https://cdn.example/florida.jpg',
        newPrice: 59.99,
        oldPrice: 89.99,
      },
    ]);
  });

  it('throws when the feed is unavailable or has an unexpected shape', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce(null);
    await expect(strategy.extract(ctxFor(null, { config }))).rejects.toThrow('products.json');

    vi.mocked(fetchJson).mockResolvedValueOnce({ unexpected: true });
    await expect(strategy.extract(ctxFor(null, { config }))).rejects.toThrow('products.json');
  });

  it('prefers a runtime collection url over the configured one', async () => {
    vi.mocked(fetchJson).mockResolvedValue({ products: [] });
    await strategy.extract(
      ctxFor(null, { config, shopifyCollectionUrl: 'https://other.example/collections/new' }),
    );
    expect(fetchJson).toHaveBeenCalledWith(
      'https://other.example/collections/new/products.json?limit=250&page=1',
    );
  });
});

// ── JsonLdStrategy ────────────────────────────────────────────────────────────

describe('JsonLdStrategy', () => {
  const strategy = new JsonLdStrategy();

  it('reads discounted products from @graph blocks and skips broken blocks', async () => {
    const items = await strategy.extract(ctxFor(fixture('jsonld-products.html')));

    expect(items).toEqual([
      {
        name: 'Ficus Lyrata',
        link: 'https://shop.example/produkte/ficus-lyrata',
        img: 'https://cdn.example/ficus.jpg',
        newPrice: 34.99,
        oldPrice: 39.99,
      },
    ]);
  });

  it('throws when no HTML could be loaded', async () => {
    await expect(strategy.extract(ctxFor(null))).rejects.toThrow('No HTML');
  });
});

// ── SelectorStrategy ──────────────────────────────────────────────────────────

describe('SelectorStrategy', () => {
  const strategy = new SelectorStrategy();
  const selectors = {
    container: 'product-card',
    oldPrice: '.price del',
    newPrice: '.price ins',
    link: 'a.product-card-title',
    name: 'a.product-card-title',
    img: '.product-primary-image',
  };

  it('is applicable only with selectors or a parseFn', () => {
    expect(strategy.isApplicable(baseConfig)).toBe(false);
    expect(strategy.isApplicable({ ...baseConfig, selectors })).toBe(true);
    expect(strategy.isApplicable({ ...baseConfig, parseFn: () => [] })).toBe(true);
  });

  it('extracts discounted items and resolves relative links against the final url', async () => {
    const items = await strategy.extract(
      ctxFor(fixture('shopify-theme-collection.html'), {
        config: { ...baseConfig, selectors },
      }),
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      name: "Alocasia 'Nobilis'",
      link: 'https://shop.example/collections/sale/products/alocasia-nobilis',
      img: 'https://shop.example/cdn/shop/files/nobilis.jpg?width=375',
      oldPrice: 29.99,
      newPrice: 19.99,
    });
  });

  it('falls through selector candidates until one matches', async () => {
    const items = await strategy.extract(
      ctxFor(fixture('shopify-theme-collection.html'), {
        config: {
          ...baseConfig,
          selectors: {
            ...selectors,
            container: ['.does-not-exist', 'product-card'],
            oldPrice: ['.gone', '.price del'],
            newPrice: ['.gone', '.price ins'],
          },
        },
      }),
    );
    expect(items).toHaveLength(2);
  });

  it('drops items matching the out-of-stock text', async () => {
    const items = await strategy.extract(
      ctxFor(fixture('shopify-theme-collection.html'), {
        config: { ...baseConfig, selectors: { ...selectors, outOfStockText: /ausverkauft/i } },
      }),
    );
    expect(items.map((i) => i.name)).toEqual(["Alocasia 'Nobilis'"]);
  });

  it('reports a missing name as null so completeness checks can see it', async () => {
    const items = await strategy.extract(
      ctxFor(fixture('shopify-theme-collection.html'), {
        config: { ...baseConfig, selectors: { ...selectors, name: '.renamed-title' } },
      }),
    );
    expect(items.every((i) => i.name === null)).toBe(true);
  });

  it('treats an invalid selector as no match instead of throwing', async () => {
    const items = await strategy.extract(
      ctxFor(fixture('shopify-theme-collection.html'), {
        config: { ...baseConfig, selectors: { ...selectors, container: ['(((', 'product-card'] } },
      }),
    );
    expect(items).toHaveLength(2);
  });

  it('extracts PLNTS cards with the production selectors and unwraps proxied images', async () => {
    const config = (
      new PlntsScraper(new NodeCacheAdapter()) as unknown as { config: ScraperConfig }
    ).config;

    const items = await strategy.extract(
      ctxFor(fixture('plnts-cards.html'), {
        config,
        pageUrl: config.baseUrl,
        loadHtml: async () => ({
          html: fixture('plnts-cards.html'),
          finalUrl: 'https://plnts.com/de/shop/sale',
        }),
      }),
    );

    expect(items).toEqual([
      {
        name: 'Monstera deliciosa Albo',
        link: 'https://plnts.com/de/product/monstera-albo-1001',
        img: 'https://webshop.plnts.com/media/catalog/product/m/o/monstera-albo.jpg',
        oldPrice: 49,
        newPrice: 34.3,
      },
      {
        name: 'Philodendron Pink Princess',
        link: 'https://plnts.com/de/product/philodendron-pink-princess-1002',
        img: 'https://webshop.plnts.com/media/catalog/product/p/i/pink-princess.jpg',
        oldPrice: 1249.5,
        newPrice: 999,
      },
    ]);
  });

  it('prefers a custom parseFn over selectors', async () => {
    const parseFn = vi
      .fn()
      .mockReturnValue([{ name: 'custom', link: 'x', oldPrice: 2, newPrice: 1 }, null]);
    const items = await strategy.extract(
      ctxFor('<html></html>', { config: { ...baseConfig, selectors, parseFn } }),
    );
    expect(items).toEqual([{ name: 'custom', link: 'x', oldPrice: 2, newPrice: 1 }]);
  });
});

// ── HeuristicStrategy ─────────────────────────────────────────────────────────

describe('HeuristicStrategy', () => {
  const strategy = new HeuristicStrategy();

  it('extracts cards without any site specific selectors', async () => {
    const items = await strategy.extract(ctxFor(fixture('unknown-theme-cards.html')));

    expect(items).toEqual([
      {
        name: 'Calathea Stella',
        link: 'https://shop.example/p/calathea-stella',
        img: 'https://shop.example/img/calathea.jpg',
        oldPrice: 29.99,
        newPrice: 19.99,
      },
      {
        name: 'Ficus Audrey',
        link: 'https://shop.example/p/ficus-audrey',
        img: 'https://shop.example/img/ficus.jpg',
        oldPrice: 24,
        newPrice: 14.5,
      },
    ]);
  });

  it('does not take a per-unit price for the sale price', async () => {
    const items = await strategy.extract(ctxFor(fixture('unknown-theme-cards.html')));
    expect(items.find((i) => i.name === 'Calathea Stella')?.newPrice).toBe(19.99);
  });

  it('refuses a container that holds several products instead of guessing a link', async () => {
    const items = await strategy.extract(ctxFor(fixture('single-container.html')));
    expect(items).toEqual([]);
  });
});
