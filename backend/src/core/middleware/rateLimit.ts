/**
 * core/middleware/rateLimit.ts
 *
 * Fixed-window rate limits as hooks. Several limiters can guard one route,
 * each with its own bucket. Rejections are thrown as TooManyRequestsError so
 * clients get the standard error envelope (429). Use the limiters in
 * `preHandler`, after authentication and body parsing, so keys can use the
 * authenticated user and the parsed body.
 */

import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { TooManyRequestsError } from '../errors';
import type { Hook } from './types';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Bucket key; defaults to the client IP. */
  key?: (request: FastifyRequest) => string | undefined;
}

/** Registers the plugin; it adds no limits by itself. */
export const registerRateLimit = async (app: FastifyInstance): Promise<void> => {
  await app.register(rateLimit, { global: false });
};

export const createLimiter = (app: FastifyInstance, options: RateLimitOptions): Hook => {
  const check = app.createRateLimit({
    max: options.max,
    timeWindow: options.windowMs,
    keyGenerator: (request) => options.key?.(request) ?? request.ip,
  });
  return async (request) => {
    const result = await check(request);
    if (!result.isAllowed && result.isExceeded) throw new TooManyRequestsError();
  };
};

/** One bucket per authenticated user; falls back to the IP when none is attached. */
export const perUserKey = (request: FastifyRequest): string | undefined =>
  request.user ? `user:${request.user.id}` : undefined;
