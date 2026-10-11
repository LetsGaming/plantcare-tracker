import type { RawSaleItem } from '../../../domain/Sale';
import { fetchJson } from '../../HttpFetcher';
import { commercialRound, normalizeImageUrl, parsePrice } from '../../scrapeHelpers';
import type { ExtractionStrategy, StrategyContext } from '../types';

interface ShopifyVariant {
  price: string;
  compare_at_price: string | null;
  available: boolean;
}

interface ShopifyProduct {
  handle: string;
  title: string;
  product_type?: string;
  tags?: string[] | string;
  variants?: ShopifyVariant[];
  images?: { src: string }[];
}

interface ProductsFeed {
  products?: ShopifyProduct[];
}

const PAGE_SIZE = 250;

const toTags = (tags: ShopifyProduct['tags']): string[] =>
  Array.isArray(tags) ? tags : (tags?.split(',').map((tag) => tag.trim()) ?? []);

const toRawItem = (product: ShopifyProduct, productBase: string): RawSaleItem | null => {
  const discounted = (product.variants ?? [])
    .filter((v) => v.available)
    .map((v) => ({
      newPrice: commercialRound(parsePrice(v.price)),
      oldPrice: commercialRound(parsePrice(v.compare_at_price)),
    }))
    .filter(
      (v): v is { newPrice: number; oldPrice: number } =>
        v.newPrice !== null && v.oldPrice !== null && v.newPrice < v.oldPrice,
    )
    .sort((a, b) => a.newPrice - b.newPrice);

  if (discounted.length === 0) return null;

  return {
    name: product.title,
    link: `${productBase}/products/${product.handle}`,
    img: normalizeImageUrl(product.images?.[0]?.src, productBase),
    ...discounted[0],
  };
};

export class ShopifyJsonStrategy implements ExtractionStrategy {
  readonly name = 'shopifyJson' as const;
  readonly authoritative = true;

  isApplicable(config: { shopifyCollectionUrl?: string }): boolean {
    return Boolean(config.shopifyCollectionUrl);
  }

  async extract(ctx: StrategyContext): Promise<RawSaleItem[]> {
    const collectionUrl = ctx.shopifyCollectionUrl ?? ctx.config.shopifyCollectionUrl;
    if (!collectionUrl) throw new Error('No Shopify collection URL configured');

    const { origin, pathname } = new URL(collectionUrl);
    const collectionPath = pathname.replace(/\/$/, '');
    // Localized storefronts (e.g. /de) prefix product paths as well
    const localePrefix = collectionPath.split('/collections/')[0];

    const { shopifyCountry, shopifyProductFilter } = ctx.config;
    const market = shopifyCountry ? `&country=${encodeURIComponent(shopifyCountry)}` : '';

    const feed = await fetchJson<ProductsFeed>(
      `${origin}${collectionPath}/products.json?limit=${PAGE_SIZE}&page=${ctx.page}${market}`,
    );
    if (!feed || !Array.isArray(feed.products)) {
      throw new Error('products.json unavailable');
    }

    return feed.products
      .filter(
        (p) =>
          !shopifyProductFilter ||
          shopifyProductFilter({
            title: p.title,
            productType: p.product_type ?? '',
            tags: toTags(p.tags),
          }),
      )
      .map((p) => toRawItem(p, `${origin}${localePrefix}`))
      .filter((item): item is RawSaleItem => item !== null);
  }
}
