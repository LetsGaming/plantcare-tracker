import { ImageCleanupService } from './application/ImageCleanupService';
import { SQLiteImageRepository } from './infrastructure/SQLiteImageRepository';
import { LocalImageStorage } from './infrastructure/LocalImageStorage';
import type { EntityImageCleanup } from './domain/Image';

import type { FastifyInstance } from 'fastify';
import { getConfig } from '../../core/config';
import { createModuleLogger } from '../../core/logging';
import { runVariantBackfill } from '../../tools/backfillImageVariants';

export type { EntityImageCleanup } from './domain/Image';

const log = createModuleLogger('ImageVariantBackfill');

/**
 * Runs the variant backfill in the background after the server starts
 * listening when IMAGE_BACKFILL_ON_START is set; closing the server stops it.
 */
export const startVariantBackfill = (app: FastifyInstance): void => {
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

/** Composition helper for modules that delete image-owning entities. */
export const createImageCleanup = (): EntityImageCleanup =>
  new ImageCleanupService(new SQLiteImageRepository(), new LocalImageStorage());
