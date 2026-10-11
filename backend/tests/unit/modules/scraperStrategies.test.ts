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
import {
  BlattmanufakturScraper,
  FoliageFactoryScraper,
  GrowJungleScraper,
  MgPlantsScraper,
  PlantThatPlantScraper,
  PlntsScraper,
} from '../../../src/modules/sales/infrastructure/scrapers';
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

// ── Shop configurations ───────────────────────────────────────────────────────

describe.each([
  {
    name: 'FoliageFactoryScraper',
    Scraper: FoliageFactoryScraper,
    feedFixture: 'foliage-factory-products.json',
    htmlFixture: 'foliage-factory-cards.html',
    feedUrl: 'https://foliage-factory.com/collections/sale/products.json?limit=250&page=1',
    finalUrl: 'https://foliage-factory.com/de/collections/sale',
    feedItems: [
      { name: "Monstera deliciosa variegata 'Super White'", newPrice: 59, oldPrice: 93.45 },
      { name: "Monstera 'Thai Constellation'", newPrice: 35, oldPrice: 49.75 },
    ],
    htmlItems: [
      {
        name: 'Monstera deliciosa variegata ‘Super White’',
        newPrice: 59,
        oldPrice: 93.45,
        linkPath: '/de/products/monstera-deliciosa-variegata-super-white',
        imgPath: '/cdn/shop/files/monstera-deliciosa-variegata-super-white-foliage-01.webp',
      },
    ],
  },
  {
    name: 'PlantThatPlantScraper',
    Scraper: PlantThatPlantScraper,
    feedFixture: 'plantthatplant-products.json',
    htmlFixture: 'plantthatplant-cards.html',
    feedUrl:
      'https://www.plantthatplant.com/collections/all-plants-1/products.json?limit=250&page=1&country=DE',
    finalUrl: 'https://www.plantthatplant.com/collections/all-plants-1',
    feedItems: [
      { name: 'Monstera ’White Monster’', newPrice: 63.95, oldPrice: 81.95 },
      { name: 'Philodendron billietiae', newPrice: 18.95, oldPrice: 22.95 },
    ],
    htmlItems: [
      {
        name: 'Alocasia Mystery Subscription',
        newPrice: 17.95,
        oldPrice: 34.95,
        linkPath: '/products/1x-alocasia-mystery-subscription',
        imgPath: '/cdn/shop/files/Screenshot2025-12-03at21.46.00.png',
      },
    ],
  },
  {
    name: 'GrowJungleScraper',
    Scraper: GrowJungleScraper,
    feedFixture: 'growjungle-products.json',
    htmlFixture: 'growjungle-cards.html',
    feedUrl: 'https://www.growjungle.com/collections/sale-2/products.json?limit=250&page=1',
    finalUrl: 'https://www.growjungle.com/de/collections/sale-2',
    feedItems: [
      { name: 'Philodendron Pink Galaxy Small', newPrice: 12.73, oldPrice: 32.4 },
      { name: 'Pellionia Repens Variegated', newPrice: 9.78, oldPrice: 19.62 },
    ],
    htmlItems: [
      {
        name: 'Philodendron Pink Galaxy Small',
        newPrice: 12.73,
        oldPrice: 32.4,
        linkPath: '/de/products/philodendron-pink-galaxy-small',
        imgPath: '/cdn/shop/files/IMG_4089.heic',
      },
    ],
  },
  {
    name: 'BlattmanufakturScraper',
    Scraper: BlattmanufakturScraper,
    feedFixture: 'blattmanufaktur-products.json',
    htmlFixture: 'blattmanufaktur-cards.html',
    feedUrl:
      'https://www.blattmanufaktur.de/collections/sale-automatisch/products.json?limit=250&page=1',
    finalUrl: 'https://www.blattmanufaktur.de/collections/sale-automatisch',
    feedItems: [
      { name: "Alocasia 'Dragon Scale Mint Variegata'", newPrice: 19.9, oldPrice: 29.9 },
      { name: 'Alocasia Mandalay', newPrice: 14.9, oldPrice: 20.9 },
    ],
    htmlItems: [
      {
        name: "Alocasia 'Dragon Scale Mint Variegata'",
        newPrice: 19.9,
        oldPrice: 29.9,
        linkPath: '/products/alocasia-dragon-scale-variegata',
        imgPath:
          '/cdn/shop/files/rn-image_picker_lib_temp_6d1cf4ff-a42c-416d-af68-b7aa7981ad03.jpg',
      },
      {
        name: 'Alocasia Mandalay',
        newPrice: 14.9,
        oldPrice: 20.9,
        linkPath: '/products/alocasia-mandalay',
        imgPath: '/cdn/shop/files/de9c8665-c22a-4650-98b3-7e16ea46a8d8.webp',
      },
    ],
  },
])('$name', (shop) => {
  const config = (new shop.Scraper(new NodeCacheAdapter()) as unknown as { config: ScraperConfig })
    .config;

  it('reads the feed of its collection and keeps only plants', async () => {
    vi.mocked(fetchJson).mockResolvedValue(JSON.parse(fixture(shop.feedFixture)));

    const items = await new ShopifyJsonStrategy().extract(ctxFor(null, { config }));

    expect(fetchJson).toHaveBeenCalledWith(shop.feedUrl);
    expect(items.map(({ name, newPrice, oldPrice }) => ({ name, newPrice, oldPrice }))).toEqual(
      shop.feedItems,
    );
    for (const item of items) expect(item.img).toMatch(/^https:\/\//);
  });

  it('extracts discounted cards with the theme selectors as fallback', async () => {
    const html = fixture(shop.htmlFixture);

    const items = await new SelectorStrategy().extract(
      ctxFor(html, {
        config,
        pageUrl: config.baseUrl,
        loadHtml: async () => ({ html, finalUrl: shop.finalUrl }),
      }),
    );

    expect(items).toHaveLength(shop.htmlItems.length);
    shop.htmlItems.forEach(({ linkPath, imgPath, ...prices }, index) => {
      expect(items[index]).toMatchObject(prices);
      expect(items[index].link).toContain(linkPath);
      expect(items[index].img).toContain(imgPath);
    });
  });
});

describe('MgPlantsScraper', () => {
  const config = (
    new MgPlantsScraper(new NodeCacheAdapter()) as unknown as { config: ScraperConfig }
  ).config;

  it('reads the whole catalogue feed and drops soil and bundles', async () => {
    vi.mocked(fetchJson).mockResolvedValue(JSON.parse(fixture('mgplants-products.json')));

    const items = await new ShopifyJsonStrategy().extract(ctxFor(null, { config }));

    expect(fetchJson).toHaveBeenCalledWith(
      'https://mg-plants.com/collections/all/products.json?limit=250&page=1',
    );
    expect(items.map(({ name, newPrice, oldPrice }) => ({ name, newPrice, oldPrice }))).toEqual([
      { name: 'Alocasia Frydek Varigata - Tissue Culture (TC)', newPrice: 9.9, oldPrice: 19.9 },
      { name: 'Alocasia Jacklyn Aurea- TC', newPrice: 39, oldPrice: 59 },
    ]);
    for (const item of items) expect(item.img).toMatch(/^https:\/\//);
  });

  it('reads four feed pages and has no HTML fallback', () => {
    expect(config.maxPages).toBe(4);
    expect(config.selectors).toBeUndefined();
  });
});

describe('ShopifyJsonStrategy product filter', () => {
  it('hands type and tags of each product to the shop filter', async () => {
    const shopifyProductFilter = vi.fn().mockReturnValue(true);
    vi.mocked(fetchJson).mockResolvedValue({
      products: [
        {
          handle: 'a',
          title: 'A',
          product_type: 'Plants',
          tags: 'Rare, Pre-order',
          variants: [{ price: '5.00', compare_at_price: '9.00', available: true }],
        },
      ],
    });

    await new ShopifyJsonStrategy().extract(
      ctxFor(null, {
        config: {
          ...baseConfig,
          shopifyCollectionUrl: 'https://shop.example/collections/sale',
          shopifyProductFilter,
        },
      }),
    );

    expect(shopifyProductFilter).toHaveBeenCalledWith({
      title: 'A',
      productType: 'Plants',
      tags: ['Rare', 'Pre-order'],
    });
  });
});
