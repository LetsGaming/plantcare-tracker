/**
 * core/config/apiVersion.ts
 *
 * Single source of truth for the `/api/<version>` URL prefix.
 *
 * Resolution order:
 *   1. API_VERSION_PATH environment variable
 *   2. `versionPath` field in package.json
 *   3. Fallback: "v2"
 *
 * Previously this lookup existed twice — once in server.ts and once in
 * authRoutes.ts (which needed the version to scope the refresh-token
 * cookie path). Both now share this helper so the two can never drift.
 */

import fs from 'fs';
import path from 'path';

const DEFAULT_VERSION = 'v2';

let cachedVersion: string | null = null;

export function getApiVersionPath(): string {
  if (cachedVersion) return cachedVersion;

  if (process.env.API_VERSION_PATH) {
    cachedVersion = process.env.API_VERSION_PATH;
    return cachedVersion;
  }

  try {
    const raw = fs.readFileSync(
      path.resolve(process.cwd(), 'package.json'),
      'utf-8',
    );
    const pkg = JSON.parse(raw) as { versionPath?: string };
    cachedVersion = pkg.versionPath ?? DEFAULT_VERSION;
  } catch {
    cachedVersion = DEFAULT_VERSION;
  }
  return cachedVersion;
}

/** Full URL prefix, e.g. "/api/v2". */
export function getApiBasePath(): string {
  return `/api/${getApiVersionPath()}`;
}
