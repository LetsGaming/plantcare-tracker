import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const API = '/api/v2';
const PASSWORD = 'secret-pass';

interface Instance {
  app: FastifyInstance;
  rows: <T extends object>(sql: string, params?: Array<string | number>) => T[];
  exec: (sql: string, params?: Array<string | number>) => number;
  signAccessToken: (user: { id: number; username: string; role: string }, sid: string) => string;
  close: () => Promise<void>;
}

let workDir: string;
let current: Instance | null = null;

/**
 * Builds a fresh app on the shared database file. Module state (connection,
 * config, rate limit buckets) is reset, so each call behaves like a new process.
 */
const boot = async (trustProxyHops?: number): Promise<Instance> => {
  process.env.DB_PATH = path.join(workDir, 'sessions.db');
  process.env.NAS_PATH = path.join(workDir, 'uploads');
  process.env.JWT_SECRET ??= 'contract-jwt-secret';
  process.env.JWT_REFRESH_SECRET ??= 'contract-jwt-refresh-secret';
  if (trustProxyHops === undefined) delete process.env.TRUST_PROXY_HOPS;
  else process.env.TRUST_PROXY_HOPS = String(trustProxyHops);

  vi.resetModules();
  const { buildApp } = await import('../../src/app');
  const dbModule = await import('../../src/core/database/db');
  const tokens = await import('../../src/core/auth/tokens');
  (await import('../../src/core/logging')).logger.silent = true;
  await dbModule.initDatabase();
  const app = await buildApp({ sales: { autoRefresh: false } });
  await app.ready();
  const instance: Instance = {
    app,
    rows: (sql, params = []) =>
      dbModule
        .getSqlite()
        .prepare(sql)
        .all(...params) as never,
    exec: (sql, params = []) =>
      Number(
        dbModule
          .getSqlite()
          .prepare(sql)
          .run(...params).lastInsertRowid,
      ),
    signAccessToken: tokens.signAccessToken,
    close: async () => {
      await app.close();
      await dbModule.closeDb();
      if (current === instance) current = null;
    },
  };
  current = instance;
  return instance;
};

beforeAll(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plantcare-sessions-contract-'));
});

afterAll(async () => {
  await current?.close();
  delete process.env.TRUST_PROXY_HOPS;
  try {
    fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* best-effort cleanup */
  }
});

let seq = 0;
const uniqueName = () => `sess-${++seq}-${Math.random().toString(36).slice(2, 6)}`;

const post = (
  inst: Instance,
  url: string,
  options: { json?: unknown; cookie?: string; headers?: Record<string, string>; ip?: string } = {},
) =>
  inst.app.inject({
    method: 'POST',
    url: `${API}${url}`,
    headers: {
      'content-type': 'application/json',
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    },
    payload: options.json === undefined ? '{}' : JSON.stringify(options.json),
    remoteAddress: options.ip,
  });

const refreshCookieOf = (res: { cookies: Array<{ name: string; value: string }> }) => {
  const cookie = res.cookies.find((c) => c.name === 'refreshToken');
  if (!cookie) throw new Error('No refresh cookie');
  return `refreshToken=${cookie.value}`;
};

const loginAs = async (inst: Instance, username: string) => {
  const res = await post(inst, '/auth/login', { json: { username, password: PASSWORD } });
  expect(res.statusCode).toBe(200);
  return { cookie: refreshCookieOf(res), accessToken: res.json().data.accessToken as string };
};

