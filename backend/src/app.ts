/**
 * src/app.ts
 *
 * Builds the Fastify application: plugins, hooks, routes, health probes and
 * the error pipeline. It performs no I/O at import time and does not listen;
 * server.ts owns process concerns (env loading, database open, listen,
 * shutdown) so tests can build the same app and drive it with `inject`.
 */

import fs from 'fs';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';

import { getSqlite } from './core/database/db';
import {
  generateRequestId,
  globalErrorHandler,
  makeGuestReadOnly,
  notFoundHandler,
  registerRateLimit,
  registerRequestContext,
} from './core/middleware';
import { ValidationError } from './core/errors';
import { logger } from './core/logging';
import {
  getApiBasePath,
  getApiVersionPath,
  getConfig,
  getUploadsDirectory,
  STATIC_UPLOADS_ROUTE,
} from './core/config';

import { authRoutes } from './modules/auth/presentation/authRoutes';
import { salesRoutes } from './modules/sales/presentation/salesRoutes';
import type { SalesRouterDeps } from './modules/sales/presentation/salesRoutes';
import { plantsRoutes } from './modules/plants/presentation/plantsRoutes';
import { wateringRoutes } from './modules/watering/presentation/wateringRoutes';
import { substrateRoutes } from './modules/substrate/presentation/substrateRoutes';
import { componentRoutes } from './modules/components/presentation/componentRoutes';
import { imageRoutes } from './modules/images/presentation/imageRoutes';
import { createRecognition, recognitionRoutes } from './modules/recognition';
import type { RecognitionDeps } from './modules/recognition';
import { moreInfoRoutes } from './modules/moreInfo/presentation/moreInfoRoutes';
import type { MoreInfoRouterDeps } from './modules/moreInfo/presentation/moreInfoRoutes';

export interface AppDeps {
  /** Replaces the scraper set of the sales module. */
  sales?: SalesRouterDeps;
  /** Replaces the AI client and link searchers of the more-info module. */
  moreInfo?: MoreInfoRouterDeps;
  /** Replaces the plant image embedder; null turns recognition off. */
  recognition?: RecognitionDeps;
}

const JSON_BODY_LIMIT_BYTES = 100 * 1024;

export const buildApp = async (deps: AppDeps = {}): Promise<FastifyInstance> => {
  const { isProduction, allowedOrigins } = getConfig();

  const app = Fastify({
    // Trust exactly one upstream proxy (e.g. nginx): `true` would trust all
    // hops and let clients spoof X-Forwarded-For, bypassing IP rate limits.
    trustProxy: (_address, hop) => hop < 1,
    genReqId: generateRequestId,
    // The router is case- and trailing-slash-insensitive, like Express was.
    routerOptions: { caseSensitive: false, ignoreTrailingSlash: true },
    bodyLimit: JSON_BODY_LIMIT_BYTES,
  });

  app.setErrorHandler(globalErrorHandler);
  app.setNotFoundHandler(notFoundHandler);

  // An empty or `null` JSON body counts as no body, so bodyless POSTs that
  // declare application/json (what the UI sends) reach their handler.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string', bodyLimit: JSON_BODY_LIMIT_BYTES },
    (_request, body, done) => {
      const text = typeof body === 'string' ? body.trim() : '';
      if (!text) return done(null, undefined);
      try {
        done(null, JSON.parse(text));
      } catch {
        done(new ValidationError('Request body is malformed.'), undefined);
      }
    },
  );
  // Any other content type carries no usable body.
  app.addContentTypeParser('*', (_request, _payload, done) => done(null, undefined));

  await app.register(cors, {
    origin: (origin, cb) => {
      const isLocalhost =
        !isProduction && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin ?? '');
      cb(null, !origin || isLocalhost || allowedOrigins.includes(origin));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(cookie);
  await registerRateLimit(app);
  registerRequestContext(app);

  // Uploaded images are served statically; the directory and route prefix
  // come from core/config so the images module builds matching URLs.
  fs.mkdirSync(getUploadsDirectory(), { recursive: true });
  await app.register(fastifyStatic, {
    root: getUploadsDirectory(),
    prefix: `${STATIC_UPLOADS_ROUTE}/`,
    decorateReply: false,
  });

  // API version prefix (/api/vX) resolved once in core/config: the auth
  // module uses the same resolver to scope its refresh-token cookie.
  const versionPath = getApiVersionPath();
  const V = getApiBasePath();

  // Guests are read-only everywhere: one rule on the prefix, not one per route.
  app.addHook('onRequest', makeGuestReadOnly(V));

  const recognition = await createRecognition(deps.recognition ?? {}, app.log);

  await app.register(authRoutes, { prefix: `${V}/auth` });
  await app.register(salesRoutes(deps.sales), { prefix: `${V}/sales` });
  await app.register(plantsRoutes, { prefix: `${V}/plants` });
  await app.register(wateringRoutes, { prefix: `${V}/watering` });
  await app.register(substrateRoutes, { prefix: `${V}/substrates` });
  await app.register(componentRoutes, { prefix: `${V}/components` });
  await app.register(imageRoutes({ onImageStored: recognition.onImageStored }), {
    prefix: `${V}/images`,
  });
  await app.register(moreInfoRoutes(deps.moreInfo), { prefix: `${V}/more-info` });
  await app.register(recognitionRoutes(recognition), { prefix: `${V}/recognition` });

  app.get(`${V}/health`, async (_request, reply) => {
    try {
      // Synchronous ping: better-sqlite3 throws immediately if the DB is closed
      getSqlite().prepare('SELECT 1').get();
      const uptimeSeconds = process.uptime();
      const d = Math.floor(uptimeSeconds / 86400);
      const h = Math.floor((uptimeSeconds % 86400) / 3600);
      const m = Math.floor((uptimeSeconds % 3600) / 60);
      const s = Math.floor(uptimeSeconds % 60);

      return {
        status: 'ok',
        uptime: `${d}d ${h}h ${m}m ${s}s`,
        uptime_s: Math.floor(uptimeSeconds),
        db: 'connected',
        version: versionPath,
      };
    } catch (err) {
      logger.error('Health check failed', { err });
      return reply.code(503).send({ status: 'error', db: 'disconnected' });
    }
  });

  app.get(`${V}/health/ready`, async (_request, reply) => {
    try {
      getSqlite().prepare('SELECT 1').get();
      return { ready: true };
    } catch {
      return reply.code(503).send({ ready: false });
    }
  });

  return app;
};
