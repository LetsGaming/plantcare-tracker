/**
 * tests/integration/app.test.ts
 *
 * Integration tests using supertest against a real Express app instance
 * with a mocked database pool. These tests verify the full request/response
 * cycle including middleware, routing, and error handling.
 *
 * Prerequisites: pnpm add -D supertest @types/supertest
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Application } from 'express';
import type { ResultSetHeader } from 'mysql2/promise';

import { requestIdMiddleware, globalErrorHandler, notFoundHandler } from '../../src-v2/core/middleware';
import { createAuthRouter } from '../../src-v2/modules/auth/presentation/authRoutes';
import { createPlantsRouter } from '../../src-v2/modules/plants/presentation/plantsRoutes';
import { createWateringRouter } from '../../src-v2/modules/watering/presentation/wateringRoutes';
import { createSubstrateRouter } from '../../src-v2/modules/substrate/presentation/substrateRoutes';
import { createComponentRouter } from '../../src-v2/modules/components/presentation/componentRoutes';
import { createMockPool, makePlantRow, makeWateringRow, makeSubstrateRow } from '../helpers/mockFactory';
import { generateTokens, sessionStore } from '../../src-v2/core/middleware/auth';
import bcrypt from 'bcryptjs';

// ── App factory ───────────────────────────────────────────────────────────────

const buildTestApp = (pool: ReturnType<typeof createMockPool>): Application => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestIdMiddleware);

  app.use('/api/v2/auth',       createAuthRouter(pool));
  app.use('/api/v2/plants',     createPlantsRouter(pool));
  app.use('/api/v2/watering',   createWateringRouter(pool));
  app.use('/api/v2/substrates', createSubstrateRouter(pool));
  app.use('/api/v2/components', createComponentRouter(pool));

  app.use(notFoundHandler);
  app.use(globalErrorHandler);
  return app;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = 10;
const ADMIN_ID = 1;

const makeAuthHeader = (role = 'user', id = USER_ID) => {
  const { accessToken, refreshToken } = generateTokens({ id, username: 'testuser', role });
  sessionStore.save(id, refreshToken);
  return `Bearer ${accessToken}`;
};

// ── Auth routes ───────────────────────────────────────────────────────────────

describe('POST /api/v2/auth/register', () => {
  it('returns 201 with new user data', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[], []]); // no existing user
    (pool.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ insertId: 5 } as ResultSetHeader, []]);
    const app = buildTestApp(pool);

    const res = await request(app)
      .post('/api/v2/auth/register')
      .send({ username: 'newuser', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('returns 409 when username already taken', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[{ id: 1, username: 'existing', password: 'x', role: 'user' }], []]);
    const app = buildTestApp(pool);

    const res = await request(app)
      .post('/api/v2/auth/register')
      .send({ username: 'existing', password: 'pass' });

    expect(res.status).toBe(409);
  });

  it('returns 400 for missing credentials', async () => {
    const pool = createMockPool();
    const app = buildTestApp(pool);
    const res = await request(app).post('/api/v2/auth/register').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v2/auth/login', () => {
  it('returns 200 with accessToken on valid credentials', async () => {
    const hash = await bcrypt.hash('pass123', 10);
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      [{ id: 1, username: 'alice', password: hash, role: 'user' }], []
    ]);
    const app = buildTestApp(pool);

    const res = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'alice', password: 'pass123' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    sessionStore.deleteAll(1);
  });

  it('returns 401 for wrong password', async () => {
    const hash = await bcrypt.hash('correct', 10);
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      [{ id: 1, username: 'alice', password: hash, role: 'user' }], []
    ]);
    const app = buildTestApp(pool);
    const res = await request(app).post('/api/v2/auth/login').send({ username: 'alice', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});

// ── Plants routes ─────────────────────────────────────────────────────────────

describe('GET /api/v2/plants', () => {
  it('returns 200 with public plants (no auth required)', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[makePlantRow()], []]);
    const app = buildTestApp(pool);

    const res = await request(app).get('/api/v2/plants');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('includes private plants when authenticated', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[makePlantRow({ is_public: 0 })], []]);
    const app = buildTestApp(pool);

    const res = await request(app)
      .get('/api/v2/plants')
      .set('Authorization', makeAuthHeader());
    expect(res.status).toBe(200);
    sessionStore.deleteAll(USER_ID);
  });
});

describe('POST /api/v2/plants', () => {
  it('returns 401 when not authenticated', async () => {
    const pool = createMockPool();
    const app = buildTestApp(pool);
    const res = await request(app).post('/api/v2/plants').send({ name: 'x', species: 'x', substrateId: 1 });
    expect(res.status).toBe(401);
  });

  it('returns 403 for guest users', async () => {
    const pool = createMockPool();
    const app = buildTestApp(pool);
    const auth = makeAuthHeader('guest', 3);

    const res = await request(app)
      .post('/api/v2/plants')
      .set('Authorization', auth)
      .send({ name: 'x', species: 'x', substrateId: 1 });

    expect(res.status).toBe(403);
    sessionStore.deleteAll(3);
  });

  it('returns 201 for authenticated user with valid data', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[], []]);
    (pool.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ insertId: 7 } as ResultSetHeader, []]);
    const app = buildTestApp(pool);

    const res = await request(app)
      .post('/api/v2/plants')
      .set('Authorization', makeAuthHeader())
      .send({ name: 'Fern', species: 'Nephrolepis', substrateId: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data.plantId).toBe(7);
    sessionStore.deleteAll(USER_ID);
  });

  it('returns 400 for invalid data (missing species)', async () => {
    const pool = createMockPool();
    const app = buildTestApp(pool);
    const auth = makeAuthHeader();

    const res = await request(app)
      .post('/api/v2/plants')
      .set('Authorization', auth)
      .send({ name: 'Fern', substrateId: 1 }); // missing species

    expect(res.status).toBe(400);
    sessionStore.deleteAll(USER_ID);
  });
});

// ── Watering routes ───────────────────────────────────────────────────────────

describe('GET /api/v2/watering/fertilizer-types', () => {
  it('returns fertilizer types', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      [{ id: 1, name: 'organic' }, { id: 2, name: 'synthetic' }], []
    ]);
    const app = buildTestApp(pool);

    const res = await request(app)
      .get('/api/v2/watering/fertilizer-types')
      .set('Authorization', makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    sessionStore.deleteAll(USER_ID);
  });
});

describe('POST /api/v2/watering/:plantId', () => {
  it('creates a watering record', async () => {
    const pool = createMockPool();
    (pool.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ insertId: 15 } as ResultSetHeader, []]);
    const app = buildTestApp(pool);

    const res = await request(app)
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
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue([[makeSubstrateRow()], []]);
    const app = buildTestApp(pool);

    const res = await request(app)
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
    const pool = createMockPool();
    const app = buildTestApp(pool);

    const res = await request(app)
      .post('/api/v2/components/admin')
      .set('Authorization', makeAuthHeader('user'))
      .send({ name: 'Perlite', fineness: 1 });

    expect(res.status).toBe(403);
    sessionStore.deleteAll(USER_ID);
  });

  it('returns 201 for admin users', async () => {
    const pool = createMockPool();
    (pool.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ insertId: 3 } as ResultSetHeader, []]);
    const app = buildTestApp(pool);

    const res = await request(app)
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
    const pool = createMockPool();
    const app = buildTestApp(pool);
    const res = await request(app).get('/api/v2/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns JSON error shape for all errors', async () => {
    const pool = createMockPool();
    const app = buildTestApp(pool);
    const res = await request(app).get('/api/v2/nonexistent');
    expect(res.body.error).toBeDefined();
    expect(res.body.error.statusCode).toBeDefined();
    expect(res.body.error.message).toBeDefined();
  });

  it('includes X-Request-Id header on all responses', async () => {
    const pool = createMockPool();
    const app = buildTestApp(pool);
    const res = await request(app).get('/api/v2/nonexistent');
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});
