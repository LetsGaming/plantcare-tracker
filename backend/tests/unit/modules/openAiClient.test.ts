import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
vi.mock('openai', () => ({
  OpenAI: class {
    chat = { completions: { create } };
  },
}));

import { OpenAIPlantClient } from '../../../src/modules/moreInfo/infrastructure/OpenAIClient';
import type { CacheService } from '../../../src/core/cache/CacheService';

const makeCache = (): CacheService => {
  const store = new Map<string, unknown>();
  return {
    get: (k: string) => store.get(k),
    set: (k: string, v: unknown) => void store.set(k, v),
  } as unknown as CacheService;
};

const streamOf = (...parts: string[]) =>
  (async function* () {
    for (const content of parts) yield { choices: [{ delta: { content } }] };
  })();

beforeEach(() => {
  create.mockReset();
});

describe('OpenAIPlantClient', () => {
  it('rethrows a failing completion so the SSE endpoint can emit an error event', async () => {
    create.mockRejectedValue(new Error('rate limited'));
    const client = new OpenAIPlantClient(makeCache(), 'test-key');
    await expect(client.streamPlantCare('Aloe', false, async () => {})).rejects.toThrow(
      'rate limited',
    );
  });

  it('fails instead of ending silently when no API key is configured', async () => {
    const client = new OpenAIPlantClient(makeCache(), null);
    await expect(client.streamPlantCare('Aloe', false, async () => {})).rejects.toThrow(
      'OPENAI_API_KEY',
    );
  });

  it('escapes cached model output before building HTML', async () => {
    create.mockResolvedValue(streamOf('## Light <img src=x onerror=alert(1)>\n'));
    const client = new OpenAIPlantClient(makeCache(), 'test-key');
    await client.streamPlantCare('Aloe', false, async () => {});
    const chunks: string[] = [];
    await client.streamPlantCare('Aloe', true, async (c) => {
      chunks.push(c);
    });
    const html = chunks.join('');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('<h2>');
  });
});
