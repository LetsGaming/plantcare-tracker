/**
 * tests/unit/modules/moreInfo.test.ts
 *
 * Tests for the moreInfo application layer: pre-stream query parsing
 * (parsePlantInfoQuery) and the StreamPlantInfo orchestration — link
 * searchers and AI guide in parallel, typed events, abort handling,
 * and isolation of failing searchers.
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  PlantGuideStreamer,
  PlantInfoEvent,
} from '../../../src/modules/moreInfo/domain/PlantInfo';
import {
  parsePlantInfoQuery,
  StreamPlantInfoUseCase,
} from '../../../src/modules/moreInfo/application/StreamPlantInfo';
import { ValidationError } from '../../../src/core/errors';
import { singleFlightSearcher } from '../../../src/modules/moreInfo/infrastructure/PlantLinkSearchers';

// ── parsePlantInfoQuery ───────────────────────────────────────────────────────

describe('parsePlantInfoQuery', () => {
  it('throws ValidationError when plantName is missing', () => {
    expect(() => parsePlantInfoQuery({})).toThrow(ValidationError);
  });

  it('rejects a plantName longer than 100 characters', () => {
    expect(() => parsePlantInfoQuery({ plantName: 'a'.repeat(101) })).toThrow(ValidationError);
  });

  it('cleans the plant name (parentheses and special characters)', () => {
    const req = parsePlantInfoQuery({ plantName: "Monstera 'Thai' (variegated)" });
    expect(req.plantName).toBe('Monstera Thai');
  });

  it('parses htmlFormatting only for the literal string "true"', () => {
    expect(parsePlantInfoQuery({ plantName: 'x', htmlFormatting: 'true' }).htmlFormatting).toBe(
      true,
    );
    expect(parsePlantInfoQuery({ plantName: 'x', htmlFormatting: '1' }).htmlFormatting).toBe(false);
    expect(parsePlantInfoQuery({ plantName: 'x' }).htmlFormatting).toBe(false);
  });

  it('prefers the lang query over the Accept-Language header over the default', () => {
    expect(parsePlantInfoQuery({ plantName: 'x', lang: 'de' }, 'fr-FR,fr').language).toBe('de');
    expect(parsePlantInfoQuery({ plantName: 'x' }, 'fr-FR,fr').language).toBe('fr-FR');
    expect(parsePlantInfoQuery({ plantName: 'x' }).language).toBe('en');
  });
});

// ── StreamPlantInfoUseCase ────────────────────────────────────────────────────

const request = { plantName: 'Monstera', htmlFormatting: false, language: 'en' };

const makeStreamer = (chunks: string[] = ['Water ', 'weekly.']): PlantGuideStreamer => ({
  streamPlantCare: vi.fn(async (_name, _html, onChunk: (c: string) => Promise<void>) => {
    for (const chunk of chunks) await onChunk(chunk);
  }),
});

const collectEvents = () => {
  const events: PlantInfoEvent[] = [];
  const onEvent = vi.fn(async (e: PlantInfoEvent) => {
    events.push(e);
  });
  return { events, onEvent };
};

describe('StreamPlantInfoUseCase', () => {
  it('forwards AI chunks and found links as typed events', async () => {
    const streamer = makeStreamer();
    const searchers = [
      vi.fn().mockResolvedValue('https://en.wikipedia.org/wiki/Monstera'),
      vi.fn().mockResolvedValue(null), // no result → no event
    ];
    const { events, onEvent } = collectEvents();

    await new StreamPlantInfoUseCase(streamer, searchers).execute({
      request,
      onEvent,
      isAborted: () => false,
    });

    const chunks = events.filter((e) => e.type === 'ai_chunk').map((e) => e.value);
    const links = events.filter((e) => e.type === 'link').map((e) => e.value);
    expect(chunks).toEqual(['Water ', 'weekly.']);
    expect(links).toEqual(['https://en.wikipedia.org/wiki/Monstera']);
    expect(streamer.streamPlantCare).toHaveBeenCalledWith(
      'Monstera',
      false,
      expect.any(Function),
      'en',
    );
  });

  it('suppresses all events once aborted', async () => {
    const streamer = makeStreamer(['never']);
    const searchers = [vi.fn().mockResolvedValue('https://example.com/link')];
    const { events, onEvent } = collectEvents();

    await new StreamPlantInfoUseCase(streamer, searchers).execute({
      request,
      onEvent,
      isAborted: () => true,
    });

    expect(events).toEqual([]);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('isolates a rejecting searcher — the guide still streams', async () => {
    const streamer = makeStreamer(['ok']);
    const searchers = [
      vi.fn().mockRejectedValue(new Error('scraper down')),
      vi.fn().mockResolvedValue('https://example.com/link'),
    ];
    const { events, onEvent } = collectEvents();

    await expect(
      new StreamPlantInfoUseCase(streamer, searchers).execute({
        request,
        onEvent,
        isAborted: () => false,
      }),
    ).resolves.toBeUndefined();

    expect(events).toContainEqual({ type: 'ai_chunk', value: 'ok' });
    expect(events).toContainEqual({ type: 'link', value: 'https://example.com/link' });
  });
});

// ── Single-flight care guide ──────────────────────────────────────────────────

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** A streamer whose chunks are released one at a time by the test. */
const makeGatedStreamer = () => {
  const gates: (() => void)[] = [];
  let finish!: () => void;
  const streamer: PlantGuideStreamer = {
    streamPlantCare: vi.fn(async (_n, _h, onChunk: (c: string) => Promise<void>) => {
      await onChunk('one ');
      await new Promise<void>((resolve) => gates.push(resolve));
      await onChunk('two ');
      await new Promise<void>((resolve) => (finish = resolve));
    }),
  };
  return { streamer, release: () => gates.shift()?.(), finish: () => finish() };
};

