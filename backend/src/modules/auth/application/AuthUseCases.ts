/**
 * modules/auth/application/AuthUseCases.ts
 *
 * Use cases for registration, login (user + guest), token refresh,
 * logout, SSE tickets, and profile management. Validation goes through
 * the shared parseOrThrow helper; magic numbers (bcrypt cost, session
 * limits) come from core/config.
 */

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { UserRepository } from '../domain/User';
import {
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
} from '../../../core/errors';
import { parseOrThrow } from '../../../core/validation';
import { AUTH } from '../../../core/config';
import {
  issueSession,
  signAccessToken,
  sessionStore,
  ticketStore,
  verifyRefreshToken,
} from '../../../core/middleware/auth';

// ── Schemas ───────────────────────────────────────────────────────────────────

const USERNAME_MIN = 3;
const USERNAME_MAX = 64;
const PASSWORD_MIN = 8;
/** bcrypt ignores everything past 72 bytes, so longer passwords are rejected instead of truncated. */
const PASSWORD_MAX_BYTES = 72;
const LOGIN_PASSWORD_MAX = 1024;

const usernameRule = z
  .string()
  .min(USERNAME_MIN, `Username must be at least ${USERNAME_MIN} characters`)
  .max(USERNAME_MAX, `Username must be at most ${USERNAME_MAX} characters`);

const passwordRule = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .refine((p) => Buffer.byteLength(p, 'utf8') <= PASSWORD_MAX_BYTES, {
    message: `Password must be at most ${PASSWORD_MAX_BYTES} bytes`,
  });

const RegisterSchema = z.object({ username: usernameRule, password: passwordRule });

/** Login stays lenient so accounts created under older rules keep working. */
const LoginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(USERNAME_MAX),
  password: z.string().min(1, 'Password is required').max(LOGIN_PASSWORD_MAX),
});

export const UpdateProfileSchema = z
  .object({
    username: usernameRule.optional(),
    password: passwordRule.optional(),
    passwordConfirmation: z.string().optional(),
  })
  .refine((d) => d.username !== undefined || d.password !== undefined, {
    message: 'No fields provided',
  });

// ── Use Cases ─────────────────────────────────────────────────────────────────

export class RegisterUseCase {
  constructor(private readonly repo: UserRepository) {}

  async execute(input: unknown): Promise<{ id: number; username: string }> {
    const { username, password } = parseOrThrow(
      RegisterSchema,
      input,
      'Username and password are required',
    );

    const existing = await this.repo.findByUsername(username);
    if (existing) throw new ConflictError('Username already exists');

    const hashedPassword = await bcrypt.hash(password, AUTH.BCRYPT_SALT_ROUNDS);
    return this.repo.create(username, hashedPassword);
  }
}

export class LoginUseCase {
  constructor(private readonly repo: UserRepository) {}

  async execute(input: unknown): Promise<{ accessToken: string; refreshToken: string }> {
    const { username, password } = parseOrThrow(
      LoginSchema,
      input,
      'Username and password are required',
    );

    const user = await this.repo.findByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedError('Invalid credentials');
    }

    return issueSession({ id: user.id, username: user.username, role: user.role });
  }
}

export class GuestLoginUseCase {
  constructor(private readonly repo: UserRepository) {}

  async execute(): Promise<{ accessToken: string; refreshToken: string }> {
    const guest = await this.repo.findByUsername('guest');
    if (!guest) throw new NotFoundError('Guest user');

    return issueSession({ id: guest.id, username: guest.username, role: guest.role });
  }
}

export class RefreshTokenUseCase {
  execute(refreshToken: string | undefined): string {
    if (!refreshToken) throw new UnauthorizedError('Refresh token required');

    const claims = verifyRefreshToken(refreshToken);
    if (!claims || !sessionStore.has(claims.id, claims.sid)) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    return signAccessToken(
      { id: claims.id, username: claims.username, role: claims.role },
      claims.sid,
    );
  }
}

export class LogoutUseCase {
  execute(refreshToken: string | undefined): void {
    if (!refreshToken) return;
    const claims = verifyRefreshToken(refreshToken, { ignoreExpiration: true });
    if (claims) sessionStore.end(claims.id, claims.sid);
  }
}

export class RequestTicketUseCase {
  execute(userId: number): string {
    return ticketStore.create(userId);
  }
}

export class UpdateProfileUseCase {
  constructor(private readonly repo: UserRepository) {}

  async execute(userId: number, input: unknown): Promise<void> {
    const fields = parseOrThrow(UpdateProfileSchema, input, 'No fields provided');

    const updateFields: Record<string, unknown> = { ...fields };

    if (fields.password) {
      if (!fields.passwordConfirmation) {
        throw new ValidationError('Password confirmation is required');
      }
      if (fields.password !== fields.passwordConfirmation) {
        throw new ValidationError('Passwords do not match');
      }
      updateFields['password'] = await bcrypt.hash(fields.password, AUTH.BCRYPT_SALT_ROUNDS);
      delete updateFields['passwordConfirmation'];
    }

    if (fields.username !== undefined) {
      const taken = await this.repo.findByUsername(fields.username);
      if (taken && taken.id !== userId) throw new ConflictError('Username already exists');
    }

    const updated = await this.repo.update(userId, updateFields);
    if (!updated) throw new NotFoundError('User');

    // Credentials changed — every existing session must re-authenticate.
    sessionStore.deleteAll(userId);
  }
}

export class DeleteProfileUseCase {
  constructor(private readonly repo: UserRepository) {}

  async execute(userId: number): Promise<void> {
    const deleted = await this.repo.delete(userId);
    if (!deleted) throw new NotFoundError('User');
    sessionStore.deleteAll(userId);
  }
}
