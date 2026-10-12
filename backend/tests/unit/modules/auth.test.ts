/**
 * tests/unit/modules/auth.test.ts
 *
 * Tests for all Auth use cases.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';

vi.hoisted(() => {
  process.env.DB_PATH = ':memory:';
});
import type { UserRepository } from '../../../src/modules/auth/domain/User';
import type { RemovedImageFile } from '../../../src/modules/auth/domain/User';
import { SQLiteUserRepository } from '../../../src/modules/auth/infrastructure/SQLiteUserRepository';
import {
  RegisterUseCase,
  LoginUseCase,
  GuestLoginUseCase,
  LogoutUseCase,
  UpdateProfileUseCase,
  DeleteProfileUseCase,
  RequestTicketUseCase,
} from '../../../src/modules/auth/application/AuthUseCases';
import {
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
} from '../../../src/core/errors';
import {
  hashPassword,
  issueSession,
  sessionStore,
  verifyPassword,
  verifyRefreshToken,
} from '../../../src/core/auth';
import { closeDb, getSqlite, initDatabase } from '../../../src/core/database/db';
import { makeUserRow } from '../../helpers/mockFactory';

const makeMockRepo = (): UserRepository => ({
  findByUsername: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue({ id: 1, username: 'newuser' }),
  update: vi.fn().mockResolvedValue(true),
  updatePasswordHash: vi.fn().mockResolvedValue(true),
  delete: vi.fn().mockResolvedValue(true),
});

/** Sessions reference users, so every user id a test signs in must exist. */
const SESSION_USER_IDS = [1, 3, 5, 50, 77, 78, 99];

beforeAll(async () => {
  await initDatabase();
  const insert = getSqlite().prepare(
    'INSERT INTO users (id, username, password, role_id) VALUES (?, ?, ?, 2)',
  );
  for (const id of SESSION_USER_IDS) insert.run(id, `session-user-${id}`, 'x');
});

afterAll(async () => {
  await closeDb();
});

// ── RegisterUseCase ───────────────────────────────────────────────────────────

describe('RegisterUseCase', () => {
  it('registers a new user and returns id + username', async () => {
    const repo = makeMockRepo();
    const result = await new RegisterUseCase(repo).execute({
      username: 'alice',
      password: 'pass1234',
    });
    expect(result.username).toBe('newuser');
    expect(result.id).toBe(1);
  });

  it('throws ConflictError when username already exists', async () => {
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ username: 'alice' }),
    );
    await expect(
      new RegisterUseCase(repo).execute({ username: 'alice', password: 'password1' }),
    ).rejects.toThrow(ConflictError);
  });

  it('throws ValidationError for empty username', async () => {
    const repo = makeMockRepo();
    await expect(
      new RegisterUseCase(repo).execute({ username: '', password: 'pass' }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for empty password', async () => {
    const repo = makeMockRepo();
    await expect(
      new RegisterUseCase(repo).execute({ username: 'alice', password: '' }),
    ).rejects.toThrow(ValidationError);
  });

  it('hashes the password before storing', async () => {
    const repo = makeMockRepo();
    await new RegisterUseCase(repo).execute({ username: 'alice', password: 'plaintext' });
    const storedPassword = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(storedPassword).not.toBe('plaintext');
    expect(storedPassword).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword('plaintext', storedPassword)).toEqual({
      ok: true,
      needsRehash: false,
    });
  });
});

// ── LoginUseCase ──────────────────────────────────────────────────────────────