const run = (useCase: StreamPlantInfoUseCase, req = request, isAborted = () => false) => {
  const { events, onEvent } = collectEvents();
  const done = useCase.execute({ request: req, onEvent, isAborted });
  return { events, done };
};

const chunksOf = (events: PlantInfoEvent[]) =>
  events.filter((e) => e.type === 'ai_chunk').map((e) => e.value);

describe('StreamPlantInfoUseCase single-flight', () => {
  it('shares one upstream call between concurrent identical requests', async () => {
    const gated = makeGatedStreamer();
    const useCase = new StreamPlantInfoUseCase(gated.streamer, []);

    const a = run(useCase);
    const b = run(useCase, { ...request, plantName: 'monstera' });
    await tick();
    gated.release();
    await tick();
    gated.finish();
    await Promise.all([a.done, b.done]);

    expect(gated.streamer.streamPlantCare).toHaveBeenCalledTimes(1);
    expect(chunksOf(a.events)).toEqual(['one ', 'two ']);
    expect(chunksOf(b.events)).toEqual(['one ', 'two ']);
  });

  it('does not share between different languages', async () => {
    const streamer = makeStreamer();
    const useCase = new StreamPlantInfoUseCase(streamer, [], { ttlMs: 0 });

    await run(useCase).done;
    await run(useCase, { ...request, language: 'de' }).done;

    expect(streamer.streamPlantCare).toHaveBeenCalledTimes(2);
  });

  it('replays already streamed chunks to a late subscriber, then continues live', async () => {
    const gated = makeGatedStreamer();
    const useCase = new StreamPlantInfoUseCase(gated.streamer, []);

    const early = run(useCase);
    await tick();
    const late = run(useCase);
    await tick();
    expect(chunksOf(late.events)).toEqual(['one ']);

    gated.release();
    await tick();
    gated.finish();
    await Promise.all([early.done, late.done]);

    expect(gated.streamer.streamPlantCare).toHaveBeenCalledTimes(1);
    expect(chunksOf(late.events)).toEqual(['one ', 'two ']);
  });

  it('keeps the upstream running when one subscriber aborts', async () => {
    const gated = makeGatedStreamer();
    const useCase = new StreamPlantInfoUseCase(gated.streamer, []);
    let aborted = false;

    const leaving = run(useCase, request, () => aborted);
    const staying = run(useCase);
    await tick();
    aborted = true;
    gated.release();
    await tick();
    gated.finish();
    await Promise.all([leaving.done, staying.done]);

    expect(chunksOf(staying.events)).toEqual(['one ', 'two ']);
    expect(chunksOf(leaving.events)).toEqual(['one ']);
    expect(gated.streamer.streamPlantCare).toHaveBeenCalledTimes(1);
  });

  it('stops the upstream when the last subscriber leaves and does not cache it', async () => {
    const gated = makeGatedStreamer();
    const useCase = new StreamPlantInfoUseCase(gated.streamer, []);
    let aborted = false;

    const only = run(useCase, request, () => aborted);
    await tick();
    aborted = true;
    gated.release();
    await only.done;
    await tick();

    const second = run(useCase);
    await tick();
    expect(gated.streamer.streamPlantCare).toHaveBeenCalledTimes(2);
    expect(chunksOf(second.events)).toEqual(['one ']);
  });

  it('propagates an upstream error to every subscriber and does not cache it', async () => {
    let calls = 0;
    const streamer: PlantGuideStreamer = {
      streamPlantCare: vi.fn(async (_n, _h, onChunk: (c: string) => Promise<void>) => {
        calls++;
        await onChunk('partial ');
        await tick();
        if (calls === 1) throw new Error('upstream down');
        await onChunk('recovered');
      }),
    };
    const useCase = new StreamPlantInfoUseCase(streamer, []);

    const a = run(useCase);
    const b = run(useCase);
    const results = await Promise.allSettled([a.done, b.done]);

    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(chunksOf(a.events)).toEqual(['partial ']);
    expect(chunksOf(b.events)).toEqual(['partial ']);

    const retry = run(useCase);
    await retry.done;
    expect(streamer.streamPlantCare).toHaveBeenCalledTimes(2);
    expect(chunksOf(retry.events)).toEqual(['partial ', 'recovered']);
  });

  it('serves a completed guide from the cache without calling upstream', async () => {
    const streamer = makeStreamer();
    const useCase = new StreamPlantInfoUseCase(streamer, []);

    await run(useCase).done;
    const again = run(useCase);
    await again.done;

    expect(streamer.streamPlantCare).toHaveBeenCalledTimes(1);
    expect(chunksOf(again.events)).toEqual(['Water ', 'weekly.']);
  });

  it('evicts the least recently used guide beyond maxEntries', async () => {
    const streamer = makeStreamer();
    const useCase = new StreamPlantInfoUseCase(streamer, [], { maxEntries: 2 });
    const named = (plantName: string) => ({ ...request, plantName });

    await run(useCase, named('A')).done;
    await run(useCase, named('B')).done;
    await run(useCase, named('A')).done;
    await run(useCase, named('C')).done;
    expect(streamer.streamPlantCare).toHaveBeenCalledTimes(3);

    await run(useCase, named('A')).done;
    expect(streamer.streamPlantCare).toHaveBeenCalledTimes(3);
    await run(useCase, named('B')).done;
    expect(streamer.streamPlantCare).toHaveBeenCalledTimes(4);
  });

  it('refetches a guide once its TTL has passed', async () => {
    const streamer = makeStreamer();
    let clock = 1_000;
    const useCase = new StreamPlantInfoUseCase(streamer, [], { ttlMs: 500, now: () => clock });

    await run(useCase).done;
    clock += 499;
    await run(useCase).done;
    expect(streamer.streamPlantCare).toHaveBeenCalledTimes(1);

    clock += 2;
    await run(useCase).done;
    expect(streamer.streamPlantCare).toHaveBeenCalledTimes(2);
  });
});

describe('singleFlightSearcher', () => {
  it('shares one lookup between concurrent calls and allows a new one afterwards', async () => {
    let release!: (v: string) => void;
    const inner = vi.fn(() => new Promise<string | null>((resolve) => (release = resolve)));
    const search = singleFlightSearcher(inner);

    const a = search('Monstera');
    const b = search('monstera');
    release('https://example.com/m');
    expect(await Promise.all([a, b])).toEqual(['https://example.com/m', 'https://example.com/m']);
    expect(inner).toHaveBeenCalledTimes(1);

    const c = search('Monstera');
    release('https://example.com/m2');
    await c;
    expect(inner).toHaveBeenCalledTimes(2);
  });
});
