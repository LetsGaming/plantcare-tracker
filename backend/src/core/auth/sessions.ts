/**
 * core/auth/sessions.ts
 *
 * Session store backed by the sessions table, and the in-memory one-time
 * SSE ticket store. A session is identified by a random `sid` embedded in
 * both tokens of a login, so ending a session ends exactly that login's
 * tokens. The store is synchronous: it runs prepared better-sqlite3
 * statements on the shared connection. Times are epoch milliseconds.
 */

import crypto from 'crypto';
import type { Database as SqliteDatabase, Statement } from 'better-sqlite3';
import { AUTH } from '../config';
import { getSqlite } from '../database/db';

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

/** Upper bound of expired rows removed by one `create`; the sweep removes the rest. */
const PRUNE_BATCH = 200;

interface SessionStatements {
  insert: Statement<[string, number, number, number]>;
  pruneExpired: Statement<[number, number]>;
  evictOldest: Statement<[number, number]>;
  has: Statement<[string, number, number]>;
  count: Statement<[number, number], number>;
  end: Statement<[string, number]>;
  deleteAll: Statement<[number]>;
  sweep: Statement<[number]>;
}

const prepare = (db: SqliteDatabase): SessionStatements => ({
  insert: db.prepare<[string, number, number, number]>(
    'INSERT INTO sessions (sid, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ),
  pruneExpired: db.prepare<[number, number]>(
    `DELETE FROM sessions WHERE rowid IN (
       SELECT rowid FROM sessions WHERE expires_at <= ? LIMIT ?
     )`,
  ),
  // Reads only the (user_id, created_at) index. Rows that expired but were not
  // pruned yet still count toward the cap; they are the oldest, so they go first.
  evictOldest: db.prepare<[number, number]>(
    `DELETE FROM sessions WHERE rowid IN (
       SELECT rowid FROM sessions WHERE user_id = ?
       ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET ?
     )`,
  ),
  has: db.prepare<[string, number, number]>(
    'SELECT 1 FROM sessions WHERE sid = ? AND user_id = ? AND expires_at > ?',
  ),
  count: db
    .prepare<[number, number], number>(
      'SELECT COUNT(*) FROM sessions WHERE user_id = ? AND expires_at > ?',
    )
    .pluck(),
  end: db.prepare<[string, number]>('DELETE FROM sessions WHERE sid = ? AND user_id = ?'),
  deleteAll: db.prepare<[number]>('DELETE FROM sessions WHERE user_id = ?'),
  sweep: db.prepare<[number]>('DELETE FROM sessions WHERE expires_at <= ?'),
});

const statementCache = new WeakMap<SqliteDatabase, SessionStatements>();

const statements = (): SessionStatements => {
  const db = getSqlite();
  let cached = statementCache.get(db);
  if (!cached) {
    cached = prepare(db);
    statementCache.set(db, cached);
  }
  return cached;
};

export const sessionStore = {
  /** Registers a new session and returns its id. */
  create(userId: number, policy: SessionPolicy = USER_SESSION_POLICY): string {
    const s = statements();
    const now = Date.now();
    s.pruneExpired.run(now, PRUNE_BATCH);
    s.evictOldest.run(userId, Math.max(policy.maxSessions - 1, 0));
    const sid = crypto.randomUUID();
    s.insert.run(sid, userId, now + policy.ttlMs, now);
    return sid;
  },
  has(userId: number, sid: string): boolean {
    return statements().has.get(sid, userId, Date.now()) !== undefined;
  },
  count(userId: number): number {
    return statements().count.get(userId, Date.now()) ?? 0;
  },
  end(userId: number, sid: string): void {
    statements().end.run(sid, userId);
  },
  deleteAll(userId: number): void {
    statements().deleteAll.run(userId);
  },
};

/** Removes every expired session and returns how many were removed. */
export const sweepSessions = (): number => statements().sweep.run(Date.now()).changes;

const tickets = new Map<string, { userId: number; expires: number }>();

/**
 * Every ticket lives for the same TTL, so the map's insertion order is also
 * its expiry order and pruning can stop at the first live ticket.
 */
const pruneExpiredTickets = (now: number): number => {
  let removed = 0;
  for (const [ticket, data] of tickets) {
    if (data.expires >= now) break;
    tickets.delete(ticket);
    removed++;
  }
  return removed;
};

export const ticketStore = {
  create(userId: number): string {
    const now = Date.now();
    pruneExpiredTickets(now);
    const ticket = crypto.randomBytes(32).toString('hex');
    tickets.set(ticket, { userId, expires: now + AUTH.SSE_TICKET_TTL_MS });
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

/** Removes every expired ticket and returns how many were removed. */
export const sweepTickets = (): number => {
  const now = Date.now();
  let removed = 0;
  for (const [ticket, data] of tickets) {
    if (data.expires < now) {
      tickets.delete(ticket);
      removed++;
    }
  }
  return removed;
};
