import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { recognitionRoutes } from '../../../src/modules/recognition';
import type { RecognitionContext } from '../../../src/modules/recognition';

const stubLogger = () => {
  const warn = vi.fn();
  const noop = vi.fn();
  const logger: Record<string, unknown> = {
    level: 'info',
    warn,
    info: noop,
    error: noop,
    debug: noop,
    fatal: noop,
    trace: noop,
    silent: noop,
  };
  logger.child = () => logger;
  return { logger, warn };
};

describe('recognitionRoutes startup backfill', () => {
  it('swallows and logs a failing backfill', async () => {
    const { logger, warn } = stubLogger();
    const app = Fastify({ loggerInstance: logger as never });
    const backfill = vi.fn().mockRejectedValue(new Error('db closed'));
    const ctx = {
      embedder: null,
      embeddings: {},
      embedImages: { backfill },
      onImageStored: () => undefined,
    } as unknown as RecognitionContext;
    await app.register(recognitionRoutes(ctx), { prefix: '/r' });
    await app.ready();
    await new Promise((r) => setTimeout(r, 20));
    expect(backfill).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'embedding backfill failed',
    );
    await app.close();
  });
});
