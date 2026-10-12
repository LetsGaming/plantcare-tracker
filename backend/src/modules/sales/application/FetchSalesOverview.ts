/**
 * modules/sales/application/FetchSalesOverview.ts
 *
 * The core use case for the Sales module.
 *
 * V1 problem: ALL of this logic (concurrency limiters, deduplication,
 * SSE streaming, error handling, scraper orchestration) was crammed
 * into salesController.js as a single 150-line getSalesData() function.
 *
 * V2 solution: The controller becomes a thin HTTP adapter that calls
 * this use case. The use case is framework-agnostic and fully testable.
 */

import type { SalesSource } from '../domain/SalesSource';
import { Sale } from '../domain/Sale';
import type { SaleData } from '../domain/Sale';
import { createModuleLogger } from '../../../core/logging';
import { CHROMIUM_CONCURRENCY, HTTP_CONCURRENCY, createLimiter } from './limiter';

const log = createModuleLogger('FetchSalesOverview');

// ── Use case ──────────────────────────────────────────────────────────────────

export interface FetchSalesOptions {
  /** Called for each batch of deduplicated Sale items as they arrive */
  onItems: (items: SaleData[]) => Promise<void>;
  /** Called to check if the client has disconnected (abort signal) */
  isAborted: () => boolean;
}

export class FetchSalesOverview {
  private readonly chromiumLimit = createLimiter(CHROMIUM_CONCURRENCY);
  private readonly axiosLimit = createLimiter(HTTP_CONCURRENCY);

  constructor(private readonly sources: SalesSource[]) {}

  async execute({ onItems, isAborted }: FetchSalesOptions): Promise<void> {
    const sentIds = new Set<string>();

    const scrapeWorker = async (source: SalesSource, page: number): Promise<void> => {
      if (isAborted()) return;

      try {
        const rawItems = await source.fetchPage(page);

        if (rawItems.length === 0 || isAborted()) return;

        // Build Sale entities, filter nulls and already-sent items
        const newItems = rawItems
          .map((raw) => Sale.fromRaw(raw, source.seller))
          .filter((sale): sale is Sale => sale !== null)
          .filter((sale) => {
            if (sentIds.has(sale.sale_id)) return false;
            sentIds.add(sale.sale_id);
            return true;
          })
          .map((sale) => sale.toJSON());

        if (newItems.length > 0 && !isAborted()) {
          await onItems(newItems);
        }
      } catch (err: unknown) {
        log.error(`[${source.key}] Page ${page} failed`, { err });
      }
    };

    // Sort by priority, then fan out all jobs
    const sortedSources = [...this.sources].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

    const jobs = sortedSources.flatMap((source) =>
      Array.from({ length: source.maxPages }, (_, i) => {
        const page = i + 1;
        const limiter = source.useChromium ? this.chromiumLimit : this.axiosLimit;
        return limiter(() => scrapeWorker(source, page));
      }),
    );

    await Promise.allSettled(jobs);
  }
}
