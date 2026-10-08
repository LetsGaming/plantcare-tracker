import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthUser } from '../auth';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

/** A route handler: its resolved value is sent as the response body. */
export type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

/** An `onRequest` hook; throwing an AppError answers with the error envelope. */
export type Hook = (request: FastifyRequest) => Promise<void>;

/** A numeric route parameter; NaN when it is not a number. */
export const numericParam = (request: FastifyRequest, name: string): number =>
  Number((request.params as Record<string, string | undefined>)[name]);
