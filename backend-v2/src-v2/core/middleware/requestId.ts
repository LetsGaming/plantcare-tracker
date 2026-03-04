/**
 * core/middleware/requestId.ts
 *
 * Assigns a unique ID to every incoming HTTP request and stores it in
 * AsyncLocalStorage so the logger can include it automatically.
 *
 * The ID is also returned in the `X-Request-Id` response header so
 * clients and monitoring tools can correlate requests end-to-end.
 */

import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { requestContext } from '../logging/logger';

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const requestId =
    (req.headers['x-request-id'] as string | undefined) ?? randomUUID();

  res.setHeader('X-Request-Id', requestId);

  requestContext.run({ requestId, method: req.method, path: req.path }, next);
};
