/**
 * modules/auth/application/AuthUseCases.ts
 */

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { UserRepository } from '../domain/User';
import { ValidationError, UnauthorizedError, NotFoundError, ConflictError, ForbiddenError } from '../../../core/errors';
import { generateTokens, sessionStore, ticketStore } from '../../../core/middleware/auth';

// ── Schemas ───────────────────────────────────────────────────────────────────

const CredentialsSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

// ── Use Cases ─────────────────────────────────────────────────────────────────

export class RegisterUseCase {
  constructor(private readonly repo: UserRepository) {}

  async execute(input: unknown): Promise<{ id: number; username: string }> {
    const result = CredentialsSchema.safeParse(input);
    if (!result.success) throw new ValidationError('Username and password are required');

    const { username, password } = result.data;
    const existing = await this.repo.findByUsername(username);
    if (existing) throw new ConflictError('Username already exists');

    const hashedPassword = await bcrypt.hash(password, 10);
    return this.repo.create(username, hashedPassword);
  }
}

export class LoginUseCase {
  constructor(private readonly repo: UserRepository) {}

  async execute(input: unknown): Promise<{ accessToken: string; refreshToken: string }> {
    const result = CredentialsSchema.safeParse(input);
    if (!result.success) throw new ValidationError('Username and password are required');

    const { username, password } = result.data;
    const user = await this.repo.findByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const tokens = generateTokens({ id: user.id, username: user.username, role: user.role });
    sessionStore.save(user.id, tokens.refreshToken);
    return tokens;
  }
}

export class GuestLoginUseCase {
  constructor(private readonly repo: UserRepository) {}

  async execute(): Promise<{ accessToken: string; refreshToken: string }> {
    const guest = await this.repo.findByUsername('guest');
    if (!guest) throw new NotFoundError('Guest user');

    const tokens = generateTokens({ id: guest.id, username: guest.username, role: guest.role });
    sessionStore.save(guest.id, tokens.refreshToken);
    return tokens;
  }
}

export class RefreshTokenUseCase {
  execute(refreshToken: string | undefined): string {
    if (!refreshToken) throw new UnauthorizedError('Refresh token required');

    const userId = sessionStore.findUser(refreshToken);
    if (!userId) throw new ForbiddenError('Invalid refresh token');

    // Re-use generateTokens with only access token needed
    const jwt = require('jsonwebtoken');
    const { jwtConfig } = require('../../../core/middleware/auth');

    try {
      const decoded = jwt.verify(refreshToken, jwtConfig.JWT_REFRESH_SECRET) as { id: number; username: string; role: string };
      if (decoded.id !== userId) throw new ForbiddenError('Invalid refresh token');
      return jwt.sign(
        { id: decoded.id, username: decoded.username, role: decoded.role },
        jwtConfig.JWT_SECRET,
        { expiresIn: jwtConfig.JWT_EXPIRATION },
      );
    } catch {
      throw new ForbiddenError('Invalid refresh token');
    }
  }
}

export class LogoutUseCase {
  execute(refreshToken: string | undefined): void {
    if (!refreshToken) return;
    const userId = sessionStore.findUser(refreshToken);
    if (userId) sessionStore.invalidate(userId, refreshToken);
  }
}

export class RequestTicketUseCase {
  execute(userId: number): string {
    return ticketStore.create(userId);
  }
}

export class UpdateProfileUseCase {
  constructor(private readonly repo: UserRepository) {}

  async execute(userId: number, fields: Record<string, unknown>): Promise<void> {
    if (Object.keys(fields).length === 0) throw new ValidationError('No fields provided');

    const updateFields = { ...fields };

    if (updateFields['password']) {
      if (!updateFields['passwordConfirmation']) {
        throw new ValidationError('Password confirmation is required');
      }
      if (updateFields['password'] !== updateFields['passwordConfirmation']) {
        throw new ValidationError('Passwords do not match');
      }
      updateFields['password'] = await bcrypt.hash(updateFields['password'] as string, 10);
      delete updateFields['passwordConfirmation'];
    }

    const updated = await this.repo.update(userId, updateFields);
    if (!updated) throw new NotFoundError('User');

    // Invalidate all sessions after profile change
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
