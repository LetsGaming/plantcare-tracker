/**
 * core/config/env.ts
 *
 * The only module that reads process.env. `loadConfig` turns the raw
 * environment into a typed, validated object; `getConfig` memoizes it for
 * the process. Call `getConfig()` once at startup so missing required
 * variables fail the boot with a clear message.
 */

import path from 'path';

export interface JwtSettings {
  secret: string;
  refreshSecret: string;
  expiration: string;
  refreshExpiration: string;
}

export interface AppConfig {
  isProduction: boolean;
  port: number;
  allowedOrigins: string[];
  /** Explicit API version path segment; null defers to package.json. */
  apiVersionPath: string | null;
  dbPath: string;
  uploadsDir: string;
  /** Public origin for image URLs; null derives it from each request. */
  publicBaseUrl: string | null;
  jwt: JwtSettings;
  openAiApiKey: string | null;
  recognitionModelPath: string | null;
  /** Run the scraping browser without a window. Always true in production. */
  headlessBrowser: boolean;
  /** Number of reverse proxies in front of the server whose X-Forwarded-For is trusted. */
  trustProxyHops: number;
  sales: SalesSettings;
  /** Generate missing image variants in the background after the server listens. */
  imageBackfillOnStart: boolean;
  /** Decoder pixel limit for uploaded images (width x height). */
  uploadMaxPixels: number;
}

export interface SalesSettings {
  /** Refresh sale sources on a timer instead of only on demand. */
  refreshEnabled: boolean;
  refreshIntervalMin: number;
  /** Delay after listen before stale sources are refreshed. */
  refreshWarmDelayMs: number;
  /** Days an inactive sale item is kept before it is pruned. */
  retentionDays: number;
  /** Price points kept per sale item. */
  pricePointsMax: number;
}

/** Cheap check that does not require the rest of the configuration to be valid. */
export const isProductionEnv = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.NODE_ENV === 'production';

const IN_MEMORY_DB = ':memory:';

const resolveDbPath = (configured: string | undefined): string => {
  if (configured === IN_MEMORY_DB) return configured;
  return configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), 'data', 'plantcare.db');
};

const readInt = (
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number => {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(
      `Environment variable ${key} must be a plain integer between ${min} and ${max}, got "${raw}".`,
    );
  }
  return value;
};

const readBool = (env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean => {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`Environment variable ${key} must be true, false, 1 or 0, got "${env[key]}".`);
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const missing = ['JWT_SECRET', 'JWT_REFRESH_SECRET'].filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'The server cannot start without them.',
    );
  }

  const isProduction = isProductionEnv(env);
  return {
    isProduction,
    port: Number(env.PORT ?? 5000),
    allowedOrigins: env.ALLOWED_ORIGINS
      ? env.ALLOWED_ORIGINS.split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      : [],
    apiVersionPath: env.API_VERSION_PATH || null,
    dbPath: resolveDbPath(env.DB_PATH),
    uploadsDir: env.NAS_PATH ? path.resolve(env.NAS_PATH) : path.resolve(process.cwd(), 'uploads'),
    publicBaseUrl: env.PUBLIC_BASE_URL?.replace(/\/+$/, '') || null,
    jwt: {
      secret: env.JWT_SECRET as string,
      refreshSecret: env.JWT_REFRESH_SECRET as string,
      expiration: env.JWT_EXPIRATION ?? '15m',
      refreshExpiration: env.JWT_REFRESH_EXPIRATION ?? '7d',
    },
    openAiApiKey: env.OPENAI_API_KEY || null,
    recognitionModelPath: env.RECOGNITION_MODEL_PATH || null,
    headlessBrowser: env.headless_browser === 'true' || isProduction,
    trustProxyHops: readInt(env, 'TRUST_PROXY_HOPS', 1, 0, 10),
    sales: {
      refreshEnabled: readBool(env, 'SALES_REFRESH_ENABLED', true),
      refreshIntervalMin: readInt(env, 'SALES_REFRESH_INTERVAL_MIN', 120, 1, 10_080),
      refreshWarmDelayMs: readInt(env, 'SALES_REFRESH_WARM_DELAY_MS', 5000, 0, 600_000),
      retentionDays: readInt(env, 'SALES_RETENTION_DAYS', 30, 1, 3650),
      pricePointsMax: readInt(env, 'SALES_PRICE_POINTS_MAX', 30, 1, 1000),
    },
    imageBackfillOnStart: readBool(env, 'IMAGE_BACKFILL_ON_START', false),
    uploadMaxPixels: readInt(env, 'UPLOAD_MAX_PIXELS', 40_000_000, 1, 400_000_000),
  };
};

let cached: AppConfig | null = null;

export const getConfig = (): AppConfig => (cached ??= loadConfig());
