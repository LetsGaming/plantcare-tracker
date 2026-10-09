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
  };
};

let cached: AppConfig | null = null;

export const getConfig = (): AppConfig => (cached ??= loadConfig());
