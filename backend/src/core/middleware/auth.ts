/**
 * src/core/middleware/auth.ts
 *
 * JWT authentication middleware, token helpers, and the in-memory
 * session / one-time-ticket stores.
 *
 * Uses typed Request extensions instead of casting, and shared
 * constants from core/config instead of inline magic numbers.
 */

import jwt, { Secret, SignOptions } from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError, ForbiddenError } from "../errors";
import { AUTH } from "../config";
import crypto from "crypto";

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

// ── Session store (in-memory) ─────────────────────────────────────────────────

const activeSessions = new Map<number, string[]>();

export const sessionStore = {
  save(userId: number, refreshToken: string): void {
    const sessions = activeSessions.get(userId) ?? [];
    if (sessions.length >= AUTH.MAX_SESSIONS_PER_USER) sessions.shift();
    sessions.push(refreshToken);
    activeSessions.set(userId, sessions);
  },
  get(userId: number): string[] {
    return activeSessions.get(userId) ?? [];
  },
  findUser(refreshToken: string): number | null {
    for (const [userId, tokens] of activeSessions) {
      if (tokens.includes(refreshToken)) return userId;
    }
    return null;
  },
  invalidate(userId: number, refreshToken: string): void {
    const sessions = (activeSessions.get(userId) ?? []).filter(
      (t) => t !== refreshToken,
    );
    activeSessions.set(userId, sessions);
  },
  deleteAll(userId: number): void {
    activeSessions.delete(userId);
  },
};

// ── One-time ticket store ─────────────────────────────────────────────────────

const tickets = new Map<string, { userId: number; expires: number }>();

export const ticketStore = {
  create(userId: number): string {
    const ticket = crypto.randomBytes(32).toString("hex");
    tickets.set(ticket, { userId, expires: Date.now() + AUTH.SSE_TICKET_TTL_MS });
    return ticket;
  },
  validateAndBurn(ticket: string): number | null {
    const data = tickets.get(ticket);
    if (!data) return null;
    tickets.delete(ticket);
    if (Date.now() > data.expires) return null;
    return data.userId;
  },
};

// ── Token helpers ─────────────────────────────────────────────────────────────

export interface JwtPayload {
  id: number;
  username: string;
  role: string;
}

export const generateTokens = (user: JwtPayload) => {
  const {
    JWT_SECRET,
    JWT_REFRESH_SECRET,
    JWT_EXPIRATION,
    JWT_REFRESH_EXPIRATION,
  } = jwtConfig;

  const payload = { id: user.id, username: user.username, role: user.role };

  const accessOptions: SignOptions = { expiresIn: JWT_EXPIRATION as SignOptions['expiresIn'] };
  const refreshOptions: SignOptions = { expiresIn: JWT_REFRESH_EXPIRATION as SignOptions['expiresIn'] };

  const accessToken = jwt.sign(payload, JWT_SECRET, accessOptions);
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, refreshOptions);

  return { accessToken, refreshToken };
};

// ── Augment Express Request ───────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

export const authenticateToken = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  let token: string | null = null;

  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) token = authHeader.split(" ")[1];

  const cookies = req.cookies as Record<string, string> | undefined;
  if (!token && cookies?.[AUTH.ACCESS_TOKEN_COOKIE]) {
    token = cookies[AUTH.ACCESS_TOKEN_COOKIE];
  }

  if (!token)
    return next(new UnauthorizedError("Missing authentication token"));

  const { JWT_SECRET } = jwtConfig;

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new ForbiddenError("Invalid or expired token"));

    const user = decoded as JwtPayload;
    const sessions = sessionStore.get(user.id);

    if (!sessions.length) {
      return next(new ForbiddenError("Invalid session. Please log in again."));
    }

    req.user = user;
    next();
  });
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
//
// This helper replaces two near-identical implementations that used to
// coexist: a DB-backed `makeAuthenticateSSE(pool)` (the pool argument
// was ignored MySQL-era residue) and a no-DB `authenticateSSE`. The
// only real difference was whether the user record is re-loaded from
// the database after the ticket is burned, so that is now the single
// parameter.

export interface SseAuthOptions {
  /**
   * When true, re-loads username and role from the users table after
   * validating the ticket. When false, req.user carries only the id
   * (username empty, role "user") — sufficient for endpoints that only
   * need to know the request is authenticated.
   */
  loadUserFromDb?: boolean;
}

export const makeAuthenticateSSE = ({ loadUserFromDb = false }: SseAuthOptions = {}) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const { ticket } = req.query as { ticket?: string };

    if (!ticket)
      return next(new UnauthorizedError("No authentication ticket provided"));

    const userId = ticketStore.validateAndBurn(ticket);
    if (!userId) return next(new ForbiddenError("Invalid or expired ticket"));

    if (!loadUserFromDb) {
      req.user = { id: userId, username: "", role: "user" };
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
      if (!user) return next(new ForbiddenError("User not found"));

      req.user = { id: user.id, username: user.username, role: user.role };
      next();
    } catch (err) {
      next(err);
    }
  };

// ── Role guards ───────────────────────────────────────────────────────────────

export const isAdmin = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (req.user?.role?.toLowerCase() !== "admin") {
    return next(new ForbiddenError("Admin access required"));
  }
  next();
};

export const checkGuestPermission = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (req.user?.role?.toLowerCase() === "guest" && req.method !== "GET") {
    return next(
      new ForbiddenError("Guests are not allowed to perform this action"),
    );
  }
  next();
};
