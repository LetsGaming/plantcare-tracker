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
import { AUTH_RATE_LIMIT, getConfig } from '../core/config';
import { logger } from '../core/logging';
import { createMockMoreInfo, createMockRecognition, createMockSalesSources } from './devMocks';

const { port } = getConfig();
let app: Awaited<ReturnType<typeof buildApp>> | undefined;

const shutdown = (): void => {
  const finish = (): void => void closeDb().finally(() => process.exit(0));
  if (app) void app.close().then(finish, finish);
  else finish();
};

// Many sessions and agents sign in from one IP during development, so the sign-in limits are lifted.
const authLimits = AUTH_RATE_LIMIT as { -readonly [K in keyof typeof AUTH_RATE_LIMIT]: number };

const start = async (): Promise<void> => {
  authLimits.MAX_PER_ACCOUNT = 10_000;
  authLimits.MAX_PER_IP = 10_000;
  await initDatabase();
  app = await buildApp({
    sales: { createSources: createMockSalesSources },
    moreInfo: createMockMoreInfo(),
    recognition: createMockRecognition(),
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
