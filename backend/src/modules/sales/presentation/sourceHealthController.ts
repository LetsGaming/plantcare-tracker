/**
 * modules/sales/presentation/sourceHealthController.ts
 *
 * Admin-facing view of scrape source health and an on-demand re-check.
 */

import type { Handler } from '../../../core/middleware';
import type { SalesSource } from '../domain/SalesSource';
import type { SourceHealth, SourceHealthTracker } from '../../../core/scrapeHealth';
import { NotFoundError } from '../../../core/errors/AppError';

export interface SourceHealthListResponse {
  data: SourceHealth[];
}
export interface SourceHealthResponse {
  data: SourceHealth;
}

export interface SourceHealthController {
  listHealth: Handler;
  recheckSource: Handler;
}

/** The part of the refresher a recheck needs. */
export interface SourceRefresh {
  refreshSource(key: string): Promise<unknown>;
}

/**
 * Without a refresher a recheck only scrapes page 1; with one it runs a full
 * refresh, within the shared scrape limits, that also stores the items.
 */
export const createSourceHealthController = (
  sources: SalesSource[],
  tracker: SourceHealthTracker,
  refresher?: SourceRefresh,
): SourceHealthController => ({
  listHealth: async () => {
    const body: SourceHealthListResponse = {
      data: tracker.list(
        sources.map((s) => ({ key: s.key, seller: s.seller, kind: 'sales' as const })),
      ),
    };
    return body;
  },

  recheckSource: async (req) => {
    const source = sources.find((s) => s.key === (req.params as { key: string }).key);
    if (!source) throw new NotFoundError('Source');

    if (refresher) {
      await refresher.refreshSource(source.key);
    } else {
      await source.fetchPage(1, { bypassCache: true });
    }

    const health = tracker.get(source.key);
    if (!health) throw new NotFoundError('Source health');
    const body: SourceHealthResponse = { data: health };
    return body;
  },
});
