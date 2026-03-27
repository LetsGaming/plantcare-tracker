/**
 * src/core/middleware/auth.ts
 *
 * JWT authentication middleware — ported from V1's authMiddleware.js.
 * Now uses typed Request extensions instead of casting.
 */

import jwt, { Secret, SignOptions } from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError, ForbiddenError } from "../errors";
import crypto from "crypto";

// ── ENV HELPERS ───────────────────────────────────────────────────────────────

// ── JWT config ───────────────────────────────────────────────────────────────
//
// Validated eagerly at module-load time so the process fails immediately
// at startup with a clear message if required env vars are absent, rather
// than crashing on the first auth request with a confusing stack trace.
//
// The Proxy is kept so that tests can override process.env before importing
// this module — values are still read lazily per-access, but the required
// keys are checked on first import so a missing var surfaces in the startup
// log rather than mid-request.

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

const MAX_SESSIONS = 3;
const activeSessions = new Map<number, string[]>();

export const sessionStore = {
  save(userId: number, refreshToken: string): void {
    const sessions = activeSessions.get(userId) ?? [];
    if (sessions.length >= MAX_SESSIONS) sessions.shift();
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
    tickets.set(ticket, { userId, expires: Date.now() + 60_000 });
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

  if (!token && (req as any).cookies?.accessToken) {
    token = (req as any).cookies.accessToken;
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

// ── SSE ticket auth (DB-backed, SQLite) ──────────────────────────────────────

export const makeAuthenticateSSE =
  // The `pool` parameter is kept for API compatibility with callers that pass
  // a pool object, but is ignored — the SQLite helper reads from the singleton db.
  (_pool?: unknown) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const { ticket } = req.query as { ticket?: string };

    if (!ticket)
      return next(new UnauthorizedError("No authentication ticket provided"));

    const userId = ticketStore.validateAndBurn(ticket);
    if (!userId) return next(new ForbiddenError("Invalid or expired ticket"));

    try {
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

// ── SSE ticket auth (no DB) ───────────────────────────────────────────────────

export const authenticateSSE = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const { ticket } = req.query as { ticket?: string };

  if (!ticket)
    return next(new UnauthorizedError("No authentication ticket provided"));

  const userId = ticketStore.validateAndBurn(ticket);
  if (!userId) return next(new ForbiddenError("Invalid or expired ticket"));

  req.user = { id: userId, username: "", role: "user" };
  next();
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