describe('LoginUseCase', () => {
  it('returns tokens on valid credentials', async () => {
    const hash = await hashPassword('correctpass');
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ id: 5, username: 'alice', password: hash, role: 'user' }),
    );

    const { accessToken, refreshToken } = await new LoginUseCase(repo).execute({
      username: 'alice',
      password: 'correctpass',
    });
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
  });

  it('throws UnauthorizedError for wrong password', async () => {
    const hash = await hashPassword('correct');
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ password: hash }),
    );
    await expect(
      new LoginUseCase(repo).execute({ username: 'alice', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError when user does not exist', async () => {
    const repo = makeMockRepo();
    await expect(
      new LoginUseCase(repo).execute({ username: 'ghost', password: 'x' }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('starts a session for the refresh token', async () => {
    const hash = await hashPassword('pass');
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ id: 99, password: hash }),
    );
    const { refreshToken } = await new LoginUseCase(repo).execute({
      username: 'alice',
      password: 'pass',
    });
    expect(sessionStore.has(99, verifyRefreshToken(refreshToken)!.sid)).toBe(true);
    sessionStore.deleteAll(99);
  });

  it('upgrades a legacy bcrypt hash to scrypt after a successful login', async () => {
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ id: 5, password: await bcrypt.hash('legacypass', 4) }),
    );
    const legacy = (await repo.findByUsername('alice'))!.password;
    await new LoginUseCase(repo).execute({ username: 'alice', password: 'legacypass' });
    const [userId, oldHash, hash] = (repo.updatePasswordHash as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(userId).toBe(5);
    expect(oldHash).toBe(legacy);
    expect(hash).toMatch(/^scrypt\$/);
    expect(await verifyPassword('legacypass', hash)).toEqual({ ok: true, needsRehash: false });
  });

  it('rehashes a legacy login of exactly 72 bytes', async () => {
    const password = 'a'.repeat(72);
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ id: 5, password: await bcrypt.hash(password, 4) }),
    );
    await new LoginUseCase(repo).execute({ username: 'alice', password });
    expect(repo.updatePasswordHash).toHaveBeenCalledTimes(1);
  });

  it('logs in with a 73 byte input matching a legacy 72 byte prefix but never rehashes it', async () => {
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ id: 5, password: await bcrypt.hash('a'.repeat(72), 4) }),
    );
    const { accessToken } = await new LoginUseCase(repo).execute({
      username: 'alice',
      password: 'a'.repeat(73),
    });
    expect(accessToken).toBeTruthy();
    expect(repo.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('counts bytes, not characters, for the rehash limit', async () => {
    const password = 'ä'.repeat(37);
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ id: 5, password: await bcrypt.hash(password, 4) }),
    );
    await new LoginUseCase(repo).execute({ username: 'alice', password });
    expect(repo.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('gives a 401 for a malformed legacy hash', async () => {
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ id: 5, password: '$2b$10$broken' }),
    );
    await expect(
      new LoginUseCase(repo).execute({ username: 'alice', password: 'whatever1' }),
    ).rejects.toThrow(UnauthorizedError);
    expect(repo.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('still logs in when the compare and swap finds a changed password', async () => {
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ id: 5, password: await bcrypt.hash('legacypass', 4) }),
    );
    (repo.updatePasswordHash as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { accessToken } = await new LoginUseCase(repo).execute({
      username: 'alice',
      password: 'legacypass',
    });
    expect(accessToken).toBeTruthy();
  });

  it('does not overwrite a password that changed between verify and update', async () => {
    const repo = new SQLiteUserRepository();
    const row = getSqlite().prepare('SELECT password FROM users WHERE id = 50').get() as {
      password: string;
    };
    const stale = row.password;
    getSqlite().prepare('UPDATE users SET password = ? WHERE id = 50').run('changed-by-user');

    expect(await repo.updatePasswordHash(50, stale, 'scrypt$stale-rehash')).toBe(false);
    expect((await repo.findByUsername('session-user-50'))!.password).toBe('changed-by-user');

    expect(await repo.updatePasswordHash(50, 'changed-by-user', 'scrypt$fresh')).toBe(true);
    expect((await repo.findByUsername('session-user-50'))!.password).toBe('scrypt$fresh');
  });

  it('keeps a current scrypt hash and never rehashes on a failed login', async () => {
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ id: 5, password: await hashPassword('currentpass') }),
    );
    await new LoginUseCase(repo).execute({ username: 'alice', password: 'currentpass' });
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ id: 5, password: await bcrypt.hash('legacypass', 4) }),
    );
    await expect(
      new LoginUseCase(repo).execute({ username: 'alice', password: 'wrongpass' }),
    ).rejects.toThrow(UnauthorizedError);
    expect(repo.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('still logs in when the hash upgrade fails', async () => {
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ id: 5, password: await bcrypt.hash('legacypass', 4) }),
    );
    (repo.updatePasswordHash as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('locked'));
    const { accessToken } = await new LoginUseCase(repo).execute({
      username: 'alice',
      password: 'legacypass',
    });
    expect(accessToken).toBeTruthy();
  });
});

// ── GuestLoginUseCase ─────────────────────────────────────────────────────────

