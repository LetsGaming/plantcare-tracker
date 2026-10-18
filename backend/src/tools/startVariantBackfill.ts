import { getConfig } from '../core/config';
import { createModuleLogger } from '../core/logging';
import { runVariantBackfill } from './backfillImageVariants';

const log = createModuleLogger('ImageVariantBackfill');

/** The slice of the Fastify instance the backfill needs; keeps framework types out of this file. */
interface HookHost {
  addHook(name: 'onListen', fn: () => Promise<void>): unknown;
  addHook(name: 'onClose', fn: () => Promise<void>): unknown;
}

/**
 * Runs the variant backfill in the background after the server starts
 * listening when IMAGE_BACKFILL_ON_START is set; closing the server stops it.
 */
export const startVariantBackfill = (app: HookHost): void => {
  if (!getConfig().imageBackfillOnStart) return;
  const abort = new AbortController();
  let running: Promise<unknown> = Promise.resolve();
  app.addHook('onListen', async () => {
    running = runVariantBackfill({ signal: abort.signal })
      .then((r) => log.info('Image variant backfill finished', { ...r }))
      .catch((err: unknown) => log.error('Image variant backfill failed', { err }));
  });
  app.addHook('onClose', async () => {
    abort.abort();
    await running;
  });
};
