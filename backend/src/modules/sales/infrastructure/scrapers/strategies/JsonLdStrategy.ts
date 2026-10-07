import { parse } from 'node-html-parser';
import type { RawSaleItem } from '../../../domain/Sale';
import { commercialRound, parsePrice, resolveLink } from '../../scrapeHelpers';
import type { ExtractionStrategy, StrategyContext } from '../types';

type JsonNode = Record<string, unknown>;

const asArray = (value: unknown): unknown[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

const isObject = (value: unknown): value is JsonNode => typeof value === 'object' && value !== null;

const hasType = (node: JsonNode, type: string): boolean => asArray(node['@type']).includes(type);

const collectProducts = (node: unknown, out: JsonNode[]): void => {
  if (Array.isArray(node)) {
    node.forEach((child) => collectProducts(child, out));
    return;
  }
  if (!isObject(node)) return;

  if (hasType(node, 'Product')) out.push(node);
  collectProducts(node['@graph'], out);
  asArray(node.itemListElement).forEach((el) =>
    collectProducts(isObject(el) && el.item ? el.item : el, out),
  );
};

const imageOf = (product: JsonNode): string | null => {
  const first = asArray(product.image)[0];
  if (typeof first === 'string') return first;
  return isObject(first) && typeof first.url === 'string' ? first.url : null;
};

const toRawItem = (product: JsonNode, baseUrl: string): RawSaleItem | null => {
  const offer = asArray(product.offers).find(isObject);
  if (!offer) return null;

  const specs = asArray(offer.priceSpecification).filter(isObject);
  const strike = specs.find((spec) =>
    /ListPrice|Strikethrough|SRP/i.test(String(spec.priceType ?? '')),
  );

  const newPrice = commercialRound(parsePrice(String(offer.price ?? offer.lowPrice ?? '')));
  const oldPrice = commercialRound(parsePrice(strike ? String(strike.price ?? '') : null));
  if (newPrice === null || oldPrice === null || newPrice >= oldPrice) {
    return null;
  }

  const availability = String(offer.availability ?? '');
  if (/OutOfStock|SoldOut/i.test(availability)) return null;

  const url = typeof product.url === 'string' ? product.url : offer.url;
  return {
    name: typeof product.name === 'string' ? product.name : null,
    link: resolveLink(typeof url === 'string' ? url : null, baseUrl),
    img: imageOf(product),
    oldPrice,
    newPrice,
  };
};

export class JsonLdStrategy implements ExtractionStrategy {
  readonly name = 'jsonLd' as const;
  readonly authoritative = false;

  isApplicable(): boolean {
    return true;
  }

  async extract(ctx: StrategyContext): Promise<RawSaleItem[]> {
    const doc = await ctx.loadHtml();
    if (!doc) throw new Error('No HTML returned');

    const products: JsonNode[] = [];
    parse(doc.html)
      .querySelectorAll('script[type="application/ld+json"]')
      .forEach((script) => {
        try {
          collectProducts(JSON.parse(script.text), products);
        } catch {
          // A malformed block must not hide the valid ones
        }
      });

    return products
      .map((p) => toRawItem(p, ctx.config.baseUrl))
      .filter((item): item is RawSaleItem => item !== null);
  }
}
