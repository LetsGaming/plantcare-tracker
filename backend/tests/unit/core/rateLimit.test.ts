import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';

import { createRateLimiter, perUserKey } from '../../../src/core/middleware/rateLimit';
import { TooManyRequestsError } from '../../../src/core/errors';

const call = async (limiter: ReturnType<typeof createRateLimiter>, req: Partial<Request>) => {
  const next = vi.fn();
  const res = { setHeader: vi.fn(), set: vi.fn(), getHeader: vi.fn() } as unknown as Response;
  await limiter({ ip: '1.2.3.4', ...req } as Request, res, next);
  return next.mock.calls[0]?.[0];
};

describe('createRateLimiter', () => {
  it('passes requests under the limit and rejects the next one with a 429 error', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    expect(await call(limiter, {})).toBeUndefined();
    expect(await call(limiter, {})).toBeUndefined();
    const error = await call(limiter, {});
    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect((error as TooManyRequestsError).statusCode).toBe(429);
  });

  it('keeps separate buckets per key', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, key: perUserKey });
    const a = { user: { id: 1, username: 'a', role: 'user' } } as Partial<Request>;
    const b = { user: { id: 2, username: 'b', role: 'user' } } as Partial<Request>;
    expect(await call(limiter, a)).toBeUndefined();
    expect(await call(limiter, b)).toBeUndefined();
    expect(await call(limiter, a)).toBeInstanceOf(TooManyRequestsError);
  });
});

describe('perUserKey', () => {
  it('keys by user id and defers to the IP when anonymous', () => {
    expect(perUserKey({ user: { id: 7 } } as Request)).toBe('user:7');
    expect(perUserKey({} as Request)).toBeUndefined();
  });
});
