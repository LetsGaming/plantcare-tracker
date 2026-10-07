/**
 * src/app.ts
 *
 * Builds the Express application: middleware, routers, health probes and
 * the error pipeline. It performs no I/O at import time and does not listen;
 * server.ts owns process concerns (env loading, database open, listen,
 * shutdown) so tests can build the same app without a socket.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import { getSqlite } from './core/database/db';
import {
  requestIdMiddleware,
  globalErrorHandler,
  notFoundHandler,
  guestReadOnly,
} from './core/middleware';
import { logger } from './core/logging';
import {
  getApiBasePath,
  getApiVersionPath,
  getConfig,
  getUploadsDirectory,
  STATIC_UPLOADS_ROUTE,
} from './core/config';

import { createAuthRouter } from './modules/auth/presentation/authRoutes';
import { createSalesRouter } from './modules/sales/presentation/salesRoutes';
import type { SalesRouterDeps } from './modules/sales/presentation/salesRoutes';
import { createPlantsRouter } from './modules/plants/presentation/plantsRoutes';
import { createWateringRouter } from './modules/watering/presentation/wateringRoutes';
import { createSubstrateRouter } from './modules/substrate/presentation/substrateRoutes';
import { createComponentRouter } from './modules/components/presentation/componentRoutes';
import { createImageRouter } from './modules/images/presentation/imageRoutes';
import { createMoreInfoRouter } from './modules/moreInfo/presentation/moreInfoRoutes';
import type { MoreInfoRouterDeps } from './modules/moreInfo/presentation/moreInfoRoutes';

export interface AppDeps {
  /** Replaces the scraper set of the sales module. */
  sales?: SalesRouterDeps;
  /** Replaces the AI client and link searchers of the more-info module. */
  moreInfo?: MoreInfoRouterDeps;
}

export const createApp = (deps: AppDeps = {}): express.Express => {
  const app = express();
  const { isProduction, allowedOrigins } = getConfig();

  app.set('trust proxy', 1); // trust exactly one upstream proxy (e.g. nginx);
  // "true" would trust all hops and let clients spoof X-Forwarded-For,
  // bypassing IP-based rate limiting

  app.use(
    cors({
      origin: (origin, cb) => {
        const isLocalhost =
          !isProduction && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin ?? '');
        if (!origin || isLocalhost || allowedOrigins.includes(origin)) cb(null, true);
        else cb(null, false);
      },
      credentials: true,
    }),
  );

  // Non-strict so a bare JSON `null` body is accepted like an empty one.
  app.use(express.json({ strict: false }));
  app.use(cookieParser());
  app.use(requestIdMiddleware);

  // Uploaded images are served statically; the directory and route prefix
  // come from core/config so the images module builds matching URLs.
  app.use(STATIC_UPLOADS_ROUTE, express.static(getUploadsDirectory()));

  // API version prefix (/api/vX) resolved once in core/config: the auth
  // module uses the same resolver to scope its refresh-token cookie.
  const versionPath = getApiVersionPath();
  const V = getApiBasePath();

  // Guests are read-only everywhere: one rule on the prefix, not one per route.
  app.use(V, guestReadOnly);

  // Routes: each router is its own composition root
  app.use(`${V}/auth`, createAuthRouter());
  app.use(`${V}/sales`, createSalesRouter(deps.sales));
  app.use(`${V}/plants`, createPlantsRouter());
  app.use(`${V}/watering`, createWateringRouter());
  app.use(`${V}/substrates`, createSubstrateRouter());
  app.use(`${V}/components`, createComponentRouter());
  app.use(`${V}/images`, createImageRouter());
  app.use(`${V}/more-info`, createMoreInfoRouter(deps.moreInfo));

  app.get(`${V}/health`, (_req, res) => {
    try {
      // Synchronous ping: better-sqlite3 throws immediately if the DB is closed
      getSqlite().prepare('SELECT 1').get();
      const uptimeSeconds = process.uptime();
      const d = Math.floor(uptimeSeconds / 86400);
      const h = Math.floor((uptimeSeconds % 86400) / 3600);
      const m = Math.floor((uptimeSeconds % 3600) / 60);
      const s = Math.floor(uptimeSeconds % 60);

      res.json({
        status: 'ok',
        uptime: `${d}d ${h}h ${m}m ${s}s`,
        uptime_s: Math.floor(uptimeSeconds),
        db: 'connected',
        version: versionPath,
      });
    } catch (err) {
      logger.error('Health check failed', { err });
      res.status(503).json({ status: 'error', db: 'disconnected' });
    }
  });

  app.get(`${V}/health/ready`, (_req, res) => {
    try {
      getSqlite().prepare('SELECT 1').get();
      res.json({ ready: true });
    } catch {
      res.status(503).json({ ready: false });
    }
  });

  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
};
