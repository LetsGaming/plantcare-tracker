/**
 * modules/images/presentation/uploadErrors.ts
 *
 * Upload size cap and Multer error translation.
 *
 * Kept separate from imageRoutes so it can be unit-tested without
 * pulling in the composition root (which imports the SQLite repository
 * and the Sharp-based storage adapter).
 */

import multer from 'multer';
import { ValidationError } from '../../../core/errors';

/**
 * Hard cap per upload. Memory storage buffers the whole file, so an
 * unbounded upload is a direct OOM/DoS vector. Sharp downscales the
 * image afterwards anyway, so nothing legitimate needs more.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Maps Multer's own errors (e.g. LIMIT_FILE_SIZE) onto the module's
 * ValidationError contract so clients get a 400 with the standard error
 * envelope instead of the generic 500 the central handler produces for
 * unknown error types. Non-Multer errors pass through unchanged.
 */
export const translateMulterError = (err: unknown): unknown => {
  if (err instanceof multer.MulterError) {
    return new ValidationError(
      err.code === 'LIMIT_FILE_SIZE'
        ? `File too large. Maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`
        : `Upload failed: ${err.message}`,
    );
  }
  return err;
};
