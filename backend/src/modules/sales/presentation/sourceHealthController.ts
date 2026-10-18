/**
 * modules/sales/presentation/sourceHealthController.ts
 *
 * Admin-facing view of scrape source health and an on-demand re-check.
 */

import type { Handler } from '../../../core/middleware';
import type { SalesSource } from '../domain/SalesSource';
import type { SourceHealth, SourceHealthTracker } from '../../../core/scrapeHealth';
import { AppError, NotFoundError } from '../../../core/errors/AppError';

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
  refreshSource(key: string): Promise<{ status: string }>;
}

/** A recheck runs a full refresh, within the shared scrape limits, that also stores the items. */
export const createSourceHealthController = (
  sources: SalesSource[],
  tracker: SourceHealthTracker,
  refresher: SourceRefresh,
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

    const outcome = await refresher.refreshSource(source.key);

    const health = tracker.get(source.key);
    if (!health) {
      if (outcome.status === 'failed') {
        throw new AppError(`Source ${source.key} could not be reached`, 502);
      }
      throw new NotFoundError('Source health');
    }
    const body: SourceHealthResponse = { data: health };
    return body;
  },
});
