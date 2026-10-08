/**
 * modules/moreInfo/presentation/moreInfoRoutes.ts
 *
 * Composition root for the plant-information SSE endpoint. The route
 * is thin wiring only: SSE-ticket auth, the shared stream lifecycle
 * from core/sse, and the StreamPlantInfo use case doing the work.
 */

import type { FastifyPluginAsync } from 'fastify';
import { NodeCacheAdapter } from '../../../core/cache';
import { createLimiter, makeAuthenticateSSE, perUserKey } from '../../../core/middleware';
import { USER_RATE_LIMIT } from '../../../core/config';
import { SourceHealthTracker, SQLiteSourceHealthRepository } from '../../../core/scrapeHealth';
import { createSseEndpoint } from '../../../core/sse';
import { OpenAIPlantClient } from '../infrastructure/OpenAIClient';
import { createPlantLinkSearchers } from '../infrastructure/PlantLinkSearchers';
import { StreamPlantInfoUseCase, parsePlantInfoQuery } from '../application/StreamPlantInfo';
import type { PlantGuideStreamer, PlantInfoRequest, PlantLinkSearcher } from '../domain/PlantInfo';

/** AI care guides are cached for 12 hours (matches V1). */
const AI_GUIDE_CACHE_TTL_SECONDS = 43_200;

export interface MoreInfoRouterDeps {
  /** Replaces the OpenAI care-guide client. */
  guideStreamer?: PlantGuideStreamer;
  /** Replaces the plant link searchers. */
  linkSearchers?: PlantLinkSearcher[];
}

export const moreInfoRoutes =
  (deps: MoreInfoRouterDeps = {}): FastifyPluginAsync =>
  async (app) => {
    const aiStreamLimiter = createLimiter(app, {
      windowMs: USER_RATE_LIMIT.WINDOW_MS,
      max: USER_RATE_LIMIT.MAX_AI_STREAMS,
      key: perUserKey,
    });

    const cache = new NodeCacheAdapter(AI_GUIDE_CACHE_TTL_SECONDS);
    const aiClient = deps.guideStreamer ?? new OpenAIPlantClient(cache);
    const health = new SourceHealthTracker(new SQLiteSourceHealthRepository());
    const searchers = deps.linkSearchers ?? createPlantLinkSearchers(cache, health);
    const useCase = new StreamPlantInfoUseCase(aiClient, searchers);

    app.get(
      '/',
      { onRequest: makeAuthenticateSSE({ loadUserFromDb: true }), preHandler: [aiStreamLimiter] },
      createSseEndpoint<PlantInfoRequest>({
        name: 'MoreInfo',
        errorMessage: 'Information stream interrupted',
        doneMessage: () => ({ status: 'completed' }),
        prepare: (req) => parsePlantInfoQuery(req.query, req.headers['accept-language']),
        run: ({ sse, isAborted }, request) =>
          useCase.execute({
            request,
            isAborted,
            onEvent: (event) => sse.send(event),
          }),
      }),
    );
  };
