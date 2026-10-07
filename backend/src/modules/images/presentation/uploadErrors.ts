/**
 * modules/images/presentation/uploadErrors.ts
 *
 * Upload size cap and translation of multipart parser errors.
 *
 * Kept separate from imageRoutes so it can be unit-tested without
 * pulling in the composition root (which imports the SQLite repository
 * and the Sharp-based storage adapter).
 */

import { ValidationError } from '../../../core/errors';

/**
 * Hard cap per upload. The file is buffered in memory, so an unbounded
 * upload is a direct OOM/DoS vector. Sharp downscales the image afterwards
 * anyway, so nothing legitimate needs more.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const MULTIPART_ERROR_CODES = new Set([
  'FST_REQ_FILE_TOO_LARGE',
  'FST_FILES_LIMIT',
  'FST_PARTS_LIMIT',
  'FST_FIELDS_LIMIT',
  'FST_PROTO_VIOLATION',
  'FST_INVALID_MULTIPART_CONTENT_TYPE',
]);

/**
 * Maps the multipart parser's own errors (e.g. an oversized file) onto the
 * module's ValidationError contract so clients get a 400 with the standard
 * error envelope. Other errors pass through unchanged.
 */
export const translateUploadError = (err: unknown): unknown => {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code !== 'string' || !MULTIPART_ERROR_CODES.has(code)) return err;
  return new ValidationError(
    code === 'FST_REQ_FILE_TOO_LARGE'
      ? `File too large. Maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`
      : `Upload failed: ${(err as Error).message}`,
  );
};
