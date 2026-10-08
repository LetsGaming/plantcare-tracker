import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

import {
  generateTokens,
  issueSession,
  verifyRefreshToken,
  sessionStore,
  ticketStore,
  GUEST_SESSION_POLICY,
  type JwtPayload,
  type TokenIdentity,
} from '../../../src/core/auth';
import {
  authenticateToken,
  optionalAuthenticateToken,
  makeGuestReadOnly,
} from '../../../src/core/middleware/auth';
import type { Hook } from '../../../src/core/middleware';
import { getConfig } from '../../../src/core/config';

const jwtConfig = {
  JWT_SECRET: getConfig().jwt.secret,
  JWT_REFRESH_SECRET: getConfig().jwt.refreshSecret,
};
import { UnauthorizedError, ForbiddenError } from '../../../src/core/errors';

const user: TokenIdentity = { id: 1, username: 'testuser', role: 'user' };
const guest: TokenIdentity = { id: 2, username: 'guest', role: 'guest' };

beforeEach(() => {
  sessionStore.deleteAll(user.id);
  sessionStore.deleteAll(guest.id);
});

afterEach(() => {
  vi.useRealTimers();
});

const mockReq = (overrides: Record<string, unknown> = {}): FastifyRequest =>
  ({ headers: {}, method: 'GET', url: '/plants', ...overrides }) as unknown as FastifyRequest;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const guestReadOnly = makeGuestReadOnly('');

/** Runs a hook and returns the error it threw, if any. */
const run = async (hook: Hook, req: FastifyRequest): Promise<unknown> => {
  try {
    await hook(req);
    return undefined;
  } catch (err) {
    return err;
  }
};

