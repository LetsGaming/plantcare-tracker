/**
 * modules/sales/infrastructure/scrapers/index.ts
 *
 * One class per shop. Each only provides site-specific config; extraction
 * and fallback handling live in BaseScraper and the strategies.
 *
 * Shopify shops set `shopifyCollectionUrl` so their products.json feed is
 * tried before the theme markup. The selectors stay as the fallback.
 */

import type { HTMLElement } from 'node-html-parser';
import type { CacheService } from '../../../../core/cache/CacheService';
import type { RawSaleItem } from '../../domain/Sale';
import type { SourceHealthReporter } from '../../../../core/scrapeHealth/SourceHealth';
import { BaseScraper } from './BaseScraper';
import { parsePrice, resolveLink, getText } from '../scrapeHelpers';

// ── FoliageDreams ─────────────────────────────────────────────────────────────

export class FoliageDreamsScraper extends BaseScraper {
  constructor(cache: CacheService, health?: SourceHealthReporter) {
    super(
      {
        key: 'foliageDreams',
        seller: 'Foliage Dreams',
        baseUrl: 'https://foliagedreams.com/collections/alle-pflanzen?filter.v.availability=1',
        shopifyCollectionUrl: 'https://foliagedreams.com/collections/alle-pflanzen',
        pagePattern: '&page={{page}}',
        maxPages: 3,
        priority: 1,
        parseFn: (root: HTMLElement): (RawSaleItem | null)[] => {
          return root.querySelectorAll('.grid-product__content').map((item) => {
            const originalPriceElem = item.querySelector('.grid-product__price--original');
            if (!originalPriceElem) return null;

            const oldPrice = parsePrice(originalPriceElem);
            const fullPriceText = item.querySelector('.grid-product__price')?.text ?? '';
            const remainingText = fullPriceText.replace(originalPriceElem.text, '').trim();
            const priceMatch = remainingText.match(/[\d.,]+/);
            const newPrice = priceMatch ? parsePrice(priceMatch[0]) : null;

            if (!newPrice || !oldPrice || newPrice >= oldPrice) return null;

            const imgElem = item.querySelector('.grid-product__image-mask img');
            const linkElem = item.querySelector('.grid-product__link');

            let img = imgElem?.getAttribute('srcset') || imgElem?.getAttribute('src') || null;
            img = img?.split(' ')[0].split(',')[0] ?? null;
            if (img?.startsWith('//')) img = `https:${img}`;

            return {
              name: getText(item, '.grid-product__title'),
              link: resolveLink(linkElem?.getAttribute('href'), 'https://foliagedreams.com'),
              img,
              oldPrice,
              newPrice,
            };
          });
        },
      },
      cache,
      health,
    );
  }
}

// ── WhiteLeafPlants ───────────────────────────────────────────────────────────

export class WhiteLeafPlantsScraper extends BaseScraper {
  constructor(cache: CacheService, health?: SourceHealthReporter) {
    super(
      {
        key: 'whiteleafplants',
        seller: 'White Leaf Plants',
        baseUrl:
          'https://whiteleafplants.com/collections/alle-sort?filter.v.availability=1&sort_by=manual',
        shopifyCollectionUrl: 'https://whiteleafplants.com/collections/alle-sort',
        pagePattern: '&page={{page}}',
        maxPages: 5,
        priority: 2,
        selectors: {
          container: '.product-item',
          oldPrice: '.price__sale s.price-item--regular',
          newPrice: '.price__sale .price-item--sale',
          link: '.card-title',
          name: '.card-title',
          img: '.card-media img',
        },
      },
      cache,
      health,
    );
  }
}

// ── Palmenmann ────────────────────────────────────────────────────────────────

export class PalmenmannScraper extends BaseScraper {
  constructor(cache: CacheService, health?: SourceHealthReporter) {
    super(
      {
        key: 'palmenmann',
        seller: 'Palmenmann',
        baseUrl: 'https://www.palmenmann.de/angebote/',
        pagePattern: '?p={{page}}',
        maxPages: 1,
        selectors: {
          container: '.product--box',
          oldPrice: '.price--discount',
          newPrice: '.price--default.is--discount',
          outOfStock: '.badge--not-instock',
          link: 'a.product--title',
          name: 'a.product--title',
          img: '.product--image img',
        },
      },
      cache,
      health,
    );
  }
}

// ── PlantCircle ───────────────────────────────────────────────────────────────

export class PlantCircleScraper extends BaseScraper {
  constructor(cache: CacheService, health?: SourceHealthReporter) {
    super(
      {
        key: 'plantcircle',
        seller: 'Plant Circle',
        baseUrl:
          'https://plantcircle.com/de/collections/houseplant-sale?sort_by=best-selling&filter.v.availability=1',
        shopifyCollectionUrl: 'https://plantcircle.com/de/collections/houseplant-sale',
        pagePattern: '&page={{page}}',
        maxPages: 2,
        selectors: {
          container: '.card--product',
          oldPrice: '.price-item--regular span',
          newPrice: '.price-item--sale span',
          outOfStock: '.card__badge--out-of-stock',
          link: 'a[href*="/products/"]',
          name: '.card__title',
          img: '.card__image img',
        },
      },
      cache,
      health,
    );
  }
}

// ── PLNTS ─────────────────────────────────────────────────────────────────────

