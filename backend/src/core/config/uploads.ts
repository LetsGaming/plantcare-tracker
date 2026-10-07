/**
 * core/config/uploads.ts
 *
 * Single source of truth for where uploaded images live on disk and
 * under which route they are served. Both values were previously
 * resolved independently in server.ts and imageRoutes.ts — a drift
 * hazard, since the static mount and the URL builder must agree.
 */

import { getConfig } from './env';

/** Public route prefix under which uploads are statically served. */
export const STATIC_UPLOADS_ROUTE = '/uploads';

/**
 * Absolute directory for uploaded files: NAS_PATH when configured
 * (production NAS mount), otherwise ./uploads under the working dir.
 */
export function getUploadsDirectory(): string {
  return getConfig().uploadsDir;
}
