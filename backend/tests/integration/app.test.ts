/**
 * tests/integration/app.test.ts
 *
 * Integration tests using supertest against a real Express app instance.
 * The `src/core/database/db` module is mocked so better-sqlite3 is never
 * loaded — these tests verify middleware, routing, and error handling only.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Application } from 'express';

// ── Mock the db singleton BEFORE any repository imports ───────────────────────

const mockQuery   = vi.fn().mockReturnValue([]);
const mockExecute = vi.fn().mockReturnValue({ affectedRows: 1, insertId: 1 });
const mockTx      = vi.fn().mockImplementation((fn: Function) =>
  fn({ query: mockQuery, execute: mockExecute }),
);

vi.mock('../../src/core/database/db', () => ({
  query:       (...args: unknown[]) => mockQuery(...args),
  execute:     (...args: unknown[]) => mockExecute(...args),
  transaction: (...args: unknown[]) => mockTx(...args),
  getDb:       vi.fn().mockReturnValue({ prepare: vi.fn().mockReturnValue({ get: vi.fn(), run: vi.fn() }) }),
  closeDb:     vi.fn(),
}));

// ── Imports (after mock) ──────────────────────────────────────────────────────

import { requestIdMiddleware, globalErrorHandler, notFoundHandler } from '../../src/core/middleware';
import { createAuthRouter }      from '../../src/modules/auth/presentation/authRoutes';
import { createPlantsRouter }    from '../../src/modules/plants/presentation/plantsRoutes';
import { createWateringRouter }  from '../../src/modules/watering/presentation/wateringRoutes';
import { createSubstrateRouter } from '../../src/modules/substrate/presentation/substrateRoutes';
import { createComponentRouter } from '../../src/modules/components/presentation/componentRoutes';
import { makePlantRow, makeWateringRow, makeSubstrateRow } from '../helpers/mockFactory';
import { generateTokens, sessionStore } from '../../src/core/middleware/auth';
import bcrypt from 'bcryptjs';

// ── App factory ───────────────────────────────────────────────────────────────

const buildTestApp = (): Application => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use('/api/v2/auth',       createAuthRouter());
  app.use('/api/v2/plants',     createPlantsRouter());
  app.use('/api/v2/watering',   createWateringRouter());
  app.use('/api/v2/substrates', createSubstrateRouter());
  app.use('/api/v2/components', createComponentRouter());
  app.use(notFoundHandler);
  app.use(globalErrorHandler);
  return app;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID  = 10;
const ADMIN_ID = 1;

const makeAuthHeader = (role = 'user', id = USER_ID) => {
  const { accessToken, refreshToken } = generateTokens({ id, username: 'testuser', role });
  sessionStore.save(id, refreshToken);
  return `Bearer ${accessToken}`;
};

beforeEach(() => {
  mockQuery.mockReset().mockReturnValue([]);
  mockExecute.mockReset().mockReturnValue({ affectedRows: 1, insertId: 1 });
  mockTx.mockReset().mockImplementation((fn: Function) =>
    fn({ query: mockQuery, execute: mockExecute }),
  );
});

// ── Auth routes ───────────────────────────────────────────────────────────────

describe('POST /api/v2/auth/register', () => {
  it('returns 201 with new user data', async () => {
    // Call 1: findByUsername → no existing user
    // Call 2: find role by name 'user' → return a role row
    mockQuery
      .mockReturnValueOnce([])                  // findByUsername: no conflict
      .mockReturnValueOnce([{ id: 3 }]);        // role lookup: 'user' role exists
    mockExecute.mockReturnValue({ affectedRows: 1, insertId: 5 });
    const app = buildTestApp();
    const res = await request(app)
      .post('/api/v2/auth/register')
      .send({ username: 'newuser', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
  });

  it('returns 409 when username already taken', async () => {
    mockQuery.mockReturnValue([{ id: 1, username: 'existing', password: 'x', role: 'user' }]);
    const app = buildTestApp();
    const res = await request(app)
      .post('/api/v2/auth/register')
      .send({ username: 'existing', password: 'pass' });
    expect(res.status).toBe(409);
  });

  it('returns 400 for missing credentials', async () => {
    const res = await request(buildTestApp()).post('/api/v2/auth/register').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v2/auth/login', () => {
  it('returns 200 with accessToken on valid credentials', async () => {
    const hash = await bcrypt.hash('pass123', 10);
    mockQuery.mockReturnValue([{ id: 1, username: 'alice', password: hash, role: 'user' }]);
    const app = buildTestApp();
    const res = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'alice', password: 'pass123' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    sessionStore.deleteAll(1);
  });

  it('returns 401 for wrong password', async () => {
    const hash = await bcrypt.hash('correct', 10);
    mockQuery.mockReturnValue([{ id: 1, username: 'alice', password: hash, role: 'user' }]);
    const app = buildTestApp();
    const res = await request(app).post('/api/v2/auth/login').send({ username: 'alice', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});

// ── Plants routes ─────────────────────────────────────────────────────────────

describe('GET /api/v2/plants', () => {
  it('returns 200 with public plants (no auth required)', async () => {
    mockQuery.mockReturnValue([makePlantRow()]);
    const res = await request(buildTestApp()).get('/api/v2/plants');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('includes private plants when authenticated', async () => {
    mockQuery.mockReturnValue([makePlantRow({ is_public: 0 })]);
    const res = await request(buildTestApp())
      .get('/api/v2/plants')
      .set('Authorization', makeAuthHeader());
    expect(res.status).toBe(200);
    sessionStore.deleteAll(USER_ID);
  });
});

describe('POST /api/v2/plants', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(buildTestApp())
      .post('/api/v2/plants')
      .send({ name: 'x', species: 'x', substrateId: 1 });
    expect(res.status).toBe(401);
  });

  it('returns 403 for guest users', async () => {
    const auth = makeAuthHeader('guest', 3);
    const res = await request(buildTestApp())
      .post('/api/v2/plants')
      .set('Authorization', auth)
      .send({ name: 'x', species: 'x', substrateId: 1 });
    expect(res.status).toBe(403);
    sessionStore.deleteAll(3);
  });

  it('returns 201 for authenticated user with valid data', async () => {
    mockExecute.mockReturnValue({ affectedRows: 1, insertId: 7 });
    // The plant repository has a module-level species cache. Depending on
    // prior test execution order it may or may not call query() for species.
    // Strategy: default mockReturnValue returns a plant row for findById;
    // if the cache is cold it will first call query() for species — we use
    // mockReturnValueOnce to serve a matching species row so upsertSpecies
    // finds an exact match (no extra execute). The default fallback then
    // serves the plant row for the subsequent findById call.
    mockQuery
      .mockReturnValueOnce([{ id: 1, name: 'Nephrolepis' }])  // species cache (if cold)
      .mockReturnValue([makePlantRow({ plant_id: 7 })]);       // findById (always needed)
    const res = await request(buildTestApp())
      .post('/api/v2/plants')
      .set('Authorization', makeAuthHeader())
      .send({ name: 'Fern', species: 'Nephrolepis', substrateId: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.plant_id).toBe(7);
    sessionStore.deleteAll(USER_ID);
  });

  it('returns 400 for invalid data (missing species)', async () => {
    const auth = makeAuthHeader();
    const res = await request(buildTestApp())
      .post('/api/v2/plants')
      .set('Authorization', auth)
      .send({ name: 'Fern', substrateId: 1 });
    expect(res.status).toBe(400);
    sessionStore.deleteAll(USER_ID);
  });
});

// ── Watering routes ───────────────────────────────────────────────────────────

describe('GET /api/v2/watering/fertilizer-types', () => {
  it('returns fertilizer types', async () => {
    mockQuery.mockReturnValue([{ id: 1, name: 'organic' }, { id: 2, name: 'synthetic' }]);
    const res = await request(buildTestApp())
      .get('/api/v2/watering/fertilizer-types')
      .set('Authorization', makeAuthHeader());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    sessionStore.deleteAll(USER_ID);
  });
});

describe('POST /api/v2/watering/:plantId', () => {
  it('creates a watering record', async () => {
    mockExecute.mockReturnValue({ affectedRows: 1, insertId: 15 });
    // repo.findById after create calls query — return a watering row
    mockQuery.mockReturnValue([makeWateringRow({ record_id: 15 })]);
    const res = await request(buildTestApp())
      .post('/api/v2/watering/1')
      .set('Authorization', makeAuthHeader())
      .send({ usedFertilizer: true, fertilizerTypeId: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.record_id).toBe(15);
    sessionStore.deleteAll(USER_ID);
  });
});

// ── Substrate routes ──────────────────────────────────────────────────────────

describe('GET /api/v2/substrates', () => {
  it('returns public substrates', async () => {
    mockQuery.mockReturnValue([makeSubstrateRow()]);
    const res = await request(buildTestApp())
      .get('/api/v2/substrates')
      .set('Authorization', makeAuthHeader());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    sessionStore.deleteAll(USER_ID);
  });
});

// ── Component routes (admin) ──────────────────────────────────────────────────

describe('POST /api/v2/components', () => {
  it('returns 403 for non-admin users', async () => {
    const res = await request(buildTestApp())
      .post('/api/v2/components')
      .set('Authorization', makeAuthHeader('user'))
      .send({ name: 'Perlite', fineness: 1 });
    expect(res.status).toBe(403);
    sessionStore.deleteAll(USER_ID);
  });

  it('returns 201 for admin users', async () => {
    mockExecute.mockReturnValue({ affectedRows: 1, insertId: 3 });
    // repo.findById after create calls query — return a component row
    mockQuery.mockReturnValue([{ id: 3, name: 'Perlite', fineness: 1, fineness_name: 'coarse' }]);
    const res = await request(buildTestApp())
      .post('/api/v2/components')
      .set('Authorization', makeAuthHeader('admin', ADMIN_ID))
      .send({ name: 'Perlite', fineness: 1 });
    expect(res.status).toBe(201);
    sessionStore.deleteAll(ADMIN_ID);
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(buildTestApp()).get('/api/v2/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns JSON error shape for all errors', async () => {
    const res = await request(buildTestApp()).get('/api/v2/nonexistent');
    expect(res.body.error).toBeDefined();
    expect(res.body.error.statusCode).toBeDefined();
    expect(res.body.error.message).toBeDefined();
  });

  it('includes X-Request-Id header on all responses', async () => {
    const res = await request(buildTestApp()).get('/api/v2/nonexistent');
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});
// ── Auth session lifecycle (cookie scope + server-side invalidation) ─────────

describe('auth session lifecycle', () => {
  const loginAlice = async (app: Application) => {
    const hash = await bcrypt.hash('pass123', 10);
    mockQuery.mockReturnValue([
      { id: 1, username: 'alice', password: hash, role: 'user' },
    ]);
    return request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'alice', password: 'pass123' });
  };

  const setCookies = (res: request.Response): string[] =>
    (res.headers['set-cookie'] as unknown as string[]) ?? [];

  const extractRefreshCookie = (res: request.Response): string => {
    const cookie = setCookies(res).find((c) => c.startsWith('refreshToken='));
    expect(cookie).toBeTruthy();
    return (cookie as string).split(';')[0]; // "refreshToken=<jwt>"
  };

  it('scopes the login refresh cookie to the auth module so /logout receives it', async () => {
    const res = await loginAlice(buildTestApp());
    const cookieHeader = setCookies(res).join('\n');
    expect(cookieHeader).toContain('Path=/api/v2/auth;');
    // The old refresh-token-only scope kept the cookie away from /logout,
    // so sessions were never invalidated.
    expect(cookieHeader).not.toContain('Path=/api/v2/auth/refresh-token');
    sessionStore.deleteAll(1);
  });

  it('scopes the guest refresh cookie identically (it must be clearable on logout)', async () => {
    mockQuery.mockReturnValue([
      { id: 99, username: 'guest', password: 'x', role: 'guest' },
    ]);
    const res = await request(buildTestApp()).post('/api/v2/auth/login/guest');
    expect(res.status).toBe(200);
    // Previously the guest cookie was set without a path (landing on "/"),
    // so the attribute-matched clearCookie on logout never removed it and
    // guests could not actually sign out.
    expect(setCookies(res).join('\n')).toContain('Path=/api/v2/auth;');
    sessionStore.deleteAll(99);
  });

  it('logout invalidates the session — the same refresh token is rejected afterwards', async () => {
    const app = buildTestApp();
    const cookie = extractRefreshCookie(await loginAlice(app));

    // Sanity: the refresh token works before logout.
    const before = await request(app)
      .post('/api/v2/auth/refresh-token')
      .set('Cookie', cookie);
    expect(before.status).toBe(200);
    expect(before.body.data.accessToken).toBeTruthy();

    // The browser now sends the cookie to /logout (same /auth scope).
    const logoutRes = await request(app)
      .post('/api/v2/auth/logout')
      .set('Cookie', cookie);
    expect(logoutRes.status).toBe(204);

    // The very same refresh token must be dead server-side afterwards.
    const after = await request(app)
      .post('/api/v2/auth/refresh-token')
      .set('Cookie', cookie);
    expect(after.status).toBe(403);
    sessionStore.deleteAll(1);
  });

  it('logout clears the current and all legacy cookie paths', async () => {
    const res = await request(buildTestApp()).post('/api/v2/auth/logout');
    expect(res.status).toBe(204);
    const cleared = setCookies(res).join('\n');
    expect(cleared).toContain('Path=/api/v2/auth;');
    expect(cleared).toContain('Path=/api/v2/auth/refresh-token;');
    expect(cleared).toContain('Path=/;');
  });

  it('refresh without a cookie answers 401', async () => {
    const res = await request(buildTestApp()).post('/api/v2/auth/refresh-token');
    expect(res.status).toBe(401);
  });
});
