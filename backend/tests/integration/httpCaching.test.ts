import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import type { FastifyInstance } from 'fastify';

// The app is built once with two trusted proxy hops; every check below runs
// against the plugin registration of buildApp itself.
let app: FastifyInstance;
let workDir: string;
let closeDb: () => Promise<void>;

const LARGE_BODY = {
  items: Array.from({ length: 400 }, (_, i) => ({
    id: i,
    name: `Plant ${i}`,
    note: 'water weekly',
  })),
};

beforeAll(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plantcare-http-'));
  process.env.DB_PATH = path.join(workDir, 'http.db');
  process.env.NAS_PATH = path.join(workDir, 'uploads');
  process.env.TRUST_PROXY_HOPS = '2';

  const { buildApp } = await import('../../src/app');
  const dbModule = await import('../../src/core/database/db');
  const { createSseEndpoint } = await import('../../src/core/sse');
  const { createLimiter } = await import('../../src/core/middleware');
  (await import('../../src/core/logging')).logger.silent = true;
  await dbModule.initDatabase();
  closeDb = dbModule.closeDb;

  app = await buildApp();
  app.get('/test/large', async () => LARGE_BODY);
  app.get('/test/small', async () => ({ ok: true }));
  app.get('/test/ip', async (request) => ({ ip: request.ip }));
  app.get(
    '/test/stream',
    createSseEndpoint({
      name: 'Test',
      errorMessage: 'failed',
      run: async ({ sse }) => {
        await sse.send(LARGE_BODY.items);
      },
    }),
  );
  app.get(
    '/test/limited',
    { preHandler: createLimiter(app, { windowMs: 60_000, max: 1 }) },
    async () => ({ ok: true }),
  );
  await app.ready();
  fs.writeFileSync(path.join(process.env.NAS_PATH, 'probe.webp'), Buffer.alloc(64, 1));
});

afterAll(async () => {
  await app?.close();
  await closeDb?.();
  delete process.env.TRUST_PROXY_HOPS;
  try {
    fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* best-effort cleanup */
  }
});

describe('compression', () => {
  it('compresses a large JSON response with brotli or gzip as negotiated', async () => {
    const br = await app.inject({
      method: 'GET',
      url: '/test/large',
      headers: { 'accept-encoding': 'br, gzip' },
    });
    expect(br.statusCode).toBe(200);
    expect(br.headers['content-encoding']).toBe('br');
    expect(JSON.parse(zlib.brotliDecompressSync(br.rawPayload).toString('utf8'))).toEqual(
      LARGE_BODY,
    );
    expect(br.rawPayload.length).toBeLessThan(JSON.stringify(LARGE_BODY).length / 4);

    const gzip = await app.inject({
      method: 'GET',
      url: '/test/large',
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(gzip.headers['content-encoding']).toBe('gzip');
    expect(JSON.parse(zlib.gunzipSync(gzip.rawPayload).toString('utf8'))).toEqual(LARGE_BODY);
  });

  it('leaves responses under the threshold uncompressed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/small',
      headers: { 'accept-encoding': 'br, gzip' },
    });
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.json()).toEqual({ ok: true });
  });

  it('never compresses an SSE stream', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/stream',
      headers: { 'accept-encoding': 'br, gzip' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.payload).toContain('Plant 399');
  });
});

describe('etag', () => {
  it('sends a weak etag and answers a matching If-None-Match with 304', async () => {
    const first = await app.inject({
      method: 'GET',
      url: '/test/large',
      headers: { 'accept-encoding': 'gzip' },
    });
    const tag = first.headers.etag as string;
    expect(tag).toMatch(/^W\/".+"$/);

    const again = await app.inject({
      method: 'GET',
      url: '/test/large',
      headers: { 'if-none-match': tag },
    });
    expect(again.headers.etag).toBe(tag);

    const revalidated = await app.inject({
      method: 'GET',
      url: '/test/large',
      headers: { 'if-none-match': tag, 'accept-encoding': 'gzip' },
    });
    expect(revalidated.statusCode).toBe(304);
    expect(revalidated.rawPayload.length).toBe(0);
  });
});

describe('static uploads', () => {
  it('are cached for a year as immutable', async () => {
    const res = await app.inject({ method: 'GET', url: '/uploads/probe.webp' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });
});

describe('cors', () => {
  it('lets browsers cache preflight answers', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/v2/plants',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' },
    });
    expect(res.headers['access-control-max-age']).toBe('600');
  });
});

describe('trusted proxy hops', () => {
  const forwarded = (client: string) => ({ 'x-forwarded-for': `${client}, 10.0.0.2` });

  it('resolves the client address behind two proxies', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/ip',
      headers: forwarded('203.0.113.7'),
    });
    expect(res.json()).toEqual({ ip: '203.0.113.7' });
  });

  it('keys the IP rate limiter by the client, not by the inner proxy', async () => {
    const limited = (client: string) =>
      app.inject({ method: 'GET', url: '/test/limited', headers: forwarded(client) });
    expect((await limited('203.0.113.1')).statusCode).toBe(200);
    expect((await limited('203.0.113.2')).statusCode).toBe(200);
    expect((await limited('203.0.113.1')).statusCode).toBe(429);
  });
});
