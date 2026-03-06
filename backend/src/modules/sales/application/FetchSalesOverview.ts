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

const log = createModuleLogger('FetchSalesOverview');

// ── Concurrency limiter (was in concurrency.js in V1) ────────────────────────

type Task<T> = () => Promise<T>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createLimiter = (max: number) => {
  let active = 0;
  const queue: Array<{
    fn: Task<any>;
    resolve: (value: any) => void;
    reject: (reason: unknown) => void;
  }> = [];

  const next = () => {
    if (queue.length === 0 || active >= max) return;
    active++;
    const { fn, resolve, reject } = queue.shift()!;
    fn()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        active--;
        next();
      });
  };

  return <T>(fn: Task<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
};

// ── Use case ──────────────────────────────────────────────────────────────────

export interface FetchSalesOptions {
  /** Called for each batch of deduplicated Sale items as they arrive */
  onItems: (items: SaleData[]) => Promise<void>;
  /** Called to check if the client has disconnected (abort signal) */
  isAborted: () => boolean;
}

export class FetchSalesOverview {
  private readonly chromiumLimit = createLimiter(2);
  private readonly axiosLimit = createLimiter(8);

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
        log.error(
          `[${source.key}] Page ${page} failed: ${(err as Error).message}`,
        );
      }
    };

    // Sort by priority, then fan out all jobs
    const sortedSources = [...this.sources].sort(
      (a, b) => (a.priority ?? 99) - (b.priority ?? 99),
    );

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
