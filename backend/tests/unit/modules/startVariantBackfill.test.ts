import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

const state = vi.hoisted(() => ({ enabled: false }));

vi.mock('../../../src/core/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/core/config')>()),
  getConfig: () => ({ imageBackfillOnStart: state.enabled }),
}));
vi.mock('../../../src/tools/backfillImageVariants', () => ({
  runVariantBackfill: vi.fn(),
}));

import { startVariantBackfill } from '../../../src/modules/images';
import { runVariantBackfill } from '../../../src/tools/backfillImageVariants';

const result = { processed: 0, missing: 0, nonWebp: 0, failed: 0 };

beforeEach(() => {
  state.enabled = false;
  vi.mocked(runVariantBackfill).mockReset().mockResolvedValue(result);
});

describe('startVariantBackfill', () => {
  it('does nothing unless IMAGE_BACKFILL_ON_START is set', async () => {
    const app = Fastify();
    startVariantBackfill(app);
    await app.listen({ port: 0, host: '127.0.0.1' });
    await app.close();
    expect(runVariantBackfill).not.toHaveBeenCalled();
  });

  it('starts once the server listens', async () => {
    state.enabled = true;
    const app = Fastify();
    startVariantBackfill(app);
    await app.ready();
    expect(runVariantBackfill).not.toHaveBeenCalled();
    await app.listen({ port: 0, host: '127.0.0.1' });
    expect(runVariantBackfill).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('aborts the run and waits for it when the server closes', async () => {
    state.enabled = true;
    let signal: AbortSignal | undefined;
    let finished = false;
    vi.mocked(runVariantBackfill).mockImplementation(async (options) => {
      signal = options?.signal;
      await new Promise<void>((resolve) => signal!.addEventListener('abort', () => resolve()));
      finished = true;
      return result;
    });
    const app = Fastify();
    startVariantBackfill(app);
    await app.listen({ port: 0, host: '127.0.0.1' });
    expect(signal?.aborted).toBe(false);
    await app.close();
    expect(signal?.aborted).toBe(true);
    expect(finished).toBe(true);
  });
});
