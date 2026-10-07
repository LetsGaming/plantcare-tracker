/**
 * modules/sales/presentation/salesRoutes.ts
 *
 * Wires dependencies and registers routes.
 * This is the composition root for the Sales module.
 */

import { Router } from 'express';
import { NodeCacheAdapter } from '../../../core/cache';
import { authenticateToken, isAdmin } from '../../../core/middleware';
import { SourceHealthTracker, SQLiteSourceHealthRepository } from '../../../core/scrapeHealth';
import { createAllScrapers } from '../infrastructure/scrapers';
import { createSalesController } from './salesController';
import { createSourceHealthController } from './sourceHealthController';

export const createSalesRouter = (): Router => {
  const router = Router();

  // Dependency injection: cache + health tracker → scrapers → controllers
  const cache = new NodeCacheAdapter();
  const tracker = new SourceHealthTracker(new SQLiteSourceHealthRepository());
  const sources = createAllScrapers(cache, tracker);
  const getSalesData = createSalesController(sources);
  const health = createSourceHealthController(sources, tracker);

  router.get('/health', authenticateToken, isAdmin, health.listHealth);
  router.post('/health/:key/check', authenticateToken, isAdmin, health.recheckSource);
  router.get('/', getSalesData);

  return router;
};
