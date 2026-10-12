/**
 * modules/sales/presentation/salesRoutes.ts
 *
 * Wires dependencies and registers routes.
 * This is the composition root for the Sales module.
 */

import type { FastifyPluginAsync } from 'fastify';
import { NodeCacheAdapter } from '../../../core/cache';
import type { CacheService } from '../../../core/cache/CacheService';
import { getConfig } from '../../../core/config';
import { authenticateToken, isAdmin, makeAuthenticateSSE } from '../../../core/middleware';
import { SourceHealthTracker, SQLiteSourceHealthRepository } from '../../../core/scrapeHealth';
import { createAllScrapers } from '../infrastructure/scrapers';
import { SQLiteSalesRepository } from '../infrastructure/SQLiteSalesRepository';
import { SalesRefresher } from '../application/SalesRefresher';
import type { SalesSource } from '../domain/SalesSource';
import { createSalesController } from './salesController';
import { createSourceHealthController } from './sourceHealthController';

const MINUTE_MS = 60 * 1000;

export interface SalesRouterDeps {
  /** Builds the scrape sources; defaults to the nine shop scrapers. */
  createSources?: (cache: CacheService, tracker: SourceHealthTracker) => SalesSource[];
  /** False keeps the background refresher from starting when the server listens. */
  autoRefresh?: boolean;
  /** Receives the refresher once it is built. */
  onRefresher?: (refresher: SalesRefresher) => void;
  /** Overrides the configured warm-up delay of the refresher. */
  warmDelayMs?: number;
}

export const salesRoutes =
  (deps: SalesRouterDeps = {}): FastifyPluginAsync =>
  async (app) => {
    const config = getConfig().sales;
    const cache = new NodeCacheAdapter();
    const tracker = new SourceHealthTracker(new SQLiteSourceHealthRepository());
    const sources = (deps.createSources ?? createAllScrapers)(cache, tracker);
    const refresher = new SalesRefresher(sources, new SQLiteSalesRepository(), {
      intervalMs: config.refreshIntervalMin * MINUTE_MS,
      warmDelayMs: deps.warmDelayMs ?? config.refreshWarmDelayMs,
      health: tracker,
    });
    deps.onRefresher?.(refresher);

    // onListen, not onReady: `app.inject` tests become ready without listening and must not scrape.
    if (config.refreshEnabled && deps.autoRefresh !== false) {
      app.addHook('onListen', async () => {
        await refresher.start();
      });
    }
    app.addHook('onClose', async () => {
      await refresher.stop();
    });

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
