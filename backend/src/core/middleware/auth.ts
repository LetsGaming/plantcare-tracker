/**
 * src/core/middleware/auth.ts
 *
 * Express adapters for authentication: bearer-token and ticket
 * authentication, role guards and the guest read-only rule. Tokens and
 * sessions live in core/auth.
 */

import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../errors';
import {
  ticketStore,
  isGuestRole,
  isValidAccessToken,
  readAccessSession,
  type AuthUser,
} from '../auth';

// ── Augment Express Request ───────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

const bearerToken = (req: Request): string | null => {
  const header = req.headers['authorization'];
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
};

export const authenticateToken = (req: Request, _res: Response, next: NextFunction): void => {
  const token = bearerToken(req);
  if (!token) return next(new UnauthorizedError('Missing authentication token'));

  if (!isValidAccessToken(token)) return next(new UnauthorizedError('Invalid or expired token'));

  const session = readAccessSession(token);
  if (!session) return next(new UnauthorizedError('Invalid session. Please log in again.'));

  req.user = session;
  next();
};

/**
 * Optional variant of authenticateToken: attaches req.user when a valid
 * token is present but never blocks the request. Used for endpoints
 * where public data must be visible unauthenticated while private data
 * is included for logged-in users (GET /plants, GET /plants/:id).
 */
export const optionalAuthenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  authenticateToken(req, res, (err) => {
    // Any auth failure is treated as "not logged in", not as an error.
    if (err) req.user = undefined;
    next();
  });
};

// ── SSE ticket auth ───────────────────────────────────────────────────────────
//
// EventSource cannot send an Authorization header, so SSE endpoints
// authenticate via a one-time ticket (POST /auth/ticket → ?ticket=…).

export interface SseAuthOptions {
  /**
   * When true, re-loads username and role from the users table after
   * validating the ticket. When false, req.user carries only the id
   * (username empty, role "user"), which is sufficient for endpoints
   * that only need to know the request is authenticated.
   */
  loadUserFromDb?: boolean;
}

export const makeAuthenticateSSE =
  ({ loadUserFromDb = false }: SseAuthOptions = {}) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const { ticket } = req.query as { ticket?: string };

    if (!ticket) return next(new UnauthorizedError('No authentication ticket provided'));

    const userId = ticketStore.validateAndBurn(ticket);
    if (userId === null) return next(new UnauthorizedError('Invalid or expired ticket'));

    if (!loadUserFromDb) {
      req.user = { id: userId, username: '', role: 'user' };
      return next();
    }

    try {
      // Imported lazily so unit tests can exercise the no-DB path
      // without the db module (and its native binding) ever loading.
      const { getKysely } = await import('../database/db');
      const user = await getKysely()
        .selectFrom('users')
        .leftJoin('roles', 'users.role_id', 'roles.id')
        .select(['users.id', 'users.username', 'roles.name as role'])
        .where('users.id', '=', userId)
        .executeTakeFirst();
      if (!user) return next(new UnauthorizedError('User not found'));

      req.user = { id: user.id, username: user.username, role: user.role ?? '' };
      next();
    } catch (err) {
      next(err);
    }
  };

// ── Role guards ───────────────────────────────────────────────────────────────

export const isAdmin = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.user?.role?.toLowerCase() !== 'admin') {
    return next(new ForbiddenError('Admin access required'));
  }
  next();
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
 * Default-deny read-only rule for guests. Mounted once on the API prefix,
 * it refuses every unsafe request that carries a live guest session, so a
 * route added later cannot forget the check.
 */
export const guestReadOnly = (req: Request, _res: Response, next: NextFunction): void => {
  if (SAFE_METHODS.has(req.method) || GUEST_WRITE_ALLOWLIST.has(req.path)) return next();
  const token = bearerToken(req);
  const session = token ? readAccessSession(token) : null;
  if (session && isGuestRole(session.role)) {
    return next(new ForbiddenError('Guests are not allowed to perform this action'));
  }
  next();
};
