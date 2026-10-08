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
  variants?: ShopifyVariant[];
  images?: { src: string }[];
}

interface ProductsFeed {
  products?: ShopifyProduct[];
}

const PAGE_SIZE = 250;

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

    const feed = await fetchJson<ProductsFeed>(
      `${origin}${collectionPath}/products.json?limit=${PAGE_SIZE}&page=${ctx.page}`,
    );
    if (!feed || !Array.isArray(feed.products)) {
      throw new Error('products.json unavailable');
    }

    return feed.products
      .map((p) => toRawItem(p, `${origin}${localePrefix}`))
      .filter((item): item is RawSaleItem => item !== null);
  }
}
