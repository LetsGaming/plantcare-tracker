import { parse, type HTMLElement } from "node-html-parser";
import type { RawSaleItem } from "../../../domain/Sale";
import {
  commercialRound,
  extractImageUrl,
  parsePrice,
  resolveLink,
} from "../../scrapeHelpers";
import type {
  ExtractionStrategy,
  ScraperConfig,
  ScraperSelectors,
  SelectorList,
  StrategyContext,
} from "../types";

const toList = (selectors: SelectorList): string[] =>
  Array.isArray(selectors) ? selectors : [selectors];

// A selector that a parser version cannot handle must degrade to "no match",
// so the next candidate or strategy still gets its turn.
const safeQueryAll = (root: HTMLElement, selector: string): HTMLElement[] => {
  try {
    return root.querySelectorAll(selector);
  } catch {
    return [];
  }
};

const queryFirst = (
  root: HTMLElement,
  selectors: SelectorList,
): HTMLElement | null => {
  for (const selector of toList(selectors)) {
    const match = safeQueryAll(root, selector)[0];
    if (match) return match;
  }
  return null;
};

const queryContainers = (
  root: HTMLElement,
  selectors: SelectorList,
): HTMLElement[] => {
  for (const selector of toList(selectors)) {
    const matches = safeQueryAll(root, selector);
    if (matches.length > 0) return matches;
  }
  return [];
};

const parseWithSelectors = (
  root: HTMLElement,
  sel: ScraperSelectors,
  baseUrl: string,
): (RawSaleItem | null)[] =>
  queryContainers(root, sel.container).map((item) => {
    if (sel.outOfStock && queryFirst(item, sel.outOfStock)) return null;
    if (sel.outOfStockText?.test(item.text)) return null;

    const oldPrice = commercialRound(parsePrice(queryFirst(item, sel.oldPrice)));
    const newPrice = commercialRound(parsePrice(queryFirst(item, sel.newPrice)));
    if (!newPrice || !oldPrice || newPrice >= oldPrice) return null;

    const linkElem = queryFirst(item, sel.link);
    const href =
      linkElem?.getAttribute("href") ??
      linkElem?.querySelector("a")?.getAttribute("href");

    const nameElem = queryFirst(item, sel.name);
    const name = sel.nameAttr
      ? nameElem?.getAttribute(sel.nameAttr)
      : nameElem?.text?.trim();

    return {
      name: name?.trim() || null,
      link: resolveLink(href, baseUrl),
      img: extractImageUrl(queryFirst(item, sel.img), baseUrl),
      oldPrice,
      newPrice,
    };
  });

export class SelectorStrategy implements ExtractionStrategy {
  readonly name = "selector" as const;
  readonly authoritative = false;

  isApplicable(config: ScraperConfig): boolean {
    return Boolean(config.selectors || config.parseFn);
  }

  async extract(ctx: StrategyContext): Promise<RawSaleItem[]> {
    const doc = await ctx.loadHtml();
    if (!doc) throw new Error("No HTML returned");

    const { parseFn, selectors } = ctx.config;
    const root = parse(doc.html);
    const raw = parseFn
      ? parseFn(root)
      : parseWithSelectors(root, selectors!, doc.finalUrl);

    return raw.filter((item): item is RawSaleItem => item !== null);
  }
}
