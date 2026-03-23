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
    mockQuery.mockReturnValue([]);          // no existing user
    mockExecute.mockReturnValue({ affectedRows: 1, insertId: 5 });
    const app = buildTestApp();
    const res = await request(app)
      .post('/api/v2/auth/register')
      .send({ username: 'newuser', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
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
    const res = await request(buildTestApp())
      .post('/api/v2/plants')
      .set('Authorization', makeAuthHeader())
      .send({ name: 'Fern', species: 'Nephrolepis', substrateId: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.plantId).toBe(7);
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
    const res = await request(buildTestApp())
      .post('/api/v2/watering/1')
      .set('Authorization', makeAuthHeader())
      .send({ usedFertilizer: true, fertilizerTypeId: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.waterRecordId).toBe(15);
    sessionStore.deleteAll(USER_ID);
  });
});

// ── Substrate routes ──────────────────────────────────────────────────────────

describe('GET /api/v2/substrates/public', () => {
  it('returns public substrates', async () => {
    mockQuery.mockReturnValue([makeSubstrateRow()]);
    const res = await request(buildTestApp())
      .get('/api/v2/substrates/public')
      .set('Authorization', makeAuthHeader());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    sessionStore.deleteAll(USER_ID);
  });
});

// ── Component routes (admin) ──────────────────────────────────────────────────

describe('POST /api/v2/components/admin', () => {
  it('returns 403 for non-admin users', async () => {
    const res = await request(buildTestApp())
      .post('/api/v2/components/admin')
      .set('Authorization', makeAuthHeader('user'))
      .send({ name: 'Perlite', fineness: 1 });
    expect(res.status).toBe(403);
    sessionStore.deleteAll(USER_ID);
  });

  it('returns 201 for admin users', async () => {
    mockExecute.mockReturnValue({ affectedRows: 1, insertId: 3 });
    const res = await request(buildTestApp())
      .post('/api/v2/components/admin')
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
