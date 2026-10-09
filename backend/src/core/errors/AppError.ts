/**
 * core/errors/AppError.ts
 *
 * Base class for all domain-specific errors.
 * Each error carries its own HTTP status code so the global
 * error-handler middleware can map them without any if/switch logic.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── 400 ──────────────────────────────────────────────────────────────────────

export class ValidationError extends AppError {
  public readonly fields?: Record<string, string>;

  constructor(message: string, fields?: Record<string, string>) {
    super(message, 400);
    this.fields = fields;
  }
}

// ── 401 ──────────────────────────────────────────────────────────────────────

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

// ── 403 ──────────────────────────────────────────────────────────────────────

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403);
  }
}

// ── 404 ──────────────────────────────────────────────────────────────────────

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
  }
}

// ── 409 ──────────────────────────────────────────────────────────────────────

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

// ── 413 ──────────────────────────────────────────────────────────────────────

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Request body is too large') {
    super(message, 413);
  }
}

// ── 429 ──────────────────────────────────────────────────────────────────────

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429);
  }
}

// ── 500 ──────────────────────────────────────────────────────────────────────

export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred') {
    super(message, 500, false);
  }
}

// ── 503 ──────────────────────────────────────────────────────────────────────

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503);
  }
}

// ── Type guard ────────────────────────────────────────────────────────────────

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;
