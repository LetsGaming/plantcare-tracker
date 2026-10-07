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
import type { FastifyInstance } from 'fastify';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { initDatabase, closeDb } from './src/core/database/db';

import { logger } from './src/core/logging';
import { buildApp } from './src/app';
import { getConfig } from './src/core/config';
import { closeBrowser } from './src/modules/sales/infrastructure/HttpFetcher';

const { port: PORT } = getConfig();
let app: FastifyInstance | undefined;

const start = async (): Promise<void> => {
  await initDatabase();
  app = await buildApp();
  await app.listen({ port: PORT, host: '::' });
  logger.info(`V2 server running on port ${PORT}`);
};

const releaseResources = async (): Promise<void> => {
  try {
    await closeBrowser();
    await closeDb(); // flushes WAL checkpoint and closes the SQLite file
    logger.debug('Shutdown complete.');
  } catch (err) {
    logger.error('Error during shutdown', { err });
  }
};

const handleShutdown = (signal: string): void => {
  logger.debug(`${signal}: shutting down gracefully...`);
  const finish = (): void => void releaseResources().then(() => process.exit(0));
  if (app) void app.close().then(finish, finish);
  else finish();
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
};

// ── Process-level error guards ────────────────────────────────────────────────
// Catches unhandled promise rejections and unexpected thrown exceptions,
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

start().catch((err: unknown) => {
  logger.error('Failed to start', { err });
  process.exit(1);
});
