/**
 * core/config/uploads.ts
 *
 * Single source of truth for where uploaded images live on disk, under
 * which route they are served, and how stored paths become public URLs.
 * The database keeps origin-free paths ("/uploads/plant/a.webp"); the
 * origin is added when a response is built so the host can change
 * without rewriting rows.
 */

import { getConfig } from './env';
import { requestContext } from '../logging/logger';

/** Public route prefix under which uploads are statically served. */
export const STATIC_UPLOADS_ROUTE = '/uploads';

/**
 * Absolute directory for uploaded files: NAS_PATH when configured
 * (production NAS mount), otherwise ./uploads under the working dir.
 */
export function getUploadsDirectory(): string {
  return getConfig().uploadsDir;
}

/** The origin-free path stored for an uploaded file. */
export const toStoredImagePath = (entityType: string, filename: string): string =>
  `${STATIC_UPLOADS_ROUTE}/${entityType}/${filename}`;

const ABSOLUTE_URL = /^https?:\/\//i;

/**
 * The URL clients load an image from. Absolute values (rows that predate
 * relative storage) pass through; stored paths get PUBLIC_BASE_URL, else
 * the current request's origin, else the local server address.
 */
export const toPublicImageUrl = (stored: string): string => {
  if (ABSOLUTE_URL.test(stored)) return stored;
  const { publicBaseUrl, port } = getConfig();
  const origin = publicBaseUrl ?? requestContext.getStore()?.origin ?? `http://localhost:${port}`;
  return `${origin}${stored.startsWith('/') ? stored : `/${stored}`}`;
};
