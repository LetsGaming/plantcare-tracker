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
/** Primary language plus up to two subtags, e.g. "en", "de-DE", "zh-Hant-TW". */
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/;

const PlantInfoQuerySchema = z.object({
  plantName: z
    .string()
    .min(1, 'plantName query parameter is required.')
    .max(MAX_PLANT_NAME_LENGTH, `plantName must be at most ${MAX_PLANT_NAME_LENGTH} characters.`),
  htmlFormatting: z.string().optional(),
  lang: z
    .string()
    .max(MAX_LANGUAGE_TAG_LENGTH)
    .regex(LANGUAGE_TAG, 'lang must be a language tag such as "en" or "de-DE"')
    .optional(),
});

const DEFAULT_LANGUAGE = 'en';

/** Strips parenthesised suffixes and special characters from a name. */
const cleanPlantName = (name: string): string =>
  name.replace(/\s*\([^)]*\)/g, '').replace(/[^a-zA-Z0-9 ]/g, '');

/** First entry of an Accept-Language header when it is a well-formed language tag. */
const languageFromHeader = (header: string | undefined): string | undefined => {
  const first = header?.split(',')[0]?.split(';')[0]?.trim();
  return first && LANGUAGE_TAG.test(first) ? first : undefined;
};

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
    language: parsed.lang ?? languageFromHeader(acceptLanguageHeader) ?? DEFAULT_LANGUAGE,
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

const GUIDE_CACHE_MAX_ENTRIES = 200;
const GUIDE_CACHE_TTL_MS = 43_200_000;

export interface GuideShareOptions {
  maxEntries?: number;
  ttlMs?: number;
  now?: () => number;
}

class GuideCancelled extends Error {}

/** One upstream guide call whose chunks are buffered so any subscriber can replay them. */
class GuideFlight {
  readonly chunks: string[] = [];
  finished = false;
  error: unknown = null;
  cancelled = false;
  private subscribers = 0;
  private wake: (() => void)[] = [];

  constructor(
    run: (onChunk: (chunk: string) => Promise<void>) => Promise<void>,
    onSettled: (flight: GuideFlight) => void,
  ) {
    void run(async (chunk) => {
      // Throwing stops the upstream stream once the last subscriber has left.
      if (this.cancelled) throw new GuideCancelled();
      this.chunks.push(chunk);
      this.notify();
    })
      .catch((err: unknown) => {
        this.error = err;
      })
      .finally(() => {
        this.finished = true;
        onSettled(this);
        this.notify();
      });
  }

  get succeeded(): boolean {
    return this.finished && this.error === null && !this.cancelled;
  }

  async subscribe(
    onChunk: (chunk: string) => Promise<void>,
    isAborted: () => boolean,
  ): Promise<void> {
    this.subscribers++;
    try {
      let next = 0;
      for (;;) {
        while (next < this.chunks.length) {
          if (isAborted()) return;
          await onChunk(this.chunks[next++]);
        }
        if (this.finished) {
          if (isAborted()) return;
          if (this.error !== null) throw this.error;
          return;
        }
        if (isAborted()) return;
        await new Promise<void>((resolve) => this.wake.push(resolve));
      }
    } finally {
      this.subscribers--;
      if (this.subscribers === 0 && !this.finished) this.cancelled = true;
    }
  }

  private notify(): void {
    const waiting = this.wake;
    this.wake = [];
    for (const resolve of waiting) resolve();
  }
}

/**
 * Shares one upstream guide call between identical concurrent requests and
 * keeps completed guides in a bounded, expiring LRU. Failed or cancelled
 * calls are never stored.
 */
class SharedGuides {
  private readonly inflight = new Map<string, GuideFlight>();
  private readonly done = new Map<string, { flight: GuideFlight; expiresAt: number }>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly streamer: PlantGuideStreamer,
    options: GuideShareOptions,
  ) {
    this.maxEntries = options.maxEntries ?? GUIDE_CACHE_MAX_ENTRIES;
    this.ttlMs = options.ttlMs ?? GUIDE_CACHE_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  stream(
    request: PlantInfoRequest,
    onChunk: (chunk: string) => Promise<void>,
    isAborted: () => boolean,
  ): Promise<void> {
    const key = `${request.language}\u0000${request.htmlFormatting}\u0000${request.plantName.toLowerCase()}`;
    return this.flightFor(key, request).subscribe(onChunk, isAborted);
  }

  private flightFor(key: string, request: PlantInfoRequest): GuideFlight {
    const cached = this.done.get(key);
    if (cached) {
      if (cached.expiresAt > this.now()) {
        this.done.delete(key);
        this.done.set(key, cached);
        return cached.flight;
      }
      this.done.delete(key);
    }

    const running = this.inflight.get(key);
    if (running && !running.cancelled) return running;

    const flight = new GuideFlight(
      (onChunk) =>
        this.streamer.streamPlantCare(
          request.plantName,
          request.htmlFormatting,
          onChunk,
          request.language,
        ),
      (settled) => {
        if (this.inflight.get(key) === settled) this.inflight.delete(key);
        if (!settled.succeeded) return;
        this.done.set(key, { flight: settled, expiresAt: this.now() + this.ttlMs });
        while (this.done.size > this.maxEntries) {
          this.done.delete(this.done.keys().next().value as string);
        }
      },
    );
    this.inflight.set(key, flight);
    return flight;
  }
}

export class StreamPlantInfoUseCase {
  private readonly guides: SharedGuides;

  constructor(
    guideStreamer: PlantGuideStreamer,
    private readonly linkSearchers: PlantLinkSearcher[],
    shareOptions: GuideShareOptions = {},
  ) {
    this.guides = new SharedGuides(guideStreamer, shareOptions);
  }

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

    const guidePromise = this.guides.stream(
      request,
      async (chunk) => {
        if (!isAborted()) await onEvent({ type: 'ai_chunk', value: chunk });
      },
      isAborted,
    );

    await Promise.all([linksPromise, guidePromise]);
  }
}
