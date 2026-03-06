/**
 * modules/sales/presentation/salesRoutes.ts
 *
 * Wires dependencies and registers routes.
 * This is the composition root for the Sales module.
 */

import { Router } from 'express';
import { NodeCacheAdapter } from '../../../core/cache';
import { createAllScrapers } from '../infrastructure/scrapers';
import { createSalesController } from './salesController';

export const createSalesRouter = (): Router => {
  const router = Router();

  // Dependency injection: cache → scrapers → controller
  const cache = new NodeCacheAdapter();
  const sources = createAllScrapers(cache);
  const getSalesData = createSalesController(sources);

  router.get('/', getSalesData);

  return router;
};
