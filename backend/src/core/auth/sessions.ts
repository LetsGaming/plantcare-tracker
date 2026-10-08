/**
 * core/auth/sessions.ts
 *
 * In-memory session store and one-time SSE ticket store. A session is
 * identified by a random `sid` embedded in both tokens of a login, so
 * ending a session ends exactly that login's tokens.
 */

import crypto from 'crypto';
import { AUTH } from '../config';

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
