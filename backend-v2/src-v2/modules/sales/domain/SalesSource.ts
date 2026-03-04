/**
 * modules/sales/domain/SalesSource.ts
 *
 * The core interface that every scraper must implement.
 * The application layer (FetchSalesOverview) only knows about this
 * interface — it is completely agnostic of Axios, Playwright, or HTML parsing.
 */

import type { RawSaleItem } from './Sale';

export interface ScraperOptions {
  useChromium?: boolean;
  method?: string;
  payload?: unknown;
}

export interface SalesSource {
  /** Unique machine-readable key, e.g. "foliageDreams" */
  readonly key: string;

  /** Human-readable seller name, e.g. "Foliage Dreams" */
  readonly seller: string;

  /** Lower number = higher priority (scraped first) */
  readonly priority: number;

  /** How many pages this source has */
  readonly maxPages: number;

  /** Whether this source requires Chromium (JS rendering) */
  readonly useChromium: boolean;

  /**
   * Fetch and parse a single page of sale items.
   * Returns an array of raw items. The use case handles formatting.
   */
  fetchPage(page: number): Promise<RawSaleItem[]>;
}
