/**
 * core/errors/translateError.ts
 *
 * Maps well-known third-party failures (body parser, SQLite constraint
 * violations) to AppErrors so they reach clients as 4xx instead of 500.
 */

import { AppError, ConflictError, PayloadTooLargeError, ValidationError } from './AppError';

interface CodedError {
  code?: unknown;
  type?: unknown;
  status?: unknown;
  statusCode?: unknown;
}

const BAD_REQUEST_BODY_TYPES = new Set([
  'entity.parse.failed',
  'encoding.unsupported',
  'charset.unsupported',
  'request.aborted',
  'request.size.invalid',
  'stream.encoding.set',
]);

export const translateError = (err: unknown): AppError | null => {
  if (err instanceof AppError || typeof err !== 'object' || err === null) return null;
  const { code, type, status, statusCode } = err as CodedError;

  if (type === 'entity.too.large' || (status ?? statusCode) === 413) {
    return new PayloadTooLargeError();
  }
  if (typeof type === 'string' && BAD_REQUEST_BODY_TYPES.has(type)) {
    return new ValidationError('Request body is malformed.');
  }

  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return new ConflictError('The resource already exists.');
  }
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return new ValidationError('A referenced resource does not exist.');
  }
  return null;
};
