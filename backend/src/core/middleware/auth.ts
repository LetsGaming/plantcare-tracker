/**
 * src/core/middleware/auth.ts
 *
 * JWT authentication middleware, token helpers, and the in-memory
 * session / one-time-ticket stores.
 *
 * Every login creates a session id (`sid`) that is embedded in both the
 * access and the refresh token. A token is only honored while its session
 * is registered, so logging out ends exactly that session's tokens and
 * two logins can never share a token.
 */

import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { UnauthorizedError, ForbiddenError } from '../errors';
import { AUTH } from '../config';

// ── JWT config ───────────────────────────────────────────────────────────────
//
// Validated eagerly at module-load time so the process fails immediately
// at startup with a clear message if required env vars are absent, rather
// than crashing on the first auth request with a confusing stack trace.

interface JwtConfig {
  JWT_SECRET: Secret;
  JWT_REFRESH_SECRET: Secret;
  JWT_EXPIRATION: string;
  JWT_REFRESH_EXPIRATION: string;
}

function loadJwtConfig(): JwtConfig {
  const missing = ['JWT_SECRET', 'JWT_REFRESH_SECRET'].filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'The server cannot start without them.',
    );
  }
  return {
    JWT_SECRET: process.env.JWT_SECRET as Secret,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as Secret,
    JWT_EXPIRATION: process.env.JWT_EXPIRATION ?? '15m',
    JWT_REFRESH_EXPIRATION: process.env.JWT_REFRESH_EXPIRATION ?? '7d',
  };
}

export const jwtConfig: JwtConfig = loadJwtConfig();

const JWT_ALGORITHMS: jwt.Algorithm[] = ['HS256'];

// ── Session store (in-memory) ─────────────────────────────────────────────────

interface Session {
  sid: string;
  expiresAt: number;
}

export interface SessionPolicy {
  /** Oldest sessions beyond this count are ended. */
  maxSessions: number;
  ttlMs: number;
}

export const USER_SESSION_POLICY: SessionPolicy = {
  maxSessions: AUTH.MAX_SESSIONS_PER_USER,
  ttlMs: AUTH.REFRESH_COOKIE_MAX_AGE_MS,
};

/** The guest account is shared, so many visitors hold sessions on one user id. */
export const GUEST_SESSION_POLICY: SessionPolicy = {
  maxSessions: AUTH.MAX_GUEST_SESSIONS,
  ttlMs: AUTH.GUEST_REFRESH_COOKIE_MAX_AGE_MS,
};

const activeSessions = new Map<number, Session[]>();

const liveSessions = (userId: number): Session[] => {
  const now = Date.now();
  const live = (activeSessions.get(userId) ?? []).filter((s) => s.expiresAt > now);
  if (live.length) activeSessions.set(userId, live);
  else activeSessions.delete(userId);
  return live;
};

export const sessionStore = {
  /** Registers a new session and returns its id. */
  create(userId: number, policy: SessionPolicy = USER_SESSION_POLICY): string {
    const sessions = liveSessions(userId);
    while (sessions.length >= policy.maxSessions) sessions.shift();
    const sid = crypto.randomUUID();
    sessions.push({ sid, expiresAt: Date.now() + policy.ttlMs });
    activeSessions.set(userId, sessions);
    return sid;
  },
  has(userId: number, sid: string): boolean {
    return liveSessions(userId).some((s) => s.sid === sid);
  },
  count(userId: number): number {
    return liveSessions(userId).length;
  },
  end(userId: number, sid: string): void {
    const remaining = liveSessions(userId).filter((s) => s.sid !== sid);
    if (remaining.length) activeSessions.set(userId, remaining);
    else activeSessions.delete(userId);
  },
  deleteAll(userId: number): void {
    activeSessions.delete(userId);
  },
};

// ── One-time ticket store ─────────────────────────────────────────────────────

const tickets = new Map<string, { userId: number; expires: number }>();

export const ticketStore = {
  create(userId: number): string {
    const ticket = crypto.randomBytes(32).toString('hex');
    tickets.set(ticket, { userId, expires: Date.now() + AUTH.SSE_TICKET_TTL_MS });
    return ticket;
  },
  /** Returns the ticket's user id and burns the ticket, or null when unknown or expired. */
  validateAndBurn(ticket: string): number | null {
    const data = tickets.get(ticket);
    if (!data) return null;
    tickets.delete(ticket);
    if (Date.now() > data.expires) return null;
    return data.userId;
  },
};

