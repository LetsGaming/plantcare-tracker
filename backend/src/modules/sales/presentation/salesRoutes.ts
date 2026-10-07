/**
 * modules/sales/presentation/salesRoutes.ts
 *
 * Wires dependencies and registers routes.
 * This is the composition root for the Sales module.
 */

import { Router } from 'express';
import { NodeCacheAdapter } from '../../../core/cache';
import type { CacheService } from '../../../core/cache/CacheService';
import { authenticateToken, isAdmin } from '../../../core/middleware';
import { SourceHealthTracker, SQLiteSourceHealthRepository } from '../../../core/scrapeHealth';
import { createAllScrapers } from '../infrastructure/scrapers';
import type { SalesSource } from '../domain/SalesSource';
import { createSalesController } from './salesController';
import { createSourceHealthController } from './sourceHealthController';

export interface SalesRouterDeps {
  /** Builds the scrape sources; defaults to the nine shop scrapers. */
  createSources?: (cache: CacheService, tracker: SourceHealthTracker) => SalesSource[];
}

export const createSalesRouter = (deps: SalesRouterDeps = {}): Router => {
  const router = Router();

  // Dependency injection: cache + health tracker → scrapers → controllers
  const cache = new NodeCacheAdapter();
  const tracker = new SourceHealthTracker(new SQLiteSourceHealthRepository());
  const sources = (deps.createSources ?? createAllScrapers)(cache, tracker);
  const getSalesData = createSalesController(sources);
  const health = createSourceHealthController(sources, tracker);

  router.get('/health', authenticateToken, isAdmin, health.listHealth);
  router.post('/health/:key/check', authenticateToken, isAdmin, health.recheckSource);
  router.get('/', getSalesData);

  return router;
};
