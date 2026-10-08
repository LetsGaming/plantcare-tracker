/**
 * core/middleware/requestId.ts
 *
 * Gives every request an id and keeps it, with the request's origin, in
 * AsyncLocalStorage so the logger can include it automatically and image
 * urls can be built from the origin the client used.
 *
 * The id is returned in the `X-Request-Id` response header so clients and
 * monitoring tools can correlate requests end to end. A caller-supplied id
 * is honored only when it is short and made of safe characters.
 */

import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requestContext } from '../logging/logger';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export const generateRequestId = (request: { headers: Record<string, unknown> }): string => {
  const supplied = request.headers['x-request-id'];
  return typeof supplied === 'string' && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
};

const originOf = (request: FastifyRequest): string =>
  `${request.protocol}://${request.headers.host ?? request.hostname}`;

export const registerRequestContext = (app: FastifyInstance): void => {
  app.addHook('onRequest', (request, reply, done) => {
    void reply.header('X-Request-Id', request.id);
    requestContext.run(
      {
        requestId: request.id,
        method: request.method,
        path: request.url.split('?')[0],
        origin: originOf(request),
      },
      done,
    );
  });
};
