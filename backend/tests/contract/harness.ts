/**
 * tests/contract/harness.ts
 *
 * Transport-agnostic HTTP test harness. Contract tests talk to the
 * `TestClient` interface only; this file is the single place that knows how
 * to reach the application (Fastify `inject`). The tests
 * run against a real SQLite file built by the migrations; only the
 * network-facing collaborators (scrapers, OpenAI, link searchers) are fakes.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../src/app';

// ── Public contract ───────────────────────────────────────────────────────────

export interface MultipartPart {
  field: string;
  filename?: string;
  contentType?: string;
  data: Buffer | string;
}

export interface ContractRequest {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete' | 'options';
  url: string;
  headers?: Record<string, string>;
  /** Serialized with JSON.stringify and sent as application/json. */
  json?: unknown;
  /** Sent verbatim; use with `contentType` to exercise parser edge cases. */
  rawBody?: string;
  contentType?: string;
  multipart?: MultipartPart[];
  cookies?: string[];
}

export interface ContractResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  /** Name=value pairs of every Set-Cookie header, attributes stripped. */
  cookies: string[];
  /** Full Set-Cookie header lines, attributes included. */
  setCookies: string[];
  /** Parsed JSON when the response is JSON, otherwise undefined. */
  body: any;
  text: string;
  bytes: Buffer;
}

export interface TestClient {
  request(req: ContractRequest): Promise<ContractResponse>;
}

// ── Multipart encoding (shared by every adapter) ─────────────────────────────

const buildMultipart = (parts: MultipartPart[]): { body: Buffer; contentType: string } => {
  const boundary = `----contract${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${part.field}"`;
    if (part.filename !== undefined) head += `; filename="${part.filename}"`;
    head += '\r\n';
    if (part.contentType) head += `Content-Type: ${part.contentType}\r\n`;
    chunks.push(Buffer.from(`${head}\r\n`));
    chunks.push(Buffer.isBuffer(part.data) ? part.data : Buffer.from(part.data));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
};

// ── Fastify inject adapter ────────────────────────────────────────────────────

const createInjectClient = (app: FastifyInstance): TestClient => ({
  async request(req) {
    const headers: Record<string, string> = { ...(req.headers ?? {}) };
    if (req.cookies?.length) headers['cookie'] = req.cookies.join('; ');

    let payload: string | Buffer | undefined;
    if (req.multipart) {
      const built = buildMultipart(req.multipart);
      headers['content-type'] = built.contentType;
      payload = built.body;
    } else if (req.rawBody !== undefined) {
      headers['content-type'] = req.contentType ?? 'application/json';
      payload = req.rawBody;
    } else if (req.json !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(req.json);
    } else if (req.contentType) {
      headers['content-type'] = req.contentType;
    }

    const res = await app.inject({
      method: req.method.toUpperCase() as 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'OPTIONS',
      url: req.url,
      headers,
      payload,
    });

    const bytes = res.rawPayload;
    const text = bytes.toString('utf8');
    const type = String(res.headers['content-type'] ?? '');
    let body: any;
    if (type.includes('json') && text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
    }
    const raw = res.headers['set-cookie'];
    const setCookies = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
    return {
      status: res.statusCode,
      headers: res.headers as ContractResponse['headers'],
      setCookies,
      cookies: setCookies.map((c) => c.split(';')[0]),
      body,
      text,
      bytes,
    };
  },
});

// ── Environment and app factory ──────────────────────────────────────────────

export interface ContractApp {
  client: TestClient;
  /** Direct database access for seeding fixtures that have no API. */
  db: {
    query: <T extends object>(sql: string, params?: SqlParam[]) => T[];
    execute: (sql: string, params?: SqlParam[]) => { affectedRows: number; insertId: number };
  };
  /** Issues a signed access token and registers the session, like a login. */
  session: (user: { id: number; username: string; role: string }) => {
    accessToken: string;
    refreshToken: string;
    auth: Record<string, string>;
    refreshCookie: string;
  };
  /** Inserts a user row directly (no HTTP, no rate limit) and returns it. */
  createUser: (
    role?: 'admin' | 'user' | 'guest',
  ) => Promise<{ id: number; username: string; role: string }>;
  /** Creates a user and returns a ready-to-use Authorization header. */
  signIn: (role?: 'admin' | 'user' | 'guest') => Promise<{
    user: { id: number; username: string; role: string };
    auth: Record<string, string>;
    refreshCookie: string;
  }>;
  /** Encoded 8x8 PNG, usable as an upload fixture. */
  png: () => Promise<Buffer>;
  close: () => Promise<void>;
}

type SqlParam = string | number | boolean | null | Buffer;

const ROLE_ID = { admin: 1, user: 2, guest: 3 } as const;

let counter = 0;

export const createContractApp = async (deps: AppDeps = {}): Promise<ContractApp> => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plantcare-contract-'));
  process.env.DB_PATH = path.join(workDir, 'contract.db');
  process.env.NAS_PATH = path.join(workDir, 'uploads');
  process.env.JWT_SECRET ??= 'contract-jwt-secret';
  process.env.JWT_REFRESH_SECRET ??= 'contract-jwt-refresh-secret';

  const { buildApp } = await import('../../src/app');
  const dbModule = await import('../../src/core/database/db');
  const authModule = await import('../../src/core/auth');
  (await import('../../src/core/logging')).logger.silent = true;
  await dbModule.initDatabase();

  const app = await buildApp(deps);
  await app.ready();
  const db: ContractApp['db'] = {
    query: <T extends object>(sql: string, params: SqlParam[] = []) =>
      dbModule
        .getSqlite()
        .prepare(sql)
        .all(...params) as T[],
    execute: (sql, params = []) => {
      const result = dbModule
        .getSqlite()
        .prepare(sql)
        .run(...params);
      return { affectedRows: result.changes, insertId: Number(result.lastInsertRowid) };
    },
  };
  const hash = await bcrypt.hash('contract-password', 4);

  const session: ContractApp['session'] = (user) => {
    const { accessToken, refreshToken } = authModule.issueSession(user);
    return {
      accessToken,
      refreshToken,
      auth: { Authorization: `Bearer ${accessToken}` },
      refreshCookie: `refreshToken=${refreshToken}`,
    };
  };

  const createUser: ContractApp['createUser'] = async (role = 'user') => {
    counter += 1;
    const username = `${role}-${counter}-${Math.random().toString(36).slice(2, 6)}`;
    const result = db.execute('INSERT INTO users (username, password, role_id) VALUES (?, ?, ?)', [
      username,
      hash,
      ROLE_ID[role],
    ]);
    return { id: result.insertId, username, role };
  };

  return {
    client: createInjectClient(app),
    db,
    session,
    createUser,
    signIn: async (role = 'user') => {
      const user = await createUser(role);
      const { auth, refreshCookie } = session(user);
      return { user, auth, refreshCookie };
    },
    png: () =>
      sharp({ create: { width: 8, height: 8, channels: 3, background: '#2a8a4a' } })
        .png()
        .toBuffer(),
    close: async () => {
      await app.close();
      await dbModule.closeDb();
      // Sharp can keep uploaded files open on Windows; the OS temp dir is cleaned up later.
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        /* best-effort cleanup */
      }
    },
  };
};

export const API = '/api/v2';
