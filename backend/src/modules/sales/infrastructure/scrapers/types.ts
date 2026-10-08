import type { HTMLElement } from 'node-html-parser';
import type { RawSaleItem } from '../../domain/Sale';
import type { StrategyName } from '../../../../core/scrapeHealth/SourceHealth';
import type { FetchedDocument } from '../HttpFetcher';

/** One selector, or several candidates of which the first match wins. */
export type SelectorList = string | string[];

export interface ScraperSelectors {
  container: SelectorList;
  oldPrice: SelectorList;
  newPrice: SelectorList;
  link: SelectorList;
  name: SelectorList;
  img: SelectorList;
  outOfStock?: SelectorList;
  /** Matched against the item text for shops whose sold-out badge has no stable selector. */
  outOfStockText?: RegExp;
  nameAttr?: string;
}

export interface ScraperConfig {
  key: string;
  seller: string;
  baseUrl: string;
  priority?: number;
  maxPages?: number;
  useChromium?: boolean;
  pagePattern?: string;
  urlTemplate?: string;
  selectors?: ScraperSelectors;
  parseFn?: (root: HTMLElement) => (RawSaleItem | null)[];
  /** Strategies in priority order. Derived from the config when omitted. */
  strategies?: StrategyName[];
  /** Shopify collection URL (without /products.json) enabling the JSON feed. */
  shopifyCollectionUrl?: string;
}

export interface StrategyContext {
  config: ScraperConfig;
  page: number;
  pageUrl: string;
  /** Overrides config.shopifyCollectionUrl, used when a platform is detected at runtime. */
  shopifyCollectionUrl?: string;
  /** Memoized per page so HTML strategies share one request. */
  loadHtml(): Promise<FetchedDocument | null>;
}

export interface ExtractionStrategy {
  readonly name: StrategyName;
  /** An empty result from a successful fetch is trustworthy (structured feeds). */
  readonly authoritative: boolean;
  isApplicable(config: ScraperConfig): boolean;
  /** Throws when the underlying data could not be fetched. */
  extract(ctx: StrategyContext): Promise<RawSaleItem[]>;
}
