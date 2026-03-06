/**
 * modules/sales/infrastructure/scrapers/index.ts
 *
 * All scraper implementations. Each extends BaseScraper and provides
 * only its site-specific config. The complex foliageDreams and
 * harmonyPlants keep their custom parseFn logic — now properly typed.
 *
 * V1 equivalent: all files in /controllers/sales/sources/
 */

import type { HTMLElement } from 'node-html-parser';
import type { CacheService } from '../../../../core/cache/CacheService';
import type { RawSaleItem } from '../../domain/Sale';
import { BaseScraper } from './BaseScraper';
import { parsePrice, resolveLink, getText } from '../scrapeHelpers';

// ── FoliageDreams ─────────────────────────────────────────────────────────────

export class FoliageDreamsScraper extends BaseScraper {
  constructor(cache: CacheService) {
    super(
      {
        key: 'foliageDreams',
        seller: 'Foliage Dreams',
        baseUrl: 'https://foliagedreams.com/collections/alle-pflanzen?filter.v.availability=1',
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

            let img =
              imgElem?.getAttribute('srcset') || imgElem?.getAttribute('src') || null;
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
    );
  }
}

// ── WhiteLeafPlants ───────────────────────────────────────────────────────────

export class WhiteLeafPlantsScraper extends BaseScraper {
  constructor(cache: CacheService) {
    super(
      {
        key: 'whiteleafplants',
        seller: 'White Leaf Plants',
        baseUrl:
          'https://whiteleafplants.com/collections/alle-sort?filter.v.availability=1&sort_by=manual',
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
    );
  }
}

// ── Palmenmann ────────────────────────────────────────────────────────────────

export class PalmenmannScraper extends BaseScraper {
  constructor(cache: CacheService) {
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
    );
  }
}

// ── PlantCircle ───────────────────────────────────────────────────────────────

export class PlantCircleScraper extends BaseScraper {
  constructor(cache: CacheService) {
    super(
      {
        key: 'plantcircle',
        seller: 'Plant Circle',
        baseUrl:
          'https://plantcircle.com/de/collections/houseplant-sale?sort_by=best-selling&filter.v.availability=1',
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
    );
  }
}

// ── PLNTS ─────────────────────────────────────────────────────────────────────

export class PlntsScraper extends BaseScraper {
  constructor(cache: CacheService) {
    super(
      {
        key: 'plnts',
        seller: 'PLNTS',
        baseUrl: 'https://plnts.com/de/shop/sale',
        pagePattern: '?page={{page}}',
        maxPages: 4,
        useChromium: true,
        selectors: {
          container: '.group\\/product-card',
          oldPrice: 'span.line-through',
          newPrice: 'span.text-accent',
          outOfStock:
            '.w-auto.text-sm.leading-none.px-2.py-1\\.5.\\32xl\\:px-3.\\32xl\\:text-base.bg-sage.text-porcelain.\\33xl\\:bottom-5.absolute.bottom-2\\.5.left-0.z-10.lg\\:bottom-4',
          link: 'a[href^="/de/product"]',
          name: 'a[title]',
          nameAttr: 'title',
          img: 'img',
        },
      },
      cache,
    );
  }
}

// ── GreenMeUp ─────────────────────────────────────────────────────────────────

export class GreenMeUpScraper extends BaseScraper {
  constructor(cache: CacheService) {
    super(
      {
        key: 'greenMeUp',
        seller: 'Green Me Up',
        baseUrl: 'https://greenmeup.de/collections/sale',
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
    );
  }
}

// ── JungleLeaves ──────────────────────────────────────────────────────────────

export class JungleLeavesScraper extends BaseScraper {
  constructor(cache: CacheService) {
    super(
      {
        key: 'jungleLeaves',
        seller: 'Jungle Leaves',
        baseUrl: 'https://www.jungle-leaves.de/produkt-kategorie/sale',
        pagePattern: 'page/{{page}}/',
        maxPages: 2,
        useChromium: true,
        selectors: {
          container: '.product',
          oldPrice: 'span.price del bdi',
          newPrice: 'span.price ins bdi',
          outOfStock: '.out-of-stock',
          link: '.product-loop-title',
          name: '.woocommerce-loop-product__title',
          img: 'img',
        },
      },
      cache,
    );
  }
}

// ── Potflourri ────────────────────────────────────────────────────────────────

export class PotflourriScraper extends BaseScraper {
  constructor(cache: CacheService) {
    super(
      {
        key: 'potflourri',
        seller: 'Potflourri',
        baseUrl:
          'https://potflourri.de/collections/sale-zimmerpflanzen?filter.v.availability=1&sort_by=best-selling',
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
    );
  }
}

// ── HarmonyPlants ─────────────────────────────────────────────────────────────

export class HarmonyPlantsScraper extends BaseScraper {
  constructor(cache: CacheService) {
    super(
      {
        key: 'harmonyPlants',
        seller: 'Harmony Plants',
        baseUrl:
          'https://www.harmony-plants.com/collections/sale?filter.v.availability=1&sort_by=manual',
        pagePattern: '&page={{page}}',
        maxPages: 2,
        parseFn: (root: HTMLElement): (RawSaleItem | null)[] => {
          return root.querySelectorAll('.grid__item').map((item) => {
            const priceElem = item.querySelector('.price--on-sale');
            if (!priceElem) return null;

            const extract = (sel: string): number | null => {
              const bdi = priceElem.querySelector(sel);
              const text =
                bdi?.childNodes.find((n) => n.nodeType === 3)?.text?.trim() ?? '';
              const sup = bdi?.querySelector('sup')?.text?.trim() ?? '';
              return parsePrice(`${text}${sup}`);
            };

            const linkElem = item.querySelector('a');
            return {
              link: resolveLink(
                linkElem?.getAttribute('href'),
                'https://www.harmony-plants.com',
              ),
              name: getText(linkElem ?? undefined, 'span') ?? 'Unnamed Plant',
              img: item.querySelector('img')?.getAttribute('src') ?? null,
              oldPrice: extract('.price__sale s.price-item--regular bdi'),
              newPrice: extract('.price-item--sale bdi'),
            };
          });
        },
      },
      cache,
    );
  }
}

// ── Registry factory ──────────────────────────────────────────────────────────

export const createAllScrapers = (cache: CacheService) => [
  new FoliageDreamsScraper(cache),
  new WhiteLeafPlantsScraper(cache),
  new PalmenmannScraper(cache),
  new PlantCircleScraper(cache),
  new PlntsScraper(cache),
  new GreenMeUpScraper(cache),
  new JungleLeavesScraper(cache),
  new PotflourriScraper(cache),
  new HarmonyPlantsScraper(cache),
];
