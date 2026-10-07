import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import {
  createLimiter,
  globalErrorHandler,
  perUserKey,
  registerRateLimit,
} from '../../../src/core/middleware';

let app: FastifyInstance;

afterEach(() => app.close());

const buildApp = async (limits: Parameters<typeof createLimiter>[1][]) => {
  app = Fastify();
  app.setErrorHandler(globalErrorHandler);
  await registerRateLimit(app);
  app.addHook('onRequest', async (request) => {
    const id = request.headers['x-user'];
    if (typeof id === 'string') request.user = { id: Number(id), username: id, role: 'user' };
  });
  app.get('/limited', { preHandler: limits.map((l) => createLimiter(app, l)) }, async () => ({
    ok: true,
  }));
  await app.ready();
  return app;
};

const get = (headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url: '/limited', headers });

describe('createLimiter', () => {
  it('passes requests under the limit and answers the next one with the 429 envelope', async () => {
    await buildApp([{ windowMs: 60_000, max: 2 }]);
    expect((await get()).statusCode).toBe(200);
    expect((await get()).statusCode).toBe(200);
    const res = await get();
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toMatchObject({ type: 'TooManyRequestsError', statusCode: 429 });
  });

  it('keeps separate buckets per key', async () => {
    await buildApp([{ windowMs: 60_000, max: 1, key: perUserKey }]);
    expect((await get({ 'x-user': '1' })).statusCode).toBe(200);
    expect((await get({ 'x-user': '2' })).statusCode).toBe(200);
    expect((await get({ 'x-user': '1' })).statusCode).toBe(429);
  });

  it('enforces every limiter on a route independently', async () => {
    await buildApp([
      { windowMs: 60_000, max: 10 },
      { windowMs: 60_000, max: 1, key: perUserKey },
    ]);
    expect((await get({ 'x-user': '1' })).statusCode).toBe(200);
    expect((await get({ 'x-user': '1' })).statusCode).toBe(429);
    expect((await get({ 'x-user': '2' })).statusCode).toBe(200);
  });
});

describe('perUserKey', () => {
  it('keys by user id and defers to the IP when anonymous', () => {
    expect(perUserKey({ user: { id: 7 } } as never)).toBe('user:7');
    expect(perUserKey({} as never)).toBeUndefined();
  });
});
