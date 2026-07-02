/**
 * modules/moreInfo/presentation/moreInfoRoutes.ts
 *
 * Composition root for the plant-information SSE endpoint. The route
 * is thin wiring only: SSE-ticket auth, the shared stream lifecycle
 * from core/sse, and the StreamPlantInfo use case doing the work.
 */

import { Router } from 'express';
import { NodeCacheAdapter } from '../../../core/cache';
import { makeAuthenticateSSE } from '../../../core/middleware';
import { createSseEndpoint } from '../../../core/sse';
import { OpenAIPlantClient } from '../infrastructure/OpenAIClient';
import { createPlantLinkSearchers } from '../infrastructure/PlantLinkSearchers';
import {
  StreamPlantInfoUseCase,
  parsePlantInfoQuery,
} from '../application/StreamPlantInfo';
import type { PlantInfoRequest } from '../domain/PlantInfo';

/** AI care guides are cached for 12 hours (matches V1). */
const AI_GUIDE_CACHE_TTL_SECONDS = 43_200;

export const createMoreInfoRouter = (): Router => {
  const router = Router();

  const cache = new NodeCacheAdapter(AI_GUIDE_CACHE_TTL_SECONDS);
  const aiClient = new OpenAIPlantClient(cache);
  const searchers = createPlantLinkSearchers(cache);
  const useCase = new StreamPlantInfoUseCase(aiClient, searchers);

  router.get(
    '/',
    makeAuthenticateSSE({ loadUserFromDb: true }),
    createSseEndpoint<PlantInfoRequest>({
      name: 'MoreInfo',
      errorMessage: 'Information stream interrupted',
      doneMessage: () => ({ status: 'completed' }),
      prepare: (req) =>
        parsePlantInfoQuery(req.query, req.headers['accept-language']),
      run: ({ sse, isAborted }, request) =>
        useCase.execute({
          request,
          isAborted,
          onEvent: (event) => sse.send(event),
        }),
    }),
  );

  return router;
};