describe('tokens and sessions', () => {
  it('embeds the session id in both tokens', async () => {
    const { accessToken, refreshToken } = issueSession(user);
    const access = jwt.verify(accessToken, jwtConfig.JWT_SECRET) as JwtPayload;
    const refresh = jwt.verify(refreshToken, jwtConfig.JWT_REFRESH_SECRET) as JwtPayload;
    expect(access).toMatchObject({ id: user.id, username: 'testuser', role: 'user' });
    expect(access.sid).toBeTruthy();
    expect(refresh.sid).toBe(access.sid);
    expect(sessionStore.has(user.id, access.sid)).toBe(true);
  });

  it('gives two logins in the same second distinct tokens', async () => {
    const first = issueSession(user);
    const second = issueSession(user);
    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
  });

  it('keeps at most three sessions per user and ends the oldest first', async () => {
    const sids = [1, 2, 3, 4].map(() => sessionStore.create(user.id));
    expect(sessionStore.count(user.id)).toBe(3);
    expect(sessionStore.has(user.id, sids[0])).toBe(false);
    expect(sessionStore.has(user.id, sids[3])).toBe(true);
  });

  it('lets many guests share the guest account without evicting each other', async () => {
    const sids = Array.from({ length: 10 }, () =>
      sessionStore.create(guest.id, GUEST_SESSION_POLICY),
    );
    expect(sids.every((sid) => sessionStore.has(guest.id, sid))).toBe(true);
  });

  it('expires sessions after their ttl', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const sid = sessionStore.create(user.id, { maxSessions: 3, ttlMs: 1000 });
    vi.setSystemTime(Date.now() + 1500);
    expect(sessionStore.has(user.id, sid)).toBe(false);
  });

  it('ends only the named session', async () => {
    const a = sessionStore.create(user.id);
    const b = sessionStore.create(user.id);
    sessionStore.end(user.id, a);
    expect(sessionStore.has(user.id, a)).toBe(false);
    expect(sessionStore.has(user.id, b)).toBe(true);
  });

  it('verifies refresh tokens and rejects access tokens and garbage', async () => {
    const { accessToken, refreshToken } = issueSession(user);
    expect(verifyRefreshToken(refreshToken)).toMatchObject({ id: user.id });
    expect(verifyRefreshToken(accessToken)).toBeNull();
    expect(verifyRefreshToken('garbage')).toBeNull();
  });

  it('rejects tokens without a session id', async () => {
    const legacy = jwt.sign({ id: 1, username: 'x', role: 'user' }, jwtConfig.JWT_SECRET);
    expect(await run(authenticateToken, mockReq({ headers: bearer(legacy) }))).toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('only accepts HS256 tokens', async () => {
    const forged = jwt.sign({ ...user, sid: 'x' }, jwtConfig.JWT_SECRET, { algorithm: 'HS512' });
    expect(await run(authenticateToken, mockReq({ headers: bearer(forged) }))).toBeInstanceOf(
      UnauthorizedError,
    );
  });
});

describe('authenticateToken', () => {
  it('attaches the user for a token with a live session', async () => {
    const { accessToken } = issueSession(user);
    const req = mockReq({ headers: bearer(accessToken) });
    expect(await run(authenticateToken, req)).toBeUndefined();
    expect(req.user).toMatchObject({ id: user.id, role: 'user' });
  });

  it('answers 401 without a token', async () => {
    const error = (await run(authenticateToken, mockReq())) as UnauthorizedError;
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe('Missing authentication token');
  });

  it('answers 401 for an invalid token', async () => {
    const error = await run(authenticateToken, mockReq({ headers: bearer('invalid.token.here') }));
    expect(error).toBeInstanceOf(UnauthorizedError);
  });

  it('ignores a token sent in a cookie', async () => {
    const { accessToken } = issueSession(user);
    const req = mockReq({ cookies: { accessToken } });
    expect(await run(authenticateToken, req)).toBeInstanceOf(UnauthorizedError);
  });

  it('answers 401 once the session has ended', async () => {
    const { accessToken, refreshToken } = issueSession(user);
    const claims = verifyRefreshToken(refreshToken)!;
    sessionStore.end(user.id, claims.sid);
    const error = (await run(
      authenticateToken,
      mockReq({ headers: bearer(accessToken) }),
    )) as Error;
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe('Invalid session. Please log in again.');
  });

  it('keeps other sessions of the same user alive when one ends', async () => {
    const first = issueSession(user);
    const second = issueSession(user);
    sessionStore.end(user.id, verifyRefreshToken(first.refreshToken)!.sid);
    expect(
      await run(authenticateToken, mockReq({ headers: bearer(second.accessToken) })),
    ).toBeUndefined();
  });

  it('treats failures as anonymous in the optional variant', async () => {
    const req = mockReq({ headers: bearer('garbage') });
    expect(await run(optionalAuthenticateToken, req)).toBeUndefined();
    expect(req.user).toBeUndefined();
  });
});

describe('guestReadOnly', () => {
  const guestToken = () => issueSession(guest).accessToken;

  it('refuses unsafe methods for a live guest session', async () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const error = await run(
        guestReadOnly,
        mockReq({ method, url: '/plants', headers: bearer(guestToken()) }),
      );
      expect(error, method).toBeInstanceOf(ForbiddenError);
    }
  });

  it('lets guests read', async () => {
    expect(
      await run(guestReadOnly, mockReq({ method: 'GET', headers: bearer(guestToken()) })),
    ).toBeUndefined();
  });

  it('lets guests call the session endpoints', async () => {
    for (const path of [
      '/auth/logout',
      '/auth/ticket',
      '/auth/refresh-token',
      '/auth/login/guest',
    ]) {
      expect(
        await run(
          guestReadOnly,
          mockReq({ method: 'POST', url: path, headers: bearer(guestToken()) }),
        ),
        path,
      ).toBeUndefined();
    }
  });

  it('does not restrict regular users, anonymous callers or dead guest sessions', async () => {
    const userToken = issueSession(user).accessToken;
    expect(
      await run(guestReadOnly, mockReq({ method: 'POST', headers: bearer(userToken) })),
    ).toBeUndefined();
    expect(await run(guestReadOnly, mockReq({ method: 'POST' }))).toBeUndefined();
    const dead = guestToken();
    sessionStore.deleteAll(guest.id);
    expect(
      await run(guestReadOnly, mockReq({ method: 'POST', headers: bearer(dead) })),
    ).toBeUndefined();
  });
});

describe('ticketStore', () => {
  it('creates and validates a ticket', async () => {
    expect(ticketStore.validateAndBurn(ticketStore.create(user.id))).toBe(user.id);
  });

  it('returns user id 0 instead of treating it as missing', async () => {
    expect(ticketStore.validateAndBurn(ticketStore.create(0))).toBe(0);
  });

  it('invalidates a ticket after use', async () => {
    const ticket = ticketStore.create(user.id);
    ticketStore.validateAndBurn(ticket);
    expect(ticketStore.validateAndBurn(ticket)).toBeNull();
  });

  it('rejects an expired ticket', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const ticket = ticketStore.create(user.id);
    vi.setSystemTime(Date.now() + 61_000);
    expect(ticketStore.validateAndBurn(ticket)).toBeNull();
  });
});

describe('generateTokens', () => {
  it('signs distinct secrets for access and refresh tokens', async () => {
    const { accessToken, refreshToken } = generateTokens(user, 'sid-1');
    expect(() => jwt.verify(accessToken, jwtConfig.JWT_REFRESH_SECRET)).toThrow();
    expect(() => jwt.verify(refreshToken, jwtConfig.JWT_SECRET)).toThrow();
  });
});
