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

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const getJwtConfig = () => {
  return {
    JWT_SECRET: getRequiredEnv("JWT_SECRET") as Secret,
    JWT_REFRESH_SECRET: getRequiredEnv("JWT_REFRESH_SECRET") as Secret,
    JWT_EXPIRATION: process.env.JWT_EXPIRATION ?? "15m",
    JWT_REFRESH_EXPIRATION: process.env.JWT_REFRESH_EXPIRATION ?? "7d",
  };
};

/**
 * Lazily-evaluated JWT config. Exported for use in other modules (e.g. AuthUseCases).
 * Evaluated at call-time so tests can set env vars before invoking token operations.
 */
export const jwtConfig = new Proxy({} as ReturnType<typeof getJwtConfig>, {
  get(_target, prop: string) {
    return getJwtConfig()[prop as keyof ReturnType<typeof getJwtConfig>];
  },
});

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
  } = getJwtConfig();

  const payload = { id: user.id, username: user.username, role: user.role };

  const accessOptions: SignOptions = { expiresIn: JWT_EXPIRATION as any };
  const refreshOptions: SignOptions = {
    expiresIn: JWT_REFRESH_EXPIRATION as any,
  };

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

  const { JWT_SECRET } = getJwtConfig();

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
