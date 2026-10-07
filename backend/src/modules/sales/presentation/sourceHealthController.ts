/**
 * modules/sales/presentation/sourceHealthController.ts
 *
 * Admin-facing view of scrape source health and an on-demand re-check.
 */

import type { Request, RequestHandler, Response } from 'express';
import type { SalesSource } from '../domain/SalesSource';
import type { SourceHealth, SourceHealthTracker } from '../../../core/scrapeHealth';
import { asyncHandler } from '../../../core/middleware';
import { NotFoundError } from '../../../core/errors/AppError';

export interface SourceHealthListResponse {
  data: SourceHealth[];
}
export interface SourceHealthResponse {
  data: SourceHealth;
}

export interface SourceHealthController {
  listHealth: RequestHandler;
  recheckSource: RequestHandler;
}

export const createSourceHealthController = (
  sources: SalesSource[],
  tracker: SourceHealthTracker,
): SourceHealthController => ({
  listHealth: asyncHandler(async (_req: Request, res: Response) => {
    const body: SourceHealthListResponse = {
      data: tracker.list(
        sources.map((s) => ({ key: s.key, seller: s.seller, kind: 'sales' as const })),
      ),
    };
    res.json(body);
  }),

  recheckSource: asyncHandler(async (req: Request, res: Response) => {
    const source = sources.find((s) => s.key === req.params.key);
    if (!source) throw new NotFoundError('Source');

    await source.fetchPage(1, { bypassCache: true });

    const health = tracker.get(source.key);
    if (!health) throw new NotFoundError('Source health');
    const body: SourceHealthResponse = { data: health };
    res.json(body);
  }),
});
