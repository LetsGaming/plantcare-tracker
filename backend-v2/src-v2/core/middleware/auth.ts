/**
 * src-v2/core/middleware/auth.ts
 *
 * JWT authentication middleware — ported from V1's authMiddleware.js.
 * Now uses typed Request extensions instead of casting.
 */

import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../errors';
// ── JWT config ────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET ?? 'changeme';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'changeme_refresh';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION ?? '15m';
const JWT_REFRESH_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION ?? '7d';

export const jwtConfig = { JWT_SECRET, JWT_REFRESH_SECRET, JWT_EXPIRATION, JWT_REFRESH_EXPIRATION };

// ── Session store (in-memory, same as V1 authStore.js) ───────────────────────

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
    const sessions = (activeSessions.get(userId) ?? []).filter((t) => t !== refreshToken);
    activeSessions.set(userId, sessions);
  },
  deleteAll(userId: number): void {
    activeSessions.delete(userId);
  },
};

// ── One-time ticket store (V1 ticketStore.js) ─────────────────────────────────

import crypto from 'crypto';
const tickets = new Map<string, { userId: number; expires: number }>();

export const ticketStore = {
  create(userId: number): string {
    const ticket = crypto.randomBytes(32).toString('hex');
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
  const payload = { id: user.id, username: user.username, role: user.role };
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRATION });
  return { accessToken, refreshToken };
};

// ── Augment Express Request ───────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

export const authenticateToken = (req: Request, _res: Response, next: NextFunction): void => {
  let token: string | null = null;

  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) token = authHeader.split(' ')[1];
  if (!token && req.cookies?.accessToken) token = req.cookies.accessToken;

  if (!token) return next(new UnauthorizedError('Missing authentication token'));

  jwt.verify(token, JWT_SECRET, (err: Error | null, decoded: unknown) => {
    if (err) return next(new ForbiddenError('Invalid or expired token'));

    const user = decoded as JwtPayload;
    const sessions = sessionStore.get(user.id);
    if (!sessions.length) return next(new ForbiddenError('Invalid session. Please log in again.'));

    req.user = user;
    next();
  });
};

export const authenticateSSE = (req: Request, _res: Response, next: NextFunction): void => {
  const { ticket } = req.query as { ticket?: string };
  if (!ticket) return next(new UnauthorizedError('No authentication ticket provided'));

  const userId = ticketStore.validateAndBurn(ticket);
  if (!userId) return next(new ForbiddenError('Invalid or expired ticket'));

  req.user = { id: userId, username: '', role: 'user' };
  next();
};

export const isAdmin = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.user?.role?.toLowerCase() !== 'admin') return next(new ForbiddenError('Admin access required'));
  next();
};

export const checkGuestPermission = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.user?.role?.toLowerCase() === 'guest' && req.method !== 'GET') {
    return next(new ForbiddenError('Guests are not allowed to perform this action'));
  }
  next();
};
