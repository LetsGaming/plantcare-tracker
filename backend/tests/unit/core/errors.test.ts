/**
 * tests/unit/core/errors.test.ts
 *
 * Tests for the AppError class hierarchy.
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InternalError,
  isAppError,
} from '../../../src/core/errors';

describe('AppError base class', () => {
  it('sets message, statusCode, and isOperational', () => {
    const err = new AppError('Something failed', 400);
    expect(err.message).toBe('Something failed');
    expect(err.statusCode).toBe(400);
    expect(err.isOperational).toBe(true);
  });

  it('allows non-operational errors', () => {
    const err = new AppError('crash', 500, false);
    expect(err.isOperational).toBe(false);
  });

  it('is an instance of Error', () => {
    expect(new AppError('x', 400)).toBeInstanceOf(Error);
  });
});

describe('ValidationError', () => {
  it('has statusCode 400', () => {
    expect(new ValidationError('bad input').statusCode).toBe(400);
  });

  it('carries optional field errors', () => {
    const err = new ValidationError('Invalid', { name: 'Required' });
    expect(err.fields).toEqual({ name: 'Required' });
  });
});

describe('UnauthorizedError', () => {
  it('has statusCode 401', () => {
    expect(new UnauthorizedError().statusCode).toBe(401);
  });

  it('has a default message', () => {
    expect(new UnauthorizedError().message).toBe('Authentication required');
  });
});

describe('ForbiddenError', () => {
  it('has statusCode 403', () => {
    expect(new ForbiddenError().statusCode).toBe(403);
  });
});

describe('NotFoundError', () => {
  it('has statusCode 404', () => {
    expect(new NotFoundError('Plant').statusCode).toBe(404);
  });

  it('includes resource name in message', () => {
    expect(new NotFoundError('Substrate').message).toContain('Substrate');
  });
});

describe('ConflictError', () => {
  it('has statusCode 409', () => {
    expect(new ConflictError('Already exists').statusCode).toBe(409);
  });
});

describe('InternalError', () => {
  it('has statusCode 500', () => {
    expect(new InternalError().statusCode).toBe(500);
  });

  it('is not operational', () => {
    expect(new InternalError().isOperational).toBe(false);
  });
});

describe('isAppError type guard', () => {
  it('returns true for AppError instances', () => {
    expect(isAppError(new ValidationError('x'))).toBe(true);
    expect(isAppError(new NotFoundError('y'))).toBe(true);
  });

  it('returns false for plain Error', () => {
    expect(isAppError(new Error('plain'))).toBe(false);
  });

  it('returns false for non-errors', () => {
    expect(isAppError('string')).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });
});
