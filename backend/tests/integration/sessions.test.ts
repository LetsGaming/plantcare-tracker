import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

type DbModule = typeof import('../../src/core/database/db');
type SessionsModule = typeof import('../../src/core/auth/sessions');
type AuthUseCasesModule = typeof import('../../src/modules/auth/application/AuthUseCases');
type UserRepositoryModule =
  typeof import('../../src/modules/auth/infrastructure/SQLiteUserRepository');

let workDir: string;
let db: DbModule;
let sessions: SessionsModule;
let useCases: AuthUseCasesModule;
let users: UserRepositoryModule;

/** Loads fresh module instances, which open a new connection to the same database file. */
const load = async (): Promise<void> => {
  (await import('../../src/core/logging')).logger.silent = true;
  db = await import('../../src/core/database/db');
  sessions = await import('../../src/core/auth/sessions');
  useCases = await import('../../src/modules/auth/application/AuthUseCases');
  users = await import('../../src/modules/auth/infrastructure/SQLiteUserRepository');
  await db.initDatabase();
};

let userSeq = 0;
const createUser = (password = 'x'): { id: number; username: string } => {
  const username = `session-user-${++userSeq}`;
  const result = db
    .getSqlite()
    .prepare('INSERT INTO users (username, password, role_id) VALUES (?, ?, 2)')
    .run(username, password);
  return { id: Number(result.lastInsertRowid), username };
};

const storedRows = (userId: number): number =>
  db
    .getSqlite()
    .prepare('SELECT COUNT(*) FROM sessions WHERE user_id = ?')
    .pluck()
    .get(userId) as number;

const storedPassword = (userId: number): string =>
  db.getSqlite().prepare('SELECT password FROM users WHERE id = ?').pluck().get(userId) as string;

beforeAll(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plantcare-sessions-'));
  process.env.DB_PATH = path.join(workDir, 'sessions.db');
  await load();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await db?.closeDb();
  try {
    fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* best-effort cleanup */
  }
});

describe('persistent session store', () => {
  it('keeps a session across a restart on the same database file', async () => {
    const { id } = createUser();
    const sid = sessions.sessionStore.create(id);
    const firstConnection = db.getSqlite();

    await db.closeDb();
    vi.resetModules();
    await load();

    expect(db.getSqlite()).not.toBe(firstConnection);
    expect(sessions.sessionStore.has(id, sid)).toBe(true);
    expect(sessions.sessionStore.count(id)).toBe(1);
  });

  it('evicts the oldest session once the cap is reached', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = Date.now();
    const { id } = createUser();
    const sids = [0, 1, 2, 3].map((i) => {
      vi.setSystemTime(start + i * 1000);
      return sessions.sessionStore.create(id);
    });
    expect(sessions.sessionStore.has(id, sids[0])).toBe(false);
    expect(sids.slice(1).every((sid) => sessions.sessionStore.has(id, sid))).toBe(true);
    expect(storedRows(id)).toBe(sessions.USER_SESSION_POLICY.maxSessions);
  });

  it('breaks equal creation times by insertion order', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { id } = createUser();
    const policy = { maxSessions: 2, ttlMs: 60_000 };
    const sids = [0, 1, 2].map(() => sessions.sessionStore.create(id, policy));
    expect(sessions.sessionStore.has(id, sids[0])).toBe(false);
    expect(sessions.sessionStore.has(id, sids[1])).toBe(true);
    expect(sessions.sessionStore.has(id, sids[2])).toBe(true);
  });

  it('lets many guests share one account', () => {
    const { id } = createUser();
    const sids = Array.from({ length: 50 }, () =>
      sessions.sessionStore.create(id, sessions.GUEST_SESSION_POLICY),
    );
    expect(sessions.sessionStore.count(id)).toBe(50);
    expect(sids.every((sid) => sessions.sessionStore.has(id, sid))).toBe(true);
  });

  it('treats expired sessions as dead and prunes them on the next create', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { id } = createUser();
    const other = createUser();
    const sid = sessions.sessionStore.create(id, { maxSessions: 3, ttlMs: 1000 });
    vi.setSystemTime(Date.now() + 1001);
    expect(sessions.sessionStore.has(id, sid)).toBe(false);
    expect(sessions.sessionStore.count(id)).toBe(0);
    expect(storedRows(id)).toBe(1);

    sessions.sessionStore.create(other.id);
    expect(storedRows(id)).toBe(0);
  });

  it('sweeps every expired session', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    sessions.sweepSessions();
    const { id } = createUser();
    sessions.sessionStore.create(id, { maxSessions: 3, ttlMs: 1000 });
    sessions.sessionStore.create(id, { maxSessions: 3, ttlMs: 1000 });
    const live = sessions.sessionStore.create(id);
    vi.setSystemTime(Date.now() + 1001);
    expect(sessions.sweepSessions()).toBe(2);
    expect(storedRows(id)).toBe(1);
    expect(sessions.sessionStore.has(id, live)).toBe(true);
  });

  it('requires the matching user id to read or end a session', () => {
    const owner = createUser();
    const stranger = createUser();
    const sid = sessions.sessionStore.create(owner.id);
    expect(sessions.sessionStore.has(stranger.id, sid)).toBe(false);
    sessions.sessionStore.end(stranger.id, sid);
    expect(sessions.sessionStore.has(owner.id, sid)).toBe(true);
    sessions.sessionStore.end(owner.id, sid);
    expect(storedRows(owner.id)).toBe(0);
  });

  it('removes the sessions of a deleted account', async () => {
    const { id } = createUser();
    sessions.sessionStore.create(id);
    sessions.sessionStore.create(id);
    const remover = { removeFiles: vi.fn().mockResolvedValue(undefined) };
    await new useCases.DeleteProfileUseCase(new users.SQLiteUserRepository(), remover).execute(id);
    expect(storedRows(id)).toBe(0);
  });

  it('cascades a raw user delete to the sessions table', () => {
    const { id } = createUser();
    sessions.sessionStore.create(id);
    db.getSqlite().prepare('DELETE FROM users WHERE id = ?').run(id);
    expect(storedRows(id)).toBe(0);
  });
});

describe('password upgrade on login', () => {
  it('replaces a legacy bcrypt hash with scrypt and keeps the login working', async () => {
    const { id, username } = createUser(await bcrypt.hash('legacy-password', 4));
    const login = new useCases.LoginUseCase(new users.SQLiteUserRepository());

    await login.execute({ username, password: 'legacy-password' });
    const upgraded = storedPassword(id);
    expect(upgraded).toMatch(/^scrypt\$16384\$8\$1\$/);

    await login.execute({ username, password: 'legacy-password' });
    expect(storedPassword(id)).toBe(upgraded);
    await expect(login.execute({ username, password: 'wrong-password' })).rejects.toThrow(
      'Invalid credentials',
    );
  });
});
