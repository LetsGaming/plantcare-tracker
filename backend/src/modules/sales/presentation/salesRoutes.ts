/**
 * modules/sales/presentation/salesRoutes.ts
 *
 * Wires dependencies and registers routes.
 * This is the composition root for the Sales module.
 */

import type { FastifyPluginAsync } from 'fastify';
import { NodeCacheAdapter } from '../../../core/cache';
import type { CacheService } from '../../../core/cache/CacheService';
import { authenticateToken, isAdmin, makeAuthenticateSSE } from '../../../core/middleware';
import { SourceHealthTracker, SQLiteSourceHealthRepository } from '../../../core/scrapeHealth';
import { createAllScrapers } from '../infrastructure/scrapers';
import type { SalesSource } from '../domain/SalesSource';
import { createSalesController } from './salesController';
import { createSourceHealthController } from './sourceHealthController';

export interface SalesRouterDeps {
  /** Builds the scrape sources; defaults to the nine shop scrapers. */
  createSources?: (cache: CacheService, tracker: SourceHealthTracker) => SalesSource[];
}

export const salesRoutes =
  (deps: SalesRouterDeps = {}): FastifyPluginAsync =>
  async (app) => {
    // Dependency injection: cache + health tracker → scrapers → controllers
    const cache = new NodeCacheAdapter();
    const tracker = new SourceHealthTracker(new SQLiteSourceHealthRepository());
    const sources = (deps.createSources ?? createAllScrapers)(cache, tracker);
    const getSalesData = createSalesController(sources);
    const health = createSourceHealthController(sources, tracker);

    app.get('/health', { onRequest: [authenticateToken, isAdmin] }, health.listHealth);
    app.post(
      '/health/:key/check',
      { onRequest: [authenticateToken, isAdmin] },
      health.recheckSource,
    );
    app.get('/', { onRequest: makeAuthenticateSSE() }, getSalesData);
  };
