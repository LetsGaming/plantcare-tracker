/**
 * core/middleware/errorHandler.ts
 *
 * Single, centralized error-handling middleware.
 *
 * V1 problem: controllers called errorResponse() with hardcoded status
 * strings and compared err.message manually.
 *
 * V2 solution: domain errors carry their own statusCode. This middleware
 * is the ONLY place that maps errors to HTTP responses.
 */

import type { Request, Response, NextFunction } from 'express';
import { isAppError, ValidationError } from '../errors';
import { logger } from '../logging/logger';

const isDev = process.env.NODE_ENV !== 'production';

export const globalErrorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  // If headers already sent, we can't respond — just log and bail
  if (res.headersSent) {
    logger.error('Error after headers sent', { err });
    return;
  }

  if (isAppError(err)) {
    // Operational errors (expected domain errors)
    if (err.isOperational) {
      logger.warn(`[${err.name}] ${err.message}`, {
        statusCode: err.statusCode,
        path: req.path,
      });
    } else {
      logger.error(err);
    }

    const body: Record<string, unknown> = {
      error: {
        type: err.name,
        message: err.message,
        statusCode: err.statusCode,
      },
    };

    // Include field-level validation details if present
    if (err instanceof ValidationError && err.fields) {
      body['error'] = { ...body['error'] as object, fields: err.fields };
    }

    if (isDev) {
      (body['error'] as Record<string, unknown>)['stack'] = err.stack;
    }

    res.status(err.statusCode).json(body);
    return;
  }

  // Unknown / programming errors
  logger.error('Unhandled error', { err });

  res.status(500).json({
    error: {
      type: 'InternalServerError',
      message: 'An unexpected error occurred',
      statusCode: 500,
      ...(isDev && { detail: String(err) }),
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
