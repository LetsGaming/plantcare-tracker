/**
 * core/pagination/envelope.ts
 *
 * Response shape and cache policy shared by list endpoints.
 */

import type { FastifyReply } from 'fastify';
import type { Page } from './keyset';

export interface ListEnvelope<T> {
  data: {
    items: T[];
    next_cursor: string | null;
    total?: number;
  };
}

/** `total` belongs on the first page only; pass undefined for later pages. */
export const toEnvelope = <T>(page: Page<T>, total?: number): ListEnvelope<T> => ({
  data: {
    items: page.items,
    next_cursor: page.nextCursor,
    ...(total === undefined ? {} : { total }),
  },
});

/** User-specific data the client may keep but must revalidate (ETag) before reuse. */
export const privateRevalidate = (reply: FastifyReply): FastifyReply =>
  reply.header('Cache-Control', 'private, no-cache');
