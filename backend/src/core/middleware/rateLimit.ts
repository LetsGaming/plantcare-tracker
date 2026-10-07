/**
 * core/middleware/rateLimit.ts
 *
 * Shared rate-limiter factory. Rejections go through the central error
 * handler so clients always receive the standard error envelope (429).
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';
import { TooManyRequestsError } from '../errors';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Bucket key; defaults to the client IP. */
  key?: (req: Request) => string | undefined;
}

export const createRateLimiter = ({ windowMs, max, key }: RateLimitOptions): RequestHandler =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => key?.(req) ?? ipKeyGenerator(req.ip ?? ''),
    handler: (_req, _res, next) => next(new TooManyRequestsError()),
  });

/** One bucket per authenticated user; falls back to the IP when none is attached. */
export const perUserKey = (req: Request): string | undefined =>
  req.user ? `user:${req.user.id}` : undefined;