export class PlntsScraper extends BaseScraper {
  constructor(cache: CacheService, health?: SourceHealthReporter) {
    super(
      {
        key: 'plnts',
        seller: 'PLNTS',
        baseUrl: 'https://plnts.com/de/shop/sale',
        pagePattern: '?page={{page}}',
        maxPages: 4,
        selectors: {
          // Tailwind's "group/name" class cannot be written as a class selector
          container: '[class~="group/product-card"]',
          oldPrice: 'span.line-through',
          newPrice: 'span.text-accent',
          outOfStockText: /ausverkauft/i,
          link: 'a[href^="/de/product"]',
          name: 'a[title]',
          nameAttr: 'title',
          img: 'img',
        },
      },
      cache,
      health,
    );
  }
}

// ── GreenMeUp ─────────────────────────────────────────────────────────────────

export class GreenMeUpScraper extends BaseScraper {
  constructor(cache: CacheService, health?: SourceHealthReporter) {
    super(
      {
        key: 'greenMeUp',
        seller: 'Green Me Up',
        baseUrl: 'https://greenmeup.de/collections/sale',
        shopifyCollectionUrl: 'https://greenmeup.de/collections/sale',
        pagePattern: '?page={{page}}',
        maxPages: 2,
        useChromium: true,
        selectors: {
          container: '.ed-card-product',
          oldPrice: 's.price-item--regular',
          newPrice: '.price-item--sale',
          outOfStock: '.color-inverse',
          link: 'h3.card__heading.h5 a',
          name: 'h3.card__heading.h5 a',
          img: '.card__media img',
        },
      },
      cache,
      health,
    );
  }
}

// ── JungleLeaves ──────────────────────────────────────────────────────────────

export class JungleLeavesScraper extends BaseScraper {
  constructor(cache: CacheService, health?: SourceHealthReporter) {
    super(
      {
        key: 'jungleLeaves',
        seller: 'Jungle Leaves',
        baseUrl: 'https://www.jungle-leaves.de/collections/sale',
        shopifyCollectionUrl: 'https://www.jungle-leaves.de/collections/sale',
        pagePattern: '?page={{page}}',
        maxPages: 2,
        selectors: {
          container: 'product-card',
          oldPrice: '.price del',
          newPrice: '.price ins',
          outOfStockText: /ausverkauft|sold out/i,
          link: 'a.product-card-title',
          name: 'a.product-card-title',
          img: '.product-primary-image',
        },
      },
      cache,
      health,
    );
  }
}

// ── Potflourri ────────────────────────────────────────────────────────────────

export class PotflourriScraper extends BaseScraper {
  constructor(cache: CacheService, health?: SourceHealthReporter) {
    super(
      {
        key: 'potflourri',
        seller: 'Potflourri',
        baseUrl:
          'https://potflourri.de/collections/sale-zimmerpflanzen?filter.v.availability=1&sort_by=best-selling',
        shopifyCollectionUrl: 'https://potflourri.de/collections/sale-zimmerpflanzen',
        pagePattern: '&page={{page}}',
        maxPages: 1,
        selectors: {
          container: '.product-card-wrapper',
          oldPrice: '.price__sale s.price-item--regular',
          newPrice: '.price__sale .price-item--sale',
          link: '.card__heading a',
          name: '.card__heading a',
          img: '.card__media img',
        },
      },
      cache,
      health,
    );
  }
}

// ── HarmonyPlants ─────────────────────────────────────────────────────────────

export class HarmonyPlantsScraper extends BaseScraper {
  constructor(cache: CacheService, health?: SourceHealthReporter) {
    super(
      {
        key: 'harmonyPlants',
        seller: 'Harmony Plants',
        baseUrl:
          'https://www.harmony-plants.com/collections/sale?filter.v.availability=1&sort_by=manual',
        shopifyCollectionUrl: 'https://www.harmony-plants.com/collections/sale',
        pagePattern: '&page={{page}}',
        maxPages: 2,
        parseFn: (root: HTMLElement): (RawSaleItem | null)[] => {
          return root.querySelectorAll('.grid__item').map((item) => {
            const priceElem = item.querySelector('.price--on-sale');
            if (!priceElem) return null;

            const extract = (sel: string): number | null => {
              const bdi = priceElem.querySelector(sel);
              const text = bdi?.childNodes.find((n) => n.nodeType === 3)?.text?.trim() ?? '';
              const sup = bdi?.querySelector('sup')?.text?.trim() ?? '';
              return parsePrice(`${text}${sup}`);
            };

            const linkElem = item.querySelector('a');
            return {
              link: resolveLink(linkElem?.getAttribute('href'), 'https://www.harmony-plants.com'),
              name: getText(linkElem ?? undefined, 'span') ?? 'Unnamed Plant',
              img: item.querySelector('img')?.getAttribute('src') ?? null,
              oldPrice: extract('.price__sale s.price-item--regular bdi'),
              newPrice: extract('.price-item--sale bdi'),
            };
          });
        },
      },
      cache,
      health,
    );
  }
}

// ── Registry factory ──────────────────────────────────────────────────────────

export const createAllScrapers = (
  cache: CacheService,
  health?: SourceHealthReporter,
): BaseScraper[] => [
  new FoliageDreamsScraper(cache, health),
  new WhiteLeafPlantsScraper(cache, health),
  new PalmenmannScraper(cache, health),
  new PlantCircleScraper(cache, health),
  new PlntsScraper(cache, health),
  new GreenMeUpScraper(cache, health),
  new JungleLeavesScraper(cache, health),
  new PotflourriScraper(cache, health),
  new HarmonyPlantsScraper(cache, health),
];
