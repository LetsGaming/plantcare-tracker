/**
 * core/logging/logger.ts
 *
 * Structured Winston logger with AsyncLocalStorage-based request-ID
 * correlation. Every log line automatically includes the requestId of
 * the currently active HTTP request — no manual passing required.
 *
 * Log level strategy:
 *  - dev:  'debug' — log everything; maximum visibility for debugging.
 *  - prod: 'warn'  — only warnings and errors; keeps log files lean and
 *                    makes real problems immediately obvious.
 *
 * Console transport strategy:
 *  - dev:  verbose, human-readable, colourised, includes stack traces
 *          and request bodies so issues are easy to trace in the terminal.
 *  - prod: compact single-line JSON per entry — no stack traces, no bodies,
 *          easy to grep/pipe and safe to ingest into log aggregators.
 *          Always active so PM2 / systemd / Docker capture it via stdout.
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

// ── Human-readable console format (dev only) ──────────────────────────────────

const devConsoleFormat = format.printf(({
  level, message, timestamp, stack, requestId, module: mod,
  sqliteCode, sqliteOffset, method, path: routePath, body,
  ...meta
}) => {
  const rid      = requestId  ? ` [${requestId}]`    : '';
  const modLabel = mod        ? ` {${mod}}`           : '';
  const route    = (method && routePath) ? ` ${method} ${routePath}` : '';
  const sqlite   = sqliteCode ? ` [${sqliteCode}${sqliteOffset != null ? ` @${sqliteOffset}` : ''}]` : '';

  let line = `${timestamp} | [${level}]${rid}${modLabel}${route}${sqlite}: ${message}`;

  // Stack on its own indented lines — easier to read than embedded in JSON
  if (stack && typeof stack === 'string') {
    const frames = stack
      .split('\n')
      .slice(1) // drop the redundant "ErrorType: message" first line
      .map((f) => `    ${f.trim()}`)
      .join('\n');
    line += `\n${frames}`;
  }

  // Remaining metadata, excluding fields already rendered above
  const skip = new Set(['splat']);
  const remaining = Object.entries(meta).filter(([k]) => !skip.has(k));
  if (remaining.length > 0) {
    line += `\n  ${JSON.stringify(Object.fromEntries(remaining), null, 2).replace(/\n/g, '\n  ')}`;
  }

  // Request body — only present in dev (errorHandler guards the field)
  if (body !== undefined) {
    line += `\n  body: ${JSON.stringify(body)}`;
  }

  return line;
});

// ── Minimal JSON console format (prod) ───────────────────────────────────────
// One compact JSON line per entry — easy to grep, pipe into jq, or ingest
// into a log aggregator. Intentionally omits stack traces and request bodies:
// stacks belong in error.log only, bodies must never leave the server.

const prodConsoleFormat = format.printf(({
  level, message, timestamp, requestId, module: mod, method, path: routePath,
  sqliteCode,
}) => {
  const entry: Record<string, unknown> = { timestamp, level, message };
  if (requestId)  entry['requestId'] = requestId;
  if (mod)        entry['module']    = mod;
  if (method)     entry['method']    = method;
  if (routePath)  entry['path']      = routePath;
  if (sqliteCode) entry['sqliteCode'] = sqliteCode;
  return JSON.stringify(entry);
});

// ── Logger instance ───────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV !== 'production';

export const logger: Logger = createLogger({
  // debug in dev for maximum visibility; warn in prod to only surface
  // issues that need attention, keeping log files lean.
  level: isDev ? 'debug' : 'warn',
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
    // Console transport is always active so PM2 / systemd / Docker can
    // capture logs via stdout regardless of environment.
    new transports.Console({
      format: isDev
        ? format.combine(
            injectRequestId(),
            format.colorize({ all: true }),
            format.timestamp({ format: 'HH:mm:ss' }),
            devConsoleFormat,
          )
        : format.combine(
            injectRequestId(),
            format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            prodConsoleFormat,
          ),
    }),
  ],
});

// ── Module-scoped child logger factory ───────────────────────────────────────

/**
 * Returns a child logger that automatically tags every line with the
 * module name, e.g. `createModuleLogger('SalesController')`.
 */
export const createModuleLogger = (moduleName: string) =>
  logger.child({ module: moduleName });
