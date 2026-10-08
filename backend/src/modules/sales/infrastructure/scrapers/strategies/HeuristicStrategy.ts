import { parse, type HTMLElement } from 'node-html-parser';
import type { RawSaleItem } from '../../../domain/Sale';
import { commercialRound, extractImageUrl, parsePrice, resolveLink } from '../../scrapeHelpers';
import type { ExtractionStrategy, StrategyContext } from '../types';

const STRUCK_PRICE_SELECTOR = [
  'del',
  's',
  'strike',
  '[class*="line-through"]',
  '[class*="compare"]',
  '[class*="price-item--regular"]',
  '[class*="price--regular"]',
  '[class*="old-price"]',
  '[class*="original"]',
  '[class*="price--discount"]',
].join(', ');

const MAX_CARD_DEPTH = 10;
const SOLD_OUT = /ausverkauft|sold out|out of stock|nicht verf(ü|u)gbar|nicht lieferbar/i;
// Prices followed by "/" are per-unit prices (e.g. "0,66 €/ml"), not the sale price
const PRICE_TEXT = /\d{1,5}(?:[.,]\d{3})*[.,]\d{2}(?!\d)(?!\s*(?:€|EUR)?\s*\/)/g;
/** Below this share of the old price a heuristic match is more likely a misread than a sale. */
const MIN_PRICE_RATIO = 0.1;
const NON_PRODUCT_HREF = /^(#|javascript:|mailto:|tel:)/i;

const safeQueryAll = (root: HTMLElement, selector: string): HTMLElement[] => {
  try {
    return root.querySelectorAll(selector);
  } catch {
    return [];
  }
};

/** Nearest ancestor that holds both a link and an image: the product card. */
const findCard = (el: HTMLElement): HTMLElement | null => {
  let node: HTMLElement | null = el.parentNode;
  for (let depth = 0; node && depth < MAX_CARD_DEPTH; depth++) {
    if (['BODY', 'HTML'].includes(node.tagName)) return null;
    if (node.querySelector('a[href]') && node.querySelector('img')) return node;
    node = node.parentNode;
  }
  return null;
};

const productHrefs = (card: HTMLElement): string[] => [
  ...new Set(
    card
      .querySelectorAll('a[href]')
      .map((a) => a.getAttribute('href')!)
      .filter((href) => !NON_PRODUCT_HREF.test(href)),
  ),
];

/**
 * A card links to exactly one product. An ancestor holding several product
 * links is a whole grid or section, and its first link would belong to the
 * wrong item.
 */
const pickLink = (card: HTMLElement): string | undefined => {
  const hrefs = productHrefs(card);
  const productLinks = new Set(
    hrefs.filter((href) => /\/product/i.test(href)).map((href) => href.split('?')[0]),
  );
  if (productLinks.size > 1) return undefined;
  return hrefs.find((href) => /\/product/i.test(href)) ?? hrefs[0];
};

const pickName = (card: HTMLElement, linkTitle?: string | null): string | null =>
  card.querySelector('h1, h2, h3, h4, h5, h6')?.text.trim() ||
  card.querySelector('[class*="title"]')?.text.trim() ||
  linkTitle?.trim() ||
  card.querySelector('img')?.getAttribute('alt')?.trim() ||
  null;

/** The sale price is the first price after the struck-through one. */
const pickNewPrice = (card: HTMLElement, struck: HTMLElement, oldPrice: number) => {
  const text = card.text;
  const at = text.indexOf(struck.text);
  const candidates = at === -1 ? [text] : [text.slice(at + struck.text.length), text.slice(0, at)];

  for (const part of candidates) {
    const price = (part.match(PRICE_TEXT) ?? [])
      .map((m) => commercialRound(parsePrice(m)))
      .find((p): p is number => p !== null && p >= oldPrice * MIN_PRICE_RATIO && p < oldPrice);
    if (price !== undefined) return price;
  }
  return null;
};

const pickImage = (card: HTMLElement, baseUrl: string): string | null => {
  for (const img of card.querySelectorAll('img')) {
    const url = extractImageUrl(img, baseUrl);
    if (url) return url;
  }
  return null;
};

/**
 * Last resort that needs no site-specific selectors: it anchors on struck
 * through prices and reads everything else from the surrounding card.
 */
export class HeuristicStrategy implements ExtractionStrategy {
  readonly name = 'heuristic' as const;
  readonly authoritative = false;

  isApplicable(): boolean {
    return true;
  }

  async extract(ctx: StrategyContext): Promise<RawSaleItem[]> {
    const doc = await ctx.loadHtml();
    if (!doc) throw new Error('No HTML returned');

    const root = parse(doc.html);
    const cards = new Map<HTMLElement, HTMLElement>();

    for (const struck of safeQueryAll(root, STRUCK_PRICE_SELECTOR)) {
      if (parsePrice(struck) === null) continue;
      const card = findCard(struck);
      if (card && !cards.has(card)) cards.set(card, struck);
    }

    const items: RawSaleItem[] = [];
    for (const [card, struck] of cards) {
      if (SOLD_OUT.test(card.text)) continue;

      const oldPrice = commercialRound(parsePrice(struck));
      if (oldPrice === null) continue;
      const newPrice = pickNewPrice(card, struck, oldPrice);
      const href = pickLink(card);
      if (newPrice === null || !href) continue;

      const linkTitle = card
        .querySelectorAll('a[href]')
        .find((a) => a.getAttribute('href') === href)
        ?.getAttribute('title');

      items.push({
        name: pickName(card, linkTitle),
        link: resolveLink(href, doc.finalUrl),
        img: pickImage(card, doc.finalUrl),
        oldPrice,
        newPrice,
      });
    }
    return items;
  }
}
