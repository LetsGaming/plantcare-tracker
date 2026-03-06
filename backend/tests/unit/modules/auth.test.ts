/**
 * tests/unit/modules/auth.test.ts
 *
 * Tests for all Auth use cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import type { UserRepository } from '../../../src/modules/auth/domain/User';
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
import { sessionStore } from '../../../src/core/middleware/auth';
import { makeUserRow } from '../../helpers/mockFactory';

const makeMockRepo = (): UserRepository => ({
  findByUsername: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue({ id: 1, username: 'newuser' }),
  update: vi.fn().mockResolvedValue(true),
  delete: vi.fn().mockResolvedValue(true),
});

// ── RegisterUseCase ───────────────────────────────────────────────────────────

describe('RegisterUseCase', () => {
  it('registers a new user and returns id + username', async () => {
    const repo = makeMockRepo();
    const result = await new RegisterUseCase(repo).execute({ username: 'alice', password: 'pass123' });
    expect(result.username).toBe('newuser');
    expect(result.id).toBe(1);
  });

  it('throws ConflictError when username already exists', async () => {
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(makeUserRow({ username: 'alice' }));
    await expect(new RegisterUseCase(repo).execute({ username: 'alice', password: 'pass' })).rejects.toThrow(ConflictError);
  });

  it('throws ValidationError for empty username', async () => {
    const repo = makeMockRepo();
    await expect(new RegisterUseCase(repo).execute({ username: '', password: 'pass' })).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for empty password', async () => {
    const repo = makeMockRepo();
    await expect(new RegisterUseCase(repo).execute({ username: 'alice', password: '' })).rejects.toThrow(ValidationError);
  });

  it('hashes the password before storing', async () => {
    const repo = makeMockRepo();
    await new RegisterUseCase(repo).execute({ username: 'alice', password: 'plaintext' });
    const storedPassword = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(storedPassword).not.toBe('plaintext');
    expect(await bcrypt.compare('plaintext', storedPassword)).toBe(true);
  });
});

// ── LoginUseCase ──────────────────────────────────────────────────────────────

describe('LoginUseCase', () => {
  it('returns tokens on valid credentials', async () => {
    const hash = await bcrypt.hash('correctpass', 10);
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ id: 5, username: 'alice', password: hash, role: 'user' }),
    );

    const { accessToken, refreshToken } = await new LoginUseCase(repo).execute({ username: 'alice', password: 'correctpass' });
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
  });

  it('throws UnauthorizedError for wrong password', async () => {
    const hash = await bcrypt.hash('correct', 10);
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ password: hash }),
    );
    await expect(new LoginUseCase(repo).execute({ username: 'alice', password: 'wrong' })).rejects.toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError when user does not exist', async () => {
    const repo = makeMockRepo();
    await expect(new LoginUseCase(repo).execute({ username: 'ghost', password: 'x' })).rejects.toThrow(UnauthorizedError);
  });

  it('saves refresh token to session store', async () => {
    const hash = await bcrypt.hash('pass', 10);
    const repo = makeMockRepo();
    (repo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUserRow({ id: 99, password: hash }),
    );
    const { refreshToken } = await new LoginUseCase(repo).execute({ username: 'alice', password: 'pass' });
    expect(sessionStore.findUser(refreshToken)).toBe(99);
    sessionStore.deleteAll(99);
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
  it('removes refresh token from session store', () => {
    sessionStore.save(50, 'logout-token');
    new LogoutUseCase().execute('logout-token');
    expect(sessionStore.findUser('logout-token')).toBeNull();
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
    await expect(
      new UpdateProfileUseCase(repo).execute(1, { password: 'new' }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when passwords do not match', async () => {
    const repo = makeMockRepo();
    await expect(
      new UpdateProfileUseCase(repo).execute(1, { password: 'new', passwordConfirmation: 'different' }),
    ).rejects.toThrow(ValidationError);
  });

  it('hashes password before update', async () => {
    const repo = makeMockRepo();
    await new UpdateProfileUseCase(repo).execute(1, {
      password: 'newpass',
      passwordConfirmation: 'newpass',
    });
    const passArg = (repo.update as ReturnType<typeof vi.fn>).mock.calls[0][1].password;
    expect(await bcrypt.compare('newpass', passArg)).toBe(true);
  });

  it('throws NotFoundError when update returns false', async () => {
    const repo = makeMockRepo();
    (repo.update as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(new UpdateProfileUseCase(repo).execute(1, { username: 'x' })).rejects.toThrow(NotFoundError);
  });

  it('invalidates all sessions after update', async () => {
    sessionStore.save(1, 'old-token');
    const repo = makeMockRepo();
    await new UpdateProfileUseCase(repo).execute(1, { username: 'newname' });
    expect(sessionStore.get(1)).toHaveLength(0);
  });
});

// ── DeleteProfileUseCase ──────────────────────────────────────────────────────

describe('DeleteProfileUseCase', () => {
  it('deletes user and clears sessions', async () => {
    sessionStore.save(77, 'a-token');
    const repo = makeMockRepo();
    await new DeleteProfileUseCase(repo).execute(77);
    expect(repo.delete).toHaveBeenCalledWith(77);
    expect(sessionStore.get(77)).toHaveLength(0);
  });

  it('throws NotFoundError when delete returns false', async () => {
    const repo = makeMockRepo();
    (repo.delete as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(new DeleteProfileUseCase(repo).execute(999)).rejects.toThrow(NotFoundError);
  });
});
