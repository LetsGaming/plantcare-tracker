/**
 * modules/sales/presentation/salesController.ts
 *
 * Read side of the sales module. Every handler reads what the background
 * refresher stored; nothing here scrapes.
 */

import type { FastifyRequest } from 'fastify';
import { createSseEndpoint, type SseManager } from '../../../core/sse';
import { decodeCursor, privateRevalidate, type Cursor } from '../../../core/pagination';
import { NotFoundError, ValidationError } from '../../../core/errors/AppError';
import type { Handler } from '../../../core/middleware';
import { Sale, type SaleDto } from '../domain/Sale';
import {
  SALES_CURSOR_TYPES,
  SALES_SORT,
  type PricePoint,
  type SalesRepository,
  type SalesSummary,
} from '../domain/SalesRepository';

export const REPLAY_PAGE_SIZE = 100;

export interface SalesSummaryResponse {
  data: SalesSummary;
}

export interface SaleDetailResponse {
  data: SaleDto & { history: PricePoint[] };
}

export interface ReplayContext {
  sse: Pick<SseManager, 'sendUnique'>;
  isAborted: () => boolean;
}

const yieldToLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Streams every active sale, newest first, one page at a time. */
export const replayActiveSales = async (
  repo: SalesRepository,
  { sse, isAborted }: ReplayContext,
): Promise<void> => {
  let cursor: Cursor | null = null;
  while (!isAborted()) {
    const page = await repo.pageActive({ limit: REPLAY_PAGE_SIZE, cursor });
    if (isAborted()) return;
    await sse.sendUnique(page.items.map(Sale.toDto), 'sale_id');
    if (page.nextCursor === null) return;
    cursor = decodeCursor(page.nextCursor, SALES_SORT, SALES_CURSOR_TYPES);
    await yieldToLoop();
  }
};

const parseSince = (request: FastifyRequest): number => {
  const { since } = request.query as { since?: unknown };
  if (since === undefined) return 0;
  const value = typeof since === 'string' && /^\d+$/.test(since) ? Number(since) : NaN;
  if (!Number.isSafeInteger(value)) {
    throw new ValidationError('since must be a non-negative integer in epoch milliseconds.', {
      since: 'invalid',
    });
  }
  return value;
};

export interface SalesController {
  stream: Handler;
  summary: Handler;
  detail: Handler;
}

export const createSalesController = (repo: SalesRepository): SalesController => ({
  stream: createSseEndpoint({
    name: 'Sales',
    errorMessage: 'Stream interrupted',
    // No doneMessage: the SseManager default `{ total }` is the sales contract.
    run: (ctx) => replayActiveSales(repo, ctx),
  }),

  summary: async (request, reply) => {
    const since = parseSince(request);
    const body: SalesSummaryResponse = { data: await repo.summary(since) };
    privateRevalidate(reply);
    return body;
  },

  detail: async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await repo.findById(id);
    if (!row) throw new NotFoundError('Sale');
    const body: SaleDetailResponse = {
      data: { ...Sale.toDto(row), history: await repo.history(id) },
    };
    privateRevalidate(reply);
    return body;
  },
});
