/**
 * modules/moreInfo/application/StreamPlantInfo.ts
 *
 * The orchestration use case for the plant-information stream — the
 * one the route file's header used to claim existed. It owns:
 *
 *  - query validation (plant name required, formatting/language flags)
 *  - the plant-name cleaning rule (strip parentheses + specials)
 *  - running the AI care-guide stream and all link searchers in
 *    parallel, forwarding results as typed events
 *  - respecting the abort signal so a disconnected client stops
 *    producing work
 *
 * It knows nothing about HTTP or SSE: events go to an injected
 * callback, cancellation comes from an injected predicate.
 */

import { z } from 'zod';
import type {
  PlantGuideStreamer,
  PlantLinkSearcher,
  PlantInfoRequest,
  PlantInfoEvent,
} from '../domain/PlantInfo';
import { parseOrThrow } from '../../../core/validation';

// ── Input schema ──────────────────────────────────────────────────────────────

/** No real plant name exceeds this; the cap bounds per-request AI cost. */
const MAX_PLANT_NAME_LENGTH = 100;
/** RFC 5646 recommends 35 chars as a safe language-tag buffer size. */
const MAX_LANGUAGE_TAG_LENGTH = 35;

const PlantInfoQuerySchema = z.object({
  plantName: z
    .string()
    .min(1, 'plantName query parameter is required.')
    .max(
      MAX_PLANT_NAME_LENGTH,
      `plantName must be at most ${MAX_PLANT_NAME_LENGTH} characters.`,
    ),
  htmlFormatting: z.string().optional(),
  lang: z.string().max(MAX_LANGUAGE_TAG_LENGTH).optional(),
});

const DEFAULT_LANGUAGE = 'en';

/** Strips parenthesised suffixes and special characters from a name. */
const cleanPlantName = (name: string): string =>
  name.replace(/\s*\([^)]*\)/g, '').replace(/[^a-zA-Z0-9 ]/g, '');

/**
 * Parses and normalises the raw query into a PlantInfoRequest.
 * Runs BEFORE the SSE stream opens so validation failures still get a
 * regular JSON 400 (see core/sse `prepare`). Exported separately from
 * the use case because it is the pre-stream half of the contract.
 */
export function parsePlantInfoQuery(
  query: unknown,
  acceptLanguageHeader?: string,
): PlantInfoRequest {
  const parsed = parseOrThrow(
    PlantInfoQuerySchema,
    query,
    'plantName query parameter is required.',
  );

  return {
    plantName: cleanPlantName(parsed.plantName),
    htmlFormatting: parsed.htmlFormatting === 'true',
    language:
      parsed.lang ??
      acceptLanguageHeader?.split(',')[0] ??
      DEFAULT_LANGUAGE,
  };
}

// ── Use case ──────────────────────────────────────────────────────────────────

export interface StreamPlantInfoOptions {
  request: PlantInfoRequest;
  /** Receives every payload event in emission order. */
  onEvent: (event: PlantInfoEvent) => Promise<void>;
  /** Polled before each emission; true stops further work output. */
  isAborted: () => boolean;
}

export class StreamPlantInfoUseCase {
  constructor(
    private readonly guideStreamer: PlantGuideStreamer,
    private readonly linkSearchers: PlantLinkSearcher[],
  ) {}

  async execute({ request, onEvent, isAborted }: StreamPlantInfoOptions): Promise<void> {
    // Link searchers run settled so one failing source never kills the
    // stream; the AI guide runs alongside them.
    const linksPromise = Promise.allSettled(
      this.linkSearchers.map(async (search) => {
        if (isAborted()) return;
        const link = await search(request.plantName);
        if (link && !isAborted()) {
          await onEvent({ type: 'link', value: link });
        }
      }),
    );

    const guidePromise = this.guideStreamer.streamPlantCare(
      request.plantName,
      request.htmlFormatting,
      async (chunk) => {
        if (!isAborted()) await onEvent({ type: 'ai_chunk', value: chunk });
      },
      request.language,
    );

    await Promise.all([linksPromise, guidePromise]);
  }
}