describe('sessions across app instances on one database file', () => {
  it('accepts a refresh token of a closed instance on a new one and lets logout end it', async () => {
    const a = await boot();
    const username = uniqueName();
    expect(
      (await post(a, '/auth/register', { json: { username, password: PASSWORD } })).statusCode,
    ).toBe(201);
    const { cookie, accessToken } = await loginAs(a, username);
    await a.close();

    const b = await boot();
    const refreshed = await post(b, '/auth/refresh-token', { cookie });
    expect(refreshed.statusCode).toBe(200);
    const newAccess = refreshed.json().data.accessToken as string;
    for (const token of [accessToken, newAccess]) {
      const me = await b.app.inject({
        method: 'GET',
        url: `${API}/components`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(me.statusCode, token).toBe(200);
    }
    expect(b.rows('SELECT sid FROM sessions')).toHaveLength(1);

    expect((await post(b, '/auth/logout', { cookie })).statusCode).toBe(204);
    expect(b.rows('SELECT sid FROM sessions')).toHaveLength(0);
    expect((await post(b, '/auth/refresh-token', { cookie })).statusCode).toBe(401);
    const afterLogout = await b.app.inject({
      method: 'GET',
      url: `${API}/components`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(afterLogout.statusCode).toBe(401);
    await b.close();

    const c = await boot();
    expect((await post(c, '/auth/refresh-token', { cookie })).statusCode).toBe(401);
    await c.close();
  });

  it('answers 401 Invalid session for an access token whose sid has no session row', async () => {
    const inst = await boot();
    const username = uniqueName();
    const id = inst.exec('INSERT INTO users (username, password, role_id) VALUES (?, ?, 2)', [
      username,
      'x',
    ]);
    const token = inst.signAccessToken({ id, username, role: 'user' }, randomUUID());
    const res = await inst.app.inject({
      method: 'GET',
      url: `${API}/components`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toBe('Invalid session. Please log in again.');
    await inst.close();
  });
});

describe('password hashing', () => {
  it('stores a scrypt hash on register', async () => {
    const inst = await boot();
    const username = uniqueName();
    await post(inst, '/auth/register', { json: { username, password: PASSWORD } });
    const [row] = inst.rows<{ password: string }>('SELECT password FROM users WHERE username = ?', [
      username,
    ]);
    expect(row.password).toMatch(/^scrypt\$16384\$8\$1\$/);
    await loginAs(inst, username);
    await inst.close();
  });

  it('logs a legacy bcrypt user in and rehashes the password to scrypt', async () => {
    const inst = await boot();
    const username = uniqueName();
    const legacy = await bcrypt.hash(PASSWORD, 4);
    inst.exec('INSERT INTO users (username, password, role_id) VALUES (?, ?, 2)', [
      username,
      legacy,
    ]);

    const wrong = await post(inst, '/auth/login', { json: { username, password: 'wrong-pass-1' } });
    expect(wrong.statusCode).toBe(401);
    expect(
      inst.rows<{ password: string }>('SELECT password FROM users WHERE username = ?', [
        username,
      ])[0].password,
    ).toBe(legacy);

    await loginAs(inst, username);
    const [row] = inst.rows<{ password: string }>('SELECT password FROM users WHERE username = ?', [
      username,
    ]);
    expect(row.password).toMatch(/^scrypt\$16384\$8\$1\$/);
    await loginAs(inst, username);
    expect(
      inst.rows<{ password: string }>('SELECT password FROM users WHERE username = ?', [
        username,
      ])[0].password,
    ).toBe(row.password);
    await inst.close();
  });
});

describe('trust proxy and the login rate limiter', () => {
  const PER_IP = 50;

  const exhaust = async (inst: Instance, forwarded: string) => {
    const statuses: number[] = [];
    for (let i = 0; i <= PER_IP; i += 1) {
      const res = await post(inst, '/auth/login', {
        json: { username: `nobody-${i}`, password: PASSWORD },
        headers: { 'x-forwarded-for': forwarded },
        ip: '10.0.0.1',
      });
      statuses.push(res.statusCode);
    }
    return statuses;
  };

  const attempt = (inst: Instance, forwarded: string) =>
    post(inst, '/auth/login', {
      json: { username: 'someone-else', password: PASSWORD },
      headers: { 'x-forwarded-for': forwarded },
      ip: '10.0.0.1',
    });

  it('keys on the client behind two trusted hops, so clients behind one proxy do not share', async () => {
    const inst = await boot(2);
    const statuses = await exhaust(inst, '203.0.113.1, 10.0.0.2');
    expect(statuses.slice(0, PER_IP).every((s) => s === 401)).toBe(true);
    expect(statuses[PER_IP]).toBe(429);

    expect((await attempt(inst, '203.0.113.1, 10.0.0.2')).statusCode).toBe(429);
    expect((await attempt(inst, '203.0.113.2, 10.0.0.2')).statusCode).toBe(401);
    await inst.close();
  });

  it('keys on the proxy adjacent address with one hop, so those clients share a bucket', async () => {
    const inst = await boot(1);
    const statuses = await exhaust(inst, '203.0.113.1, 10.0.0.2');
    expect(statuses[PER_IP]).toBe(429);

    expect((await attempt(inst, '203.0.113.2, 10.0.0.2')).statusCode).toBe(429);
    expect((await attempt(inst, '203.0.113.2, 10.0.0.3')).statusCode).toBe(401);
    await inst.close();
  });
});
