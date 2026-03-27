/**
 * core/middleware/errorHandler.ts
 *
 * Single, centralized error-handling middleware.
 *
 * Logging design:
 *  - Operational AppErrors (4xx) → logger.warn  — expected domain errors,
 *      route context only, no stack. These are the client's problem.
 *  - Non-operational AppErrors (5xx) → logger.error with the Error object
 *      so format.errors() can extract the full stack into error.log.
 *  - Unknown / programming errors → logger.error with full serialized
 *      context: message, stack, SQLite code/offset, method+path.
 *      Request body is included in dev only — never logged in prod.
 *
 * Client response design:
 *  - prod: minimal — type, message, statusCode only. No internals leak.
 *  - dev:  adds detail, sqliteCode, stack for faster local debugging.
 *
 * Why serializeError() instead of passing the Error directly?
 *   Winston's format.errors() extracts stacks from Errors passed as the
 *   first argument, but better-sqlite3 errors carry extra fields (code,
 *   offset) that need explicit extraction. serializeError() handles both.
 */

import type { Request, Response, NextFunction } from 'express';
import { isAppError, ValidationError } from '../errors';
import { logger } from '../logging/logger';

const isDev = process.env.NODE_ENV !== 'production';

/** Pull every useful field out of an unknown thrown value into a plain object. */
function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const out: Record<string, unknown> = {
      errorType: err.constructor.name,
      message: err.message,
      stack: err.stack,
    };
    // better-sqlite3 / SQLite-specific fields
    const e = err as Error & { code?: string; offset?: number };
    if (e.code)   out['sqliteCode']   = e.code;
    if (e.offset) out['sqliteOffset'] = e.offset;
    return out;
  }
  // Thrown non-Error values (rare, but defensible)
  return { thrownValue: String(err) };
}

export const globalErrorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  // If headers already sent, we can't respond — just log and bail
  if (res.headersSent) {
    const errData = serializeError(err);
    logger.error('Error after headers already sent', {
      ...errData,
      method: req.method,
      path: req.path,
    });
    return;
  }

  if (isAppError(err)) {
    const logCtx = {
      statusCode: err.statusCode,
      method: req.method,
      path: req.path,
    };

    if (err.isOperational) {
      // Expected domain errors (4xx) — warn level, no stack needed.
      // These are the client's fault; they don't warrant server-side noise.
      logger.warn(`[${err.name}] ${err.message}`, logCtx);
    } else {
      // Non-operational AppErrors (5xx) — full error with stack
      logger.error(`[${err.name}] ${err.message}`, {
        ...logCtx,
        // Pass stack explicitly so it reaches error.log via serializeError
        ...serializeError(err),
      });
    }

    const body: Record<string, unknown> = {
      error: {
        type: err.name,
        message: err.message,
        statusCode: err.statusCode,
      },
    };

    if (err instanceof ValidationError && err.fields) {
      body['error'] = { ...body['error'] as object, fields: err.fields };
    }

    // Stack only exposed in dev — never leak internals to prod clients
    if (isDev) {
      (body['error'] as Record<string, unknown>)['stack'] = err.stack;
    }

    res.status(err.statusCode).json(body);
    return;
  }

  // ── Unknown / programming errors ────────────────────────────────────────────
  const errData = serializeError(err);

  logger.error(`Unhandled error on ${req.method} ${req.path}`, {
    ...errData,
    method: req.method,
    path: req.path,
    // Body aids debugging in dev. Must never be logged in prod:
    // it can contain passwords, tokens, or PII.
    ...(isDev && { body: req.body }),
  });

  res.status(500).json({
    error: {
      type: 'InternalServerError',
      message: 'An unexpected error occurred',
      statusCode: 500,
      // In dev, expose internals for faster debugging.
      // In prod, the client gets nothing actionable — check error.log instead.
      ...(isDev && {
        detail: errData['message'],
        sqliteCode: errData['sqliteCode'],
        stack: errData['stack'],
      }),
    },
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: {
      type: 'NotFoundError',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      statusCode: 404,
    },
  });
};
