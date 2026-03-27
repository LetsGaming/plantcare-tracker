/**
 * tests/helpers/mockFactory.ts
 *
 * SQLite edition: mysql2 types removed.  Integration tests mock the
 * `src/core/database/db` module so better-sqlite3 is never loaded.
 */

import { vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { JwtPayload } from '../../src/core/middleware/auth';

// ── SQLite db-module mock factory ─────────────────────────────────────────────
export const createDbMock = () => {
  const mockQuery    = vi.fn().mockReturnValue([]);
  const mockExecute  = vi.fn().mockReturnValue({ affectedRows: 1, insertId: 1 });
  const mockTx       = vi.fn().mockImplementation((fn: Function) =>
    fn({ query: mockQuery, execute: mockExecute }),
  );
  const mockGetDb   = vi.fn().mockReturnValue({ prepare: vi.fn().mockReturnValue({ get: vi.fn(), run: vi.fn() }) });
  const mockCloseDb = vi.fn();

  return { mockQuery, mockExecute, mockTx, query: mockQuery, execute: mockExecute, transaction: mockTx, getDb: mockGetDb, closeDb: mockCloseDb };
};

// ── Express mocks ─────────────────────────────────────────────────────────────
export const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
  body: {}, params: {}, query: {}, headers: {}, cookies: {},
  method: 'GET', path: '/', user: undefined, secure: false, protocol: 'http',
  get: vi.fn((h: string) => (h === 'host' ? 'localhost:5000' : undefined)),
  on: vi.fn(),
  ...overrides,
} as unknown as Request);

export const createMockResponse = (): Response & { _status: number; _json: unknown; _cookies: Record<string, unknown> } => {
  const res: any = {
    _status: 200, _json: null, _cookies: {},
    status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(), clearCookie: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(), writeHead: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(), writableEnded: false,
    once: vi.fn(), flush: vi.fn(), headersSent: false, setHeader: vi.fn(),
  };
  res.status.mockImplementation((code: number) => { res._status = code; return res; });
  res.json.mockImplementation((data: unknown) => { res._json = data; return res; });
  return res;
};

export const createMockNext = (): NextFunction => vi.fn() as unknown as NextFunction;

// ── Auth fixtures ─────────────────────────────────────────────────────────────
export const adminUser:   JwtPayload = { id: 1, username: 'admin',    role: 'admin' };
export const regularUser: JwtPayload = { id: 2, username: 'testuser', role: 'user'  };
export const guestUser:   JwtPayload = { id: 3, username: 'guest',    role: 'guest' };

// ── Row fixtures (plain objects) ──────────────────────────────────────────────
export const makePlantRow = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  plant_id: 1, plant_user_id: 2, plant_name: 'Monstera deliciosa',
  plant_species: 'Monstera deliciosa', is_public: 1,
  plant_created_at: '2024-01-01T00:00:00.000Z', substrate_id: 1,
  substrate_name: 'Aroid Mix', image_id: null, image_url: null, upload_date: null, ...o,
});

export const makeSubstrateRow = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  substrate_id: 1, substrate_user_id: 2, substrate_name: 'Aroid Mix', is_public: 1,
  substrate_created_at: '2024-01-01T00:00:00.000Z',
  component_id: null, component_name: null, component_fineness_name: null, component_parts: null,
  image_id: null, image_url: null, upload_date: null, ...o,
});

export const makeWateringRow = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  record_id: 1, watering_date: '2024-06-01 10:00:00', used_fertilizer: 0,
  fertilizer_type_id: null, fertilizer_type: null,
  plant_id: 1, plant_name: 'Monstera deliciosa', owner_id: 2, ...o,
});

export const makeUserRow = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 2, username: 'testuser', password: '$2a$10$somehashedpassword', role: 'user', ...o,
});

// Legacy — routers now ignore the pool, but app.test.ts still imports this
export const createMockPool = (_o: Record<string, unknown> = {}): unknown => ({});
