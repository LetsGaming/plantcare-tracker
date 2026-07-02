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

// ── parsePlantInfoQuery ───────────────────────────────────────────────────────

describe('parsePlantInfoQuery', () => {
  it('throws ValidationError when plantName is missing', () => {
    expect(() => parsePlantInfoQuery({})).toThrow(ValidationError);
  });

  it('rejects a plantName longer than 100 characters', () => {
    expect(() =>
      parsePlantInfoQuery({ plantName: 'a'.repeat(101) }),
    ).toThrow(ValidationError);
  });

  it('cleans the plant name (parentheses and special characters)', () => {
    const req = parsePlantInfoQuery({ plantName: "Monstera 'Thai' (variegated)" });
    expect(req.plantName).toBe('Monstera Thai');
  });

  it('parses htmlFormatting only for the literal string "true"', () => {
    expect(parsePlantInfoQuery({ plantName: 'x', htmlFormatting: 'true' }).htmlFormatting).toBe(true);
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
  streamPlantCare: vi.fn(
    async (_name, _html, onChunk: (c: string) => Promise<void>) => {
      for (const chunk of chunks) await onChunk(chunk);
    },
  ),
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
