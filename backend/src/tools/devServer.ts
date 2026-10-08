/**
 * Local development server with deterministic stand-ins for the network-bound
 * features: shop scrapers (sales), the AI care guide and the plant link
 * searchers. Everything else is the real application on a real SQLite file.
 *
 * Configured only through environment variables (see core/config); it never
 * reads a `.env` file. Started by `scripts/dev-up.mjs`.
 */

import { initDatabase, closeDb } from '../core/database/db';
import { buildApp } from '../app';
import { getConfig } from '../core/config';
import { logger } from '../core/logging';
import { createMockMoreInfo, createMockSalesSources } from './devMocks';

const { port } = getConfig();
let app: Awaited<ReturnType<typeof buildApp>> | undefined;

const shutdown = (): void => {
  const finish = (): void => void closeDb().finally(() => process.exit(0));
  if (app) void app.close().then(finish, finish);
  else finish();
};

const start = async (): Promise<void> => {
  await initDatabase();
  app = await buildApp({
    sales: { createSources: createMockSalesSources },
    moreInfo: createMockMoreInfo(),
  });
  await app.listen({ port, host: '::' });
  logger.info(`Dev server with mock sources running on port ${port}`);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((err: unknown) => {
  logger.error('Failed to start dev server', { err });
  process.exit(1);
});