// ── Token helpers ─────────────────────────────────────────────────────────────

export interface TokenIdentity {
  id: number;
  username: string;
  role: string;
}

/** Claims carried by both token types. */
export interface JwtPayload extends TokenIdentity {
  sid: string;
}

/** The authenticated principal on a request; SSE tickets carry no session. */
export interface AuthUser extends TokenIdentity {
  sid?: string;
}

const isGuestRole = (role: string | undefined): boolean => role?.toLowerCase() === 'guest';

const claimsOf = (user: TokenIdentity, sid: string): JwtPayload => ({
  id: user.id,
  username: user.username,
  role: user.role,
  sid,
});

export const signAccessToken = (user: TokenIdentity, sid: string): string => {
  const options: SignOptions = {
    expiresIn: jwtConfig.JWT_EXPIRATION as SignOptions['expiresIn'],
  };
  return jwt.sign(claimsOf(user, sid), jwtConfig.JWT_SECRET, options);
};

export const generateTokens = (user: TokenIdentity, sid: string) => {
  const refreshOptions: SignOptions = {
    expiresIn: jwtConfig.JWT_REFRESH_EXPIRATION as SignOptions['expiresIn'],
  };
  return {
    accessToken: signAccessToken(user, sid),
    refreshToken: jwt.sign(claimsOf(user, sid), jwtConfig.JWT_REFRESH_SECRET, refreshOptions),
  };
};

/** Starts a session for the user and returns the matching token pair. */
export const issueSession = (user: TokenIdentity) => {
  const policy = isGuestRole(user.role) ? GUEST_SESSION_POLICY : USER_SESSION_POLICY;
  return generateTokens(user, sessionStore.create(user.id, policy));
};

const hasSessionClaims = (decoded: unknown): decoded is JwtPayload => {
  const d = decoded as Partial<JwtPayload> | null;
  return (
    typeof d === 'object' &&
    d !== null &&
    typeof d.id === 'number' &&
    typeof d.sid === 'string' &&
    typeof d.role === 'string'
  );
};

/**
 * Verifies a refresh token's signature and claims. The session itself is
 * not checked here; callers decide (logout ignores expiry and missing sessions).
 */
export const verifyRefreshToken = (
  token: string,
  options: { ignoreExpiration?: boolean } = {},
): JwtPayload | null => {
  try {
    const decoded = jwt.verify(token, jwtConfig.JWT_REFRESH_SECRET, {
      algorithms: JWT_ALGORITHMS,
      ignoreExpiration: options.ignoreExpiration ?? false,
    });
    return hasSessionClaims(decoded) ? decoded : null;
  } catch {
    return null;
  }
};

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

/** Decodes an access token and checks that its session is still registered. */
const readSession = (token: string): JwtPayload | null => {
  try {
    const decoded = jwt.verify(token, jwtConfig.JWT_SECRET, { algorithms: JWT_ALGORITHMS });
    if (!hasSessionClaims(decoded)) return null;
    return sessionStore.has(decoded.id, decoded.sid) ? decoded : null;
  } catch {
    return null;
  }
};

export const authenticateToken = (req: Request, _res: Response, next: NextFunction): void => {
  const token = bearerToken(req);
  if (!token) return next(new UnauthorizedError('Missing authentication token'));

  try {
    jwt.verify(token, jwtConfig.JWT_SECRET, { algorithms: JWT_ALGORITHMS });
  } catch {
    return next(new UnauthorizedError('Invalid or expired token'));
  }

  const session = readSession(token);
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
      const { query } = await import('../database/db');
      const rows = query<{ id: number; username: string; role: string }>(
        `SELECT users.id, username, roles.name AS role
         FROM users LEFT JOIN roles ON users.role_id = roles.id
         WHERE users.id = ?`,
        [userId],
      );

      const user = rows[0];
      if (!user) return next(new UnauthorizedError('User not found'));

      req.user = { id: user.id, username: user.username, role: user.role };
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
  const session = token ? readSession(token) : null;
  if (session && isGuestRole(session.role)) {
    return next(new ForbiddenError('Guests are not allowed to perform this action'));
  }
  next();
};
