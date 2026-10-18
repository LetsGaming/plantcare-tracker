/**
 * src/app.ts
 *
 * Builds the Fastify application: plugins, hooks, routes, health probes and
 * the error pipeline. It performs no I/O at import time and does not listen;
 * server.ts owns process concerns (env loading, database open, listen,
 * shutdown) so tests can build the same app and drive it with `inject`.
 */

import fs from 'fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import etag from '@fastify/etag';
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
import { startVariantBackfill } from './modules/images';
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
const COMPRESS_THRESHOLD_BYTES = 1024;
const CORS_PREFLIGHT_MAX_AGE_S = 600;
/** A stored upload is never rewritten under the same file name, so a URL never changes meaning. */
const UPLOADS_MAX_AGE = '365d';
const LOOP_DELAY_RESOLUTION_MS = 20;
const LOOP_DELAY_WINDOW_MS = 60_000;
const NS_PER_MS = 1e6;
const BYTES_PER_MB = 1024 * 1024;

const toMs = (ns: number): number => Math.round((ns / NS_PER_MS) * 100) / 100;

export const buildApp = async (deps: AppDeps = {}): Promise<FastifyInstance> => {
  const { isProduction, allowedOrigins, trustProxyHops } = getConfig();

  const app = Fastify({
    // Trust exactly the configured number of upstream proxies: `true` would
    // trust all hops and let clients spoof X-Forwarded-For, bypassing IP rate
    // limits. A plain number is not used because Fastify treats it as "trust
    // nothing".
    trustProxy: trustProxyHops > 0 ? (_address, hop) => hop < trustProxyHops : false,
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
    maxAge: CORS_PREFLIGHT_MAX_AGE_S,
  });
  // etag must hash the uncompressed body, so its onSend hook is registered
  // before compress. SSE replies are hijacked and never pass onSend; the
  // default compressible types also exclude text/event-stream.
  await app.register(etag, { weak: true });
  await app.register(compress, {
    global: true,
    encodings: ['br', 'gzip'],
    threshold: COMPRESS_THRESHOLD_BYTES,
    globalDecompression: false,
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
    cacheControl: true,
    maxAge: UPLOADS_MAX_AGE,
    immutable: true,
  });

  // API version prefix (/api/vX) resolved once in core/config: the auth
  // module uses the same resolver to scope its refresh-token cookie.
  const versionPath = getApiVersionPath();
  const V = getApiBasePath();

  // Guests are read-only everywhere: one rule on the prefix, not one per route.
  app.addHook('onRequest', makeGuestReadOnly(V));

  const recognition = createRecognition(deps.recognition ?? {}, app.log);

  await app.register(authRoutes, { prefix: `${V}/auth` });
  await app.register(salesRoutes(deps.sales), { prefix: `${V}/sales` });
  await app.register(plantsRoutes, { prefix: `${V}/plants` });
  await app.register(wateringRoutes, { prefix: `${V}/watering` });
  await app.register(substrateRoutes, { prefix: `${V}/substrates` });
  await app.register(componentRoutes, { prefix: `${V}/components` });
  await app.register(
    imageRoutes({
      onImageStored: recognition.onImageStored,
      onImageRemoved: recognition.onImageRemoved,
    }),
    {
      prefix: `${V}/images`,
    },
  );
  await app.register(moreInfoRoutes(deps.moreInfo), { prefix: `${V}/more-info` });
  await app.register(recognitionRoutes(recognition), { prefix: `${V}/recognition` });

  startVariantBackfill(app);

  // Heavy services start once the port is open, so the app serves while they warm up.
  app.addHook('onListen', async () => {
    void recognition.load();
  });

  const loopDelay = monitorEventLoopDelay({ resolution: LOOP_DELAY_RESOLUTION_MS });
  loopDelay.enable();
  const readLoopDelay = () => ({
    p50_ms: toMs(loopDelay.percentile(50)),
    p99_ms: toMs(loopDelay.percentile(99)),
    max_ms: toMs(loopDelay.max),
  });
  let lastWindow: ReturnType<typeof readLoopDelay> | null = null;
  const windowTimer = setInterval(() => {
    lastWindow = readLoopDelay();
    loopDelay.reset();
  }, LOOP_DELAY_WINDOW_MS);
  windowTimer.unref();
  app.addHook('onClose', async () => {
    clearInterval(windowTimer);
    loopDelay.disable();
  });

  app.get(`${V}/health`, async (_request, reply) => {
    try {
      // Synchronous ping: better-sqlite3 throws immediately if the DB is closed
      getSqlite().prepare('SELECT 1').get();
      const uptimeSeconds = process.uptime();
      const d = Math.floor(uptimeSeconds / 86400);
      const h = Math.floor((uptimeSeconds % 86400) / 3600);
      const m = Math.floor((uptimeSeconds % 3600) / 60);
      const s = Math.floor(uptimeSeconds % 60);

      const loop = lastWindow ?? readLoopDelay();

      return {
        status: 'ok',
        uptime: `${d}d ${h}h ${m}m ${s}s`,
        uptime_s: Math.floor(uptimeSeconds),
        db: 'connected',
        version: versionPath,
        event_loop_delay: loop,
        rss_mb: Math.round((process.memoryUsage.rss() / BYTES_PER_MB) * 10) / 10,
      };
    } catch (err) {
      logger.error('Health check failed', { err });
      return reply.code(503).send({ status: 'error', db: 'disconnected' });
    }
  });

  app.get(`${V}/health/ready`, async (_request, reply) => {
    try {
      getSqlite().prepare('SELECT 1').get();
    } catch {
      return reply.code(503).send({ ready: false });
    }
    if (!recognition.ready) return reply.code(503).send({ ready: false });
    return { ready: true };
  });

  return app;
};
