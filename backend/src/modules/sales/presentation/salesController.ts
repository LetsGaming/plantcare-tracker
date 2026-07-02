/**
 * modules/sales/presentation/salesController.ts
 *
 * Thin controller: instantiates the use case and hands the stream
 * lifecycle to the shared SSE endpoint helper (core/sse). Compare to
 * V1, where 150+ lines of business logic lived here — and to the
 * previous V2 iteration, where the abort/done/error plumbing was
 * duplicated between this file and moreInfo.
 */

import type { RequestHandler } from 'express';
import { FetchSalesOverview } from '../application/FetchSalesOverview';
import type { SalesSource } from '../domain/SalesSource';
import { createSseEndpoint } from '../../../core/sse';

/**
 * Factory — sources are injected so the controller is fully testable
 * without any actual HTTP or scraping.
 */
export const createSalesController = (sources: SalesSource[]): RequestHandler => {
  const useCase = new FetchSalesOverview(sources);

  return createSseEndpoint({
    name: 'Sales',
    errorMessage: 'Stream interrupted',
    // No doneMessage: the SseManager default `{ total }` is the sales contract.
    run: ({ sse, isAborted }) =>
      useCase.execute({
        onItems: (items) => sse.sendUnique(items, 'sale_id'),
        isAborted,
      }),
  });
};
