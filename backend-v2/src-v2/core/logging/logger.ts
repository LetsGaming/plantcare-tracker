/**
 * core/logging/logger.ts
 *
 * Structured Winston logger with AsyncLocalStorage-based request-ID
 * correlation. Every log line automatically includes the requestId of
 * the currently active HTTP request — no manual passing required.
 *
 * V1 improvement: logger.js had no request context, making it
 * impossible to trace a single request across multiple log lines.
 */

import path from 'path';
import fs from 'fs';
import { createLogger, format, transports, Logger } from 'winston';
import { AsyncLocalStorage } from 'async_hooks';

// ── Request-ID store ──────────────────────────────────────────────────────────

export interface RequestContext {
  requestId: string;
  method?: string;
  path?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

// ── Log directory ─────────────────────────────────────────────────────────────

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// ── Custom format: inject requestId from AsyncLocalStorage ───────────────────

const injectRequestId = format((info) => {
  const ctx = requestContext.getStore();
  if (ctx) {
    info['requestId'] = ctx.requestId;
  }
  return info;
});

// ── Human-readable console format ────────────────────────────────────────────

const consoleFormat = format.printf(({ level, message, timestamp, stack, requestId, module: mod, ...meta }) => {
  const rid = requestId ? ` [${requestId}]` : '';
  const modLabel = mod ? ` {${mod}}` : '';
  let line = `${timestamp} | [${level}]${rid}${modLabel}: ${stack ?? message}`;

  const remaining = Object.keys(meta).filter((k) => k !== 'splat');
  if (remaining.length > 0) {
    line += ` | ${JSON.stringify(meta)}`;
  }
  return line;
});

// ── Logger instance ───────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV !== 'production';

export const logger: Logger = createLogger({
  level: isDev ? 'debug' : 'info',
  format: format.combine(
    injectRequestId(),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json(),
  ),
  transports: [
    new transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
    }),
    new transports.File({
      filename: path.join(logDir, 'combined.log'),
    }),
  ],
});

if (isDev) {
  logger.add(
    new transports.Console({
      format: format.combine(
        injectRequestId(),
        format.colorize({ all: true }),
        format.timestamp({ format: 'HH:mm:ss' }),
        consoleFormat,
      ),
    }),
  );
}

// ── Module-scoped child logger factory ───────────────────────────────────────

/**
 * Returns a child logger that automatically tags every line with the
 * module name, e.g. `logger.child('SalesController')`.
 */
export const createModuleLogger = (moduleName: string) =>
  logger.child({ module: moduleName });
