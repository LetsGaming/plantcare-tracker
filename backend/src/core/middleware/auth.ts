/**
 * src/core/middleware/auth.ts
 *
 * Authentication hooks: bearer-token and ticket authentication, role
 * guards and the guest read-only rule. Tokens and sessions live in
 * core/auth. Hooks throw AppErrors, which the central error handler turns
 * into the standard error envelope.
 */

import type { FastifyRequest } from 'fastify';
import { UnauthorizedError, ForbiddenError } from '../errors';
import { ticketStore, isGuestRole, isValidAccessToken, readAccessSession } from '../auth';
import type { Hook } from './types';

const bearerToken = (request: FastifyRequest): string | null => {
  const header = request.headers['authorization'];
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
};

export const authenticateToken: Hook = async (request) => {
  const token = bearerToken(request);
  if (!token) throw new UnauthorizedError('Missing authentication token');
  if (!isValidAccessToken(token)) throw new UnauthorizedError('Invalid or expired token');

  const session = readAccessSession(token);
  if (!session) throw new UnauthorizedError('Invalid session. Please log in again.');

  request.user = session;
};

/**
 * Optional variant of authenticateToken: attaches request.user when a valid
 * token is present but never blocks the request. Used for endpoints
 * where public data must be visible unauthenticated while private data
 * is included for logged-in users (GET /plants, GET /plants/:id).
 */
export const optionalAuthenticateToken: Hook = async (request) => {
  try {
    await authenticateToken(request);
  } catch {
    request.user = undefined;
  }
};

// ── SSE ticket auth ───────────────────────────────────────────────────────────
//
// EventSource cannot send an Authorization header, so SSE endpoints
// authenticate via a one-time ticket (POST /auth/ticket → ?ticket=…).

export interface SseAuthOptions {
  /**
   * When true, re-loads username and role from the users table after
   * validating the ticket. When false, request.user carries only the id
   * (username empty, role "user"), which is sufficient for endpoints
   * that only need to know the request is authenticated.
   */
  loadUserFromDb?: boolean;
}

export const makeAuthenticateSSE =
  ({ loadUserFromDb = false }: SseAuthOptions = {}): Hook =>
  async (request) => {
    const { ticket } = request.query as { ticket?: string };

    if (!ticket) throw new UnauthorizedError('No authentication ticket provided');

    const userId = ticketStore.validateAndBurn(ticket);
    if (userId === null) throw new UnauthorizedError('Invalid or expired ticket');

    if (!loadUserFromDb) {
      request.user = { id: userId, username: '', role: 'user' };
      return;
    }

    // Imported lazily so unit tests can exercise the no-DB path
    // without the db module (and its native binding) ever loading.
    const { getKysely } = await import('../database/db');
    const user = await getKysely()
      .selectFrom('users')
      .leftJoin('roles', 'users.role_id', 'roles.id')
      .select(['users.id', 'users.username', 'roles.name as role'])
      .where('users.id', '=', userId)
      .executeTakeFirst();
    if (!user) throw new UnauthorizedError('User not found');

    request.user = { id: user.id, username: user.username, role: user.role ?? '' };
  };

// ── Role guards ───────────────────────────────────────────────────────────────

export const isAdmin: Hook = async (request) => {
  if (request.user?.role?.toLowerCase() !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Endpoints a guest session may call with an unsafe method. */
const GUEST_WRITE_ALLOWLIST = new Set([
  '/auth/register',
  '/auth/login',
  '/auth/login/guest',
  '/auth/refresh-token',
  '/auth/logout',
  '/auth/ticket',
]);

/**
 * Default-deny read-only rule for guests. Registered once for the whole API
 * prefix, it refuses every unsafe request that carries a live guest session,
 * so a route added later cannot forget the check.
 */
export const makeGuestReadOnly =
  (basePath: string): Hook =>
  async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    const pathname = request.url.split('?')[0];
    const relative = pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname;
    if (GUEST_WRITE_ALLOWLIST.has(relative.replace(/\/+$/, ''))) return;
    const token = bearerToken(request);
    const session = token ? readAccessSession(token) : null;
    if (session && isGuestRole(session.role)) {
      throw new ForbiddenError('Guests are not allowed to perform this action');
    }
  };
