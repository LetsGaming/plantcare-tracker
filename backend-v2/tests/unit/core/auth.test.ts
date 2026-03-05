/**
 * tests/unit/core/auth.test.ts
 *
 * Tests for JWT generation, session store, ticket store, and middleware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  generateTokens,
  sessionStore,
  ticketStore,
  authenticateToken,
  checkGuestPermission,
  isAdmin,
} from '../../../src-v2/core/middleware/auth';
import { createMockRequest, createMockResponse, createMockNext, adminUser, regularUser, guestUser } from '../../helpers/mockFactory';

// ── generateTokens ────────────────────────────────────────────────────────────

describe('generateTokens', () => {
  it('returns accessToken and refreshToken', () => {
    const { accessToken, refreshToken } = generateTokens(regularUser);
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
  });

  it('access token contains correct payload', () => {
    const { accessToken } = generateTokens(regularUser);
    const decoded = jwt.decode(accessToken) as Record<string, unknown>;
    expect(decoded['id']).toBe(regularUser.id);
    expect(decoded['username']).toBe(regularUser.username);
    expect(decoded['role']).toBe(regularUser.role);
  });

  it('refresh token has longer expiry than access token', () => {
    const { accessToken, refreshToken } = generateTokens(regularUser);
    const access = jwt.decode(accessToken) as { exp: number };
    const refresh = jwt.decode(refreshToken) as { exp: number };
    expect(refresh.exp).toBeGreaterThan(access.exp);
  });
});

// ── sessionStore ──────────────────────────────────────────────────────────────

describe('sessionStore', () => {
  beforeEach(() => {
    // Clear all sessions before each test
    sessionStore.deleteAll(regularUser.id);
    sessionStore.deleteAll(adminUser.id);
  });

  it('saves and retrieves tokens', () => {
    sessionStore.save(regularUser.id, 'token-abc');
    expect(sessionStore.get(regularUser.id)).toContain('token-abc');
  });

  it('finds user by refresh token', () => {
    sessionStore.save(regularUser.id, 'unique-token');
    expect(sessionStore.findUser('unique-token')).toBe(regularUser.id);
  });

  it('returns null for unknown token', () => {
    expect(sessionStore.findUser('nonexistent-token')).toBeNull();
  });

  it('invalidates a specific token', () => {
    sessionStore.save(regularUser.id, 'token-to-remove');
    sessionStore.save(regularUser.id, 'token-to-keep');
    sessionStore.invalidate(regularUser.id, 'token-to-remove');
    const tokens = sessionStore.get(regularUser.id);
    expect(tokens).not.toContain('token-to-remove');
    expect(tokens).toContain('token-to-keep');
  });

  it('deletes all sessions for a user', () => {
    sessionStore.save(regularUser.id, 'token-1');
    sessionStore.save(regularUser.id, 'token-2');
    sessionStore.deleteAll(regularUser.id);
    expect(sessionStore.get(regularUser.id)).toHaveLength(0);
  });

  it('evicts oldest session when MAX_SESSIONS (3) is exceeded', () => {
    sessionStore.save(regularUser.id, 'token-1');
    sessionStore.save(regularUser.id, 'token-2');
    sessionStore.save(regularUser.id, 'token-3');
    sessionStore.save(regularUser.id, 'token-4'); // should evict token-1
    const tokens = sessionStore.get(regularUser.id);
    expect(tokens).not.toContain('token-1');
    expect(tokens).toContain('token-4');
    expect(tokens).toHaveLength(3);
  });
});

// ── ticketStore ───────────────────────────────────────────────────────────────

describe('ticketStore', () => {
  it('creates a ticket and validates it once', () => {
    const ticket = ticketStore.create(regularUser.id);
    expect(ticketStore.validateAndBurn(ticket)).toBe(regularUser.id);
  });

  it('burns the ticket after first use (single-use)', () => {
    const ticket = ticketStore.create(regularUser.id);
    ticketStore.validateAndBurn(ticket);
    expect(ticketStore.validateAndBurn(ticket)).toBeNull();
  });

  it('returns null for unknown ticket', () => {
    expect(ticketStore.validateAndBurn('fake-ticket-xyz')).toBeNull();
  });

  it('returns null for expired ticket', () => {
    vi.useFakeTimers();
    const ticket = ticketStore.create(regularUser.id);
    vi.advanceTimersByTime(61_000); // 61 seconds > 60s TTL
    expect(ticketStore.validateAndBurn(ticket)).toBeNull();
    vi.useRealTimers();
  });
});

// ── authenticateToken middleware ──────────────────────────────────────────────

describe('authenticateToken', () => {
  beforeEach(() => {
    sessionStore.deleteAll(regularUser.id);
  });

  it('passes valid token from Authorization header', () => {
    const { accessToken, refreshToken } = generateTokens(regularUser);
    sessionStore.save(regularUser.id, refreshToken);

    const req = createMockRequest({
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const res = createMockResponse();
    const next = createMockNext();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledWith(); // called with no error
    expect(req.user?.id).toBe(regularUser.id);
  });

  it('passes valid token from cookie', () => {
    const { accessToken, refreshToken } = generateTokens(regularUser);
    sessionStore.save(regularUser.id, refreshToken);

    const req = createMockRequest({ cookies: { accessToken } });
    const res = createMockResponse();
    const next = createMockNext();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user?.id).toBe(regularUser.id);
  });

  it('calls next with UnauthorizedError when no token', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    authenticateToken(req, res, next);

    const error = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(error?.statusCode).toBe(401);
  });

  it('calls next with ForbiddenError when session is missing', () => {
    const { accessToken } = generateTokens(regularUser);
    // No session saved → invalid

    const req = createMockRequest({
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const res = createMockResponse();
    const next = createMockNext();

    authenticateToken(req, res, next);

    // Wait for jwt.verify callback
    const error = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(error?.statusCode).toBe(403);
  });
});

// ── checkGuestPermission middleware ───────────────────────────────────────────

describe('checkGuestPermission', () => {
  it('allows GET requests from guests', () => {
    const req = createMockRequest({ method: 'GET', user: guestUser });
    const next = createMockNext();
    checkGuestPermission(req, createMockResponse(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('blocks POST from guests', () => {
    const req = createMockRequest({ method: 'POST', user: guestUser });
    const next = createMockNext();
    checkGuestPermission(req, createMockResponse(), next);
    const error = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(error?.statusCode).toBe(403);
  });

  it('allows POST from regular users', () => {
    const req = createMockRequest({ method: 'POST', user: regularUser });
    const next = createMockNext();
    checkGuestPermission(req, createMockResponse(), next);
    expect(next).toHaveBeenCalledWith();
  });
});

// ── isAdmin middleware ────────────────────────────────────────────────────────

describe('isAdmin', () => {
  it('passes for admin users', () => {
    const req = createMockRequest({ user: adminUser });
    const next = createMockNext();
    isAdmin(req, createMockResponse(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('blocks non-admin users with 403', () => {
    const req = createMockRequest({ user: regularUser });
    const next = createMockNext();
    isAdmin(req, createMockResponse(), next);
    const error = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(error?.statusCode).toBe(403);
  });

  it('blocks when no user is set', () => {
    const req = createMockRequest();
    const next = createMockNext();
    isAdmin(req, createMockResponse(), next);
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0]?.statusCode).toBe(403);
  });
});
