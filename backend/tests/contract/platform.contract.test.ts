import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, createContractApp, type ContractApp } from './harness';

let app: ContractApp;

beforeAll(async () => {
  app = await createContractApp();
});
afterAll(() => app.close());

describe('health probes', () => {
  it('reports status, uptime, db and version', async () => {
    const res = await app.client.request({ method: 'get', url: `${API}/health` });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'connected', version: 'v2' });
    expect(typeof res.body.uptime).toBe('string');
    expect(typeof res.body.uptime_s).toBe('number');
  });

  it('answers the readiness probe', async () => {
    const res = await app.client.request({ method: 'get', url: `${API}/health/ready` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ready: true });
  });

  it('serves no health endpoint outside the versioned prefix', async () => {
    const res = await app.client.request({ method: 'get', url: '/health' });
    expect(res.status).toBe(404);
  });
});

describe('not found and request id', () => {
  it('answers unknown routes with the error envelope', async () => {
    const res = await app.client.request({ method: 'get', url: `${API}/nonexistent` });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        type: 'NotFoundError',
        message: `Route GET ${API}/nonexistent not found`,
        statusCode: 404,
      },
    });
  });

  it('adds a generated X-Request-Id header', async () => {
    const res = await app.client.request({ method: 'get', url: `${API}/health` });
    expect(String(res.headers['x-request-id'])).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a client supplied X-Request-Id', async () => {
    const res = await app.client.request({
      method: 'get',
      url: `${API}/health`,
      headers: { 'X-Request-Id': 'client-id-1' },
    });
    expect(res.headers['x-request-id']).toBe('client-id-1');
  });

  it('uses the JSON content type for error bodies', async () => {
    const res = await app.client.request({ method: 'get', url: `${API}/nonexistent` });
    expect(String(res.headers['content-type'])).toContain('application/json');
  });
});

describe('CORS', () => {
  it('allows localhost origins outside production and sends credentials headers', async () => {
    const res = await app.client.request({
      method: 'get',
      url: `${API}/health`,
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('serves requests without an Origin header', async () => {
    const res = await app.client.request({ method: 'get', url: `${API}/health` });
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('known defects', () => {
  it('answers a disallowed origin with 500 instead of omitting CORS headers', async () => {
    const res = await app.client.request({
      method: 'get',
      url: `${API}/health`,
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.status).toBe(500);
    expect(res.body.error.type).toBe('InternalServerError');
  });

  it('answers a malformed JSON body with 500 instead of 400', async () => {
    const res = await app.client.request({
      method: 'post',
      url: `${API}/auth/login`,
      rawBody: '{bad',
    });
    expect(res.status).toBe(500);
  });

  it('answers a JSON body over 100 kb with 500 instead of 413', async () => {
    const res = await app.client.request({
      method: 'post',
      url: `${API}/auth/login`,
      json: { username: 'x'.repeat(150 * 1024), password: 'p' },
    });
    expect(res.status).toBe(500);
  });
});
