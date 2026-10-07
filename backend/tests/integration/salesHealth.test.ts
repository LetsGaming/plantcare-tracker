/**
 * tests/integration/salesHealth.test.ts
 *
 * Admin-only scrape health endpoints. The db and the network layer are
 * mocked, so this verifies routing, authorization and wiring only.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Application } from 'express';

const mockQuery = vi.fn().mockReturnValue([]);
const mockExecute = vi.fn().mockReturnValue({ affectedRows: 1, insertId: 1 });

vi.mock('../../src/core/database/db', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
  transaction: vi.fn(),
  getDb: vi.fn(),
  closeDb: vi.fn(),
}));

vi.mock('../../src/modules/sales/infrastructure/HttpFetcher', () => ({
  fetchDocument: vi.fn().mockResolvedValue(null),
  fetchJson: vi.fn().mockResolvedValue(null),
  fetchHtml: vi.fn().mockResolvedValue(null),
  closeBrowser: vi.fn(),
}));

import {
  requestIdMiddleware,
  globalErrorHandler,
  notFoundHandler,
} from '../../src/core/middleware';
import { issueSession } from '../../src/core/middleware/auth';
import { createSalesRouter } from '../../src/modules/sales/presentation/salesRoutes';

const buildApp = (): Application => {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use('/api/v2/sales', createSalesRouter());
  app.use(notFoundHandler);
  app.use(globalErrorHandler);
  return app;
};

const authHeader = (role: string, id: number) => {
  const { accessToken } = issueSession({ id, username: `${role}-user`, role });
  return `Bearer ${accessToken}`;
};

const failingRow = {
  source_key: 'jungleLeaves',
  kind: 'sales',
  seller: 'Jungle Leaves',
  status: 'failing',
  active_strategy: null,
  last_item_count: 0,
  consecutive_failures: 1,
  last_success_at: null,
  last_failure_at: '2026-10-06T10:00:00.000Z',
  last_error: 'selector: No HTML returned',
  updated_at: '2026-10-06T10:00:00.000Z',
};

beforeEach(() => {
  mockQuery.mockReset().mockReturnValue([]);
  mockExecute.mockReset().mockReturnValue({ affectedRows: 1, insertId: 1 });
});

describe('GET /api/v2/sales/health', () => {
  it('requires authentication', async () => {
    const res = await request(buildApp()).get('/api/v2/sales/health');
    expect(res.status).toBe(401);
  });

  it('is forbidden for non-admin users', async () => {
    const res = await request(buildApp())
      .get('/api/v2/sales/health')
      .set('Authorization', authHeader('user', 20));
    expect(res.status).toBe(403);
  });

  it('lists every registered source as unknown before the first scrape', async () => {
    const res = await request(buildApp())
      .get('/api/v2/sales/health')
      .set('Authorization', authHeader('admin', 1));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(9);
    expect(res.body.data.every((r: { status: string }) => r.status === 'unknown')).toBe(true);
    expect(res.body.data.map((r: { source_key: string }) => r.source_key)).toContain(
      'jungleLeaves',
    );
  });

  it('returns stored health rows', async () => {
    mockQuery.mockReturnValue([failingRow]);

    const res = await request(buildApp())
      .get('/api/v2/sales/health')
      .set('Authorization', authHeader('admin', 1));

    expect(
      res.body.data.find((r: { source_key: string }) => r.source_key === 'jungleLeaves'),
    ).toMatchObject({ status: 'failing', last_error: 'selector: No HTML returned' });
  });
});

describe('POST /api/v2/sales/health/:key/check', () => {
  it('is forbidden for non-admin users', async () => {
    const res = await request(buildApp())
      .post('/api/v2/sales/health/jungleLeaves/check')
      .set('Authorization', authHeader('user', 20));
    expect(res.status).toBe(403);
  });

  it('answers 404 for an unknown source', async () => {
    const res = await request(buildApp())
      .post('/api/v2/sales/health/nope/check')
      .set('Authorization', authHeader('admin', 1));
    expect(res.status).toBe(404);
  });

  it('re-scrapes page 1, persists the outcome and returns the stored row', async () => {
    mockQuery.mockReturnValue([failingRow]);

    const res = await request(buildApp())
      .post('/api/v2/sales/health/jungleLeaves/check')
      .set('Authorization', authHeader('admin', 1));

    expect(res.status).toBe(200);
    expect(res.body.data.source_key).toBe('jungleLeaves');

    const upsert = mockExecute.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO scrape_source_health'),
    );
    expect(upsert).toBeDefined();
    expect(upsert![1]).toEqual(expect.arrayContaining(['jungleLeaves', 'sales', 'failing']));
  });
});