describe('GuestLoginUseCase', () => {
  it('returns tokens for guest user', async () => {
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ id: 3, username: 'guest', role: 'guest' }),
    );
    const { accessToken } = await new GuestLoginUseCase(repo).execute();
    expect(accessToken).toBeTruthy();
    sessionStore.deleteAll(3);
  });

  it('throws NotFoundError when guest user is missing', async () => {
    const repo = makeMockRepo();
    await expect(new GuestLoginUseCase(repo).execute()).rejects.toThrow(NotFoundError);
  });
});

// ── LogoutUseCase ─────────────────────────────────────────────────────────────

describe('LogoutUseCase', () => {
  it('ends the session of the refresh token', () => {
    const { refreshToken } = issueSession({ id: 50, username: 'u', role: 'user' });
    const { sid } = verifyRefreshToken(refreshToken)!;
    new LogoutUseCase().execute(refreshToken);
    expect(sessionStore.has(50, sid)).toBe(false);
  });

  it('ignores a token that is not a refresh token', () => {
    expect(() => new LogoutUseCase().execute('not-a-token')).not.toThrow();
  });

  it('does nothing when no token provided', () => {
    expect(() => new LogoutUseCase().execute(undefined)).not.toThrow();
  });
});

// ── RequestTicketUseCase ──────────────────────────────────────────────────────

describe('RequestTicketUseCase', () => {
  it('returns a ticket string', () => {
    const ticket = new RequestTicketUseCase().execute(1);
    expect(typeof ticket).toBe('string');
    expect(ticket.length).toBeGreaterThan(10);
  });
});

// ── UpdateProfileUseCase ──────────────────────────────────────────────────────

describe('UpdateProfileUseCase', () => {
  it('throws ValidationError when no fields provided', async () => {
    const repo = makeMockRepo();
    await expect(new UpdateProfileUseCase(repo).execute(1, {})).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when password confirmation missing', async () => {
    const repo = makeMockRepo();
    await expect(new UpdateProfileUseCase(repo).execute(1, { password: 'new' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('throws ValidationError when passwords do not match', async () => {
    const repo = makeMockRepo();
    await expect(
      new UpdateProfileUseCase(repo).execute(1, {
        password: 'new',
        passwordConfirmation: 'different',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('hashes password before update', async () => {
    const repo = makeMockRepo();
    await new UpdateProfileUseCase(repo).execute(1, {
      password: 'newpassword',
      passwordConfirmation: 'newpassword',
    });
    const passArg = (repo.update as ReturnType<typeof vi.fn>).mock.calls[0][1].password;
    expect(await verifyPassword('newpassword', passArg)).toEqual({ ok: true, needsRehash: false });
  });

  it('throws NotFoundError when update returns false', async () => {
    const repo = makeMockRepo();
    (repo.update as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(new UpdateProfileUseCase(repo).execute(1, { username: 'xyz' })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('invalidates all sessions after update', async () => {
    sessionStore.create(1);
    const repo = makeMockRepo();
    await new UpdateProfileUseCase(repo).execute(1, { username: 'newname' });
    expect(sessionStore.count(1)).toBe(0);
  });
});

// ── DeleteProfileUseCase ──────────────────────────────────────────────────────

describe('DeleteProfileUseCase', () => {
  const makeDeleter = (result: RemovedImageFile[] | null) => ({
    deleteAccount: vi.fn().mockResolvedValue(result),
  });
  const makeRemover = () => ({ removeFiles: vi.fn().mockResolvedValue(undefined) });

  it('deletes the account and clears sessions', async () => {
    sessionStore.create(77);
    const repo = makeDeleter([]);
    await new DeleteProfileUseCase(repo, makeRemover()).execute(77);
    expect(repo.deleteAccount).toHaveBeenCalledWith(77);
    expect(sessionStore.count(77)).toBe(0);
  });

  it('throws NotFoundError when the account does not exist', async () => {
    const repo = makeDeleter(null);
    const files = makeRemover();
    await expect(new DeleteProfileUseCase(repo, files).execute(999)).rejects.toThrow(NotFoundError);
    expect(files.removeFiles).not.toHaveBeenCalled();
  });

  it('passes the removed image files to the cleanup service', async () => {
    const images: RemovedImageFile[] = [
      { entityType: 'plant', url: '/uploads/plants/a.webp' },
      { entityType: 'substrate', url: '/uploads/substrates/b.webp' },
    ];
    const files = makeRemover();
    await new DeleteProfileUseCase(makeDeleter(images), files).execute(78);
    expect(files.removeFiles).toHaveBeenCalledWith(images);
  });
});
