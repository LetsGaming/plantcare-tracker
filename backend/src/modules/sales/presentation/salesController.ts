/**
 * modules/sales/presentation/salesController.ts
 *
 * Thin controller. Its only job:
 *   1. Set up SSE
 *   2. Instantiate and run the use case
 *   3. Close the stream
 *
 * Compare to V1: the controller had 150+ lines of business logic.
 * This file is ~35 lines.
 */

import type { Request, Response } from 'express';
import { FetchSalesOverview } from '../application/FetchSalesOverview';
import { SseManager } from './SseManager';
import type { SalesSource } from '../domain/SalesSource';
import { createModuleLogger } from '../../../core/logging';

const log = createModuleLogger('SalesController');

/**
 * Factory — sources are injected so the controller is fully testable
 * without any actual HTTP or scraping.
 */
export const createSalesController = (sources: SalesSource[]) => {
  const useCase = new FetchSalesOverview(sources);

  return async (req: Request, res: Response): Promise<void> => {
    const sse = new SseManager(res);
    let isAborted = false;

    req.on('close', () => {
      isAborted = true;
    });

    try {
      await useCase.execute({
        onItems: (items) => sse.sendUnique(items, 'sale_id'),
        isAborted: () => isAborted,
      });

      if (!isAborted) {
        await sse.end();
      }
    } catch (err: unknown) {
      log.error(`SSE stream error: ${(err as Error).message}`);
      if (!res.writableEnded) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: 'Stream interrupted' })}\n\n`,
        );
        res.end();
      }
    }
  };
};
