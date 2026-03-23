/**
 * modules/moreInfo/presentation/moreInfoRoutes.ts
 *
 * SSE endpoint: streams AI care guide + plant links in parallel.
 * Thin controller: orchestration logic lives in the use case,
 * SSE plumbing is handled by the shared SseManager.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { NodeCacheAdapter } from '../../../core/cache';
import { makeAuthenticateSSE } from '../../../core/middleware';
import { OpenAIPlantClient } from '../infrastructure/OpenAIClient';
import { createPlantLinkSearchers } from '../infrastructure/PlantLinkSearchers';
import { SseManager } from '../../sales/presentation/SseManager';
import { createModuleLogger } from '../../../core/logging';


const log = createModuleLogger('MoreInfoRoutes');

export const createMoreInfoRouter = (_pool?: unknown): Router => {
  const router = Router();
  const authenticateSSE = makeAuthenticateSSE();

  // Shared cache: 12h TTL for AI responses (same as V1)
  const cache = new NodeCacheAdapter(43_200);
  const aiClient = new OpenAIPlantClient(cache);
  const searchers = createPlantLinkSearchers(cache);

  router.get('/', authenticateSSE, async (req: Request, res: Response) => {
    const { plantName, htmlFormatting, lang } = req.query as Record<string, string | undefined>;

    if (!plantName) {
      res.status(400).json({ error: { message: 'plantName query parameter is required.', statusCode: 400 } });
      return;
    }

    const cleanedName = plantName
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/[^a-zA-Z0-9 ]/g, '');

    const targetLanguage = lang ?? req.headers['accept-language']?.split(',')[0] ?? 'en';
    let isAborted = false;

    req.on('close', () => { isAborted = true; });

    const sse = new SseManager(res);

    try {
      // Run AI stream and link scrapers in parallel
      const linksPromise = Promise.allSettled(
        searchers.map(async (searcher) => {
          if (isAborted) return;
          const link = await searcher(cleanedName);
          if (link && !isAborted) {
            await sse.send({ type: 'link', value: link });
          }
        }),
      );

      const aiPromise = aiClient.streamPlantCare(
        cleanedName,
        htmlFormatting === 'true',
        async (chunk) => {
          if (!isAborted) await sse.send({ type: 'ai_chunk', value: chunk });
        },
        targetLanguage,
      );

      await Promise.all([linksPromise, aiPromise]);

      if (!isAborted) await sse.end({ status: 'completed' });
    } catch (err: unknown) {
      log.error(`MoreInfo SSE error: ${(err as Error).message}`);
      if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: 'Information stream interrupted' })}\n\n`);
        res.end();
      }
    }
  });

  return router;
};
