/**
 * server.ts
 *
 * Backend entry point. Persistence is the better-sqlite3 singleton from
 * src/core/database/db.ts; module routers construct their own
 * repositories against it (see each module's presentation layer).
 *
 * Start: `pnpm run dev`  or  `pnpm run build && pnpm run start`
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Open (and initialise) the SQLite database before anything else imports it.
import { getDb, closeDb } from './src/core/database/db';
getDb(); // singleton: schema auto-applied on first run

import { logger } from './src/core/logging';
import { createApp } from './src/app';
import { getConfig } from './src/core/config';
import { closeBrowser } from './src/modules/sales/infrastructure/HttpFetcher';

const { port: PORT } = getConfig();
const app = createApp();

const server = app.listen(PORT, () => {
  logger.info(`V2 server running on port ${PORT}`); // stays info — visible in both dev and prod on startup
});

const releaseResources = async (): Promise<void> => {
  try {
    await closeBrowser();
    closeDb(); // flushes WAL checkpoint and closes the SQLite file
    logger.debug('Shutdown complete.');
  } catch (err) {
    logger.error('Error during shutdown', { err });
  }
};

const handleShutdown = (signal: string): void => {
  logger.debug(`${signal}: shutting down gracefully...`);
  server.close(() => {
    void releaseResources().then(() => process.exit(0));
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
};

// ── Process-level error guards ────────────────────────────────────────────────
// Catches unhandled promise rejections (e.g. the express-rate-limit
// ValidationError about trust proxy) and unexpected thrown exceptions,
// routing them through the structured logger instead of dumping raw
// stack traces to stderr.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    err: reason instanceof Error ? reason : undefined,
    reason: reason instanceof Error ? undefined : String(reason),
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — shutting down', { err });
  process.exit(1);
});

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
