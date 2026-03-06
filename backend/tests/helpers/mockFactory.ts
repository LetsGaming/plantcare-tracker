/**
 * tests/helpers/mockFactory.ts
 *
 * Centralized factory for mock objects used across all tests.
 * Using vitest's `vi.fn()` for type-safe, resettable mocks.
 */

import { vi } from 'vitest';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Request, Response, NextFunction } from 'express';
import type { JwtPayload } from '../../src/core/middleware/auth';

// ── MySQL Pool Mock ───────────────────────────────────────────────────────────

export const createMockPool = (overrides: Record<string, unknown> = {}): Pool => ({
  query: vi.fn().mockResolvedValue([[], []]),
  execute: vi.fn().mockResolvedValue([{ insertId: 1, affectedRows: 1 } as ResultSetHeader, []]),
  getConnection: vi.fn().mockResolvedValue({
    release: vi.fn(),
    query: vi.fn().mockResolvedValue([[], []]),
    execute: vi.fn().mockResolvedValue([{ insertId: 1, affectedRows: 1 }, []]),
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
  } as unknown as PoolConnection),
  end: vi.fn().mockResolvedValue(undefined),
  ...overrides,
} as unknown as Pool);

// ── Express Mock ──────────────────────────────────────────────────────────────

export const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  cookies: {},
  method: 'GET',
  path: '/',
  user: undefined,
  secure: false,
  protocol: 'http',
  get: vi.fn((header: string) => header === 'host' ? 'localhost:5000' : undefined),
  on: vi.fn(),
  ...overrides,
} as unknown as Request);

export const createMockResponse = (): Response & {
  _status: number;
  _json: unknown;
  _cookies: Record<string, unknown>;
} => {
  const res = {
    _status: 200,
    _json: null,
    _cookies: {} as Record<string, unknown>,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    writeHead: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    writableEnded: false,
    once: vi.fn(),
    flush: vi.fn(),
    headersSent: false,
    setHeader: vi.fn(),
  };
  // Capture values
  (res.status as ReturnType<typeof vi.fn>).mockImplementation((code: number) => {
    res._status = code;
    return res;
  });
  (res.json as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
    res._json = data;
    return res;
  });
  return res as unknown as Response & { _status: number; _json: unknown; _cookies: Record<string, unknown> };
};

export const createMockNext = (): NextFunction => vi.fn() as unknown as NextFunction;

// ── Auth User Fixtures ────────────────────────────────────────────────────────

export const adminUser: JwtPayload = { id: 1, username: 'admin', role: 'admin' };
export const regularUser: JwtPayload = { id: 2, username: 'testuser', role: 'user' };
export const guestUser: JwtPayload = { id: 3, username: 'guest', role: 'guest' };

// ── DB Row Fixtures ───────────────────────────────────────────────────────────

export const makePlantRow = (overrides: Partial<RowDataPacket> = {}): RowDataPacket => ({
  plant_id: 1,
  plant_user_id: 2,
  plant_name: 'Monstera deliciosa',
  plant_species: 'Monstera deliciosa',
  is_public: 1,
  plant_created_at: '2024-01-01T00:00:00.000Z',
  substrate_id: 1,
  substrate_name: 'Aroid Mix',
  image_id: null,
  image_url: null,
  upload_date: null,
  ...overrides,
} as RowDataPacket);

export const makeSubstrateRow = (overrides: Partial<RowDataPacket> = {}): RowDataPacket => ({
  substrate_id: 1,
  substrate_user_id: 2,
  substrate_name: 'Aroid Mix',
  is_public: 1,
  substrate_created_at: '2024-01-01T00:00:00.000Z',
  component_id: null,
  component_name: null,
  component_fineness_name: null,
  component_parts: null,
  image_id: null,
  image_url: null,
  upload_date: null,
  ...overrides,
} as RowDataPacket);

export const makeWateringRow = (overrides: Partial<RowDataPacket> = {}): RowDataPacket => ({
  record_id: 1,
  watering_date: '2024-06-01 10:00:00',
  used_fertilizer: 0,
  fertilizer_type_id: null,
  fertilizer_type: null,
  plant_id: 1,
  plant_name: 'Monstera deliciosa',
  owner_id: 2,
  ...overrides,
} as RowDataPacket);

export const makeUserRow = (overrides: Partial<RowDataPacket> = {}): RowDataPacket => ({
  id: 2,
  username: 'testuser',
  password: '$2a$10$somehashedpassword',
  role: 'user',
  ...overrides,
} as RowDataPacket);
