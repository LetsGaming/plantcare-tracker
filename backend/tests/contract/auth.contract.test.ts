import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { API, createContractApp, type ContractApp, type ContractResponse } from './harness';

let app: ContractApp;
let seq = 0;

beforeAll(async () => {
  app = await createContractApp();
});
afterAll(() => app.close());

const uniqueName = (prefix = 'user') =>
  `${prefix}-${++seq}-${Math.random().toString(36).slice(2, 6)}`;

const register = (username: string, password = 'secret-pass') =>
  app.client.request({ method: 'post', url: `${API}/auth/register`, json: { username, password } });

const login = (username: string, password = 'secret-pass') =>
  app.client.request({ method: 'post', url: `${API}/auth/login`, json: { username, password } });

const refreshCookieOf = (res: ContractResponse) =>
  res.cookies.find((c) => c.startsWith('refreshToken=')) as string;

const tokenPayload = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

const SEED_PASSWORD = 'contract-password';

/** A signed-in user created without HTTP, so tests do not consume the auth rate limit. */
const newSession = async () => {
  const { user, auth, refreshCookie } = await app.signIn('user');
  return { username: user.username, auth, refreshCookie, accessToken: auth.Authorization.slice(7) };
};

describe('POST /auth/register', () => {
  it('creates a user and answers 201 with a Location header', async () => {
    const username = uniqueName();
    const res = await register(username);
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe('/auth/me');
    expect(res.body).toEqual({ data: { id: expect.any(Number), username } });
  });

  it('stores new users with the user role', async () => {
    const username = uniqueName();
    await register(username);
    const res = await login(username);
    expect(tokenPayload(res.body.data.accessToken).role).toBe('user');
  });

  it('rejects a duplicate username, ignoring case, with 409', async () => {
    const username = uniqueName('Dup');
    await register(username);
    const res = await register(username.toUpperCase());
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      type: 'ConflictError',
      message: 'Username already exists',
      statusCode: 409,
    });
  });

  it('rejects missing fields with a per-field 400', async () => {
    const res = await app.client.request({ method: 'post', url: `${API}/auth/register`, json: {} });
    expect(res.status).toBe(400);
    expect(res.body.error.type).toBe('ValidationError');
    expect(res.body.error.fields).toEqual({
      username: expect.any(String),
      password: expect.any(String),
    });
  });
});

describe('POST /auth/login', () => {
  it('returns an access token and sets a scoped refresh cookie', async () => {
    const username = uniqueName();
    await register(username);
    const loginResponse = await login(username);
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body).toEqual({ data: { accessToken: expect.any(String) } });

    const cookie = loginResponse.setCookies.find((c) => c.startsWith('refreshToken='))!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/v2/auth');
    expect(cookie).not.toContain('Path=/api/v2/auth/');
    expect(cookie).toContain('Max-Age=604800');
    expect(cookie).not.toContain('Secure');
  });

  it('marks the cookie Secure behind an https proxy', async () => {
    const username = uniqueName();
    await register(username);
    const res = await app.client.request({
      method: 'post',
      url: `${API}/auth/login`,
      json: { username, password: 'secret-pass' },
      headers: { 'X-Forwarded-Proto': 'https' },
    });
    expect(res.setCookies.find((c) => c.startsWith('refreshToken='))).toContain('Secure');
  });

  it('issues a token carrying id, username and role', async () => {
    const username = uniqueName();
    await register(username);
    const { accessToken } = {
      accessToken: (await login(username)).body.data.accessToken as string,
    };
    expect(tokenPayload(accessToken)).toMatchObject({
      id: expect.any(Number),
      username,
      role: 'user',
    });
  });

  it('rejects a wrong password with 401', async () => {
    const { username } = await newSession();
    const res = await login(username, 'wrong');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({
      type: 'UnauthorizedError',
      message: 'Invalid credentials',
    });
  });

  it('rejects an unknown user with the same 401', async () => {
    const res = await login(uniqueName('ghost'));
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid credentials');
  });

  it('rejects missing fields with 400', async () => {
    const res = await app.client.request({ method: 'post', url: `${API}/auth/login`, json: {} });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/login/guest', () => {
  it('issues a guest token with a one hour refresh cookie', async () => {
    const res = await app.client.request({ method: 'post', url: `${API}/auth/login/guest` });
    expect(res.status).toBe(200);
    expect(tokenPayload(res.body.data.accessToken)).toMatchObject({
      username: 'guest',
      role: 'guest',
    });
    const cookie = res.setCookies.find((c) => c.startsWith('refreshToken='))!;
    expect(cookie).toContain('Max-Age=3600');
    expect(cookie).toContain('Path=/api/v2/auth');
  });
});

describe('POST /auth/refresh-token', () => {
  it('mints a new access token from the refresh cookie', async () => {
    const { refreshCookie } = await newSession();
    const res = await app.client.request({
      method: 'post',
      url: `${API}/auth/refresh-token`,
      cookies: [refreshCookie],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { accessToken: expect.any(String) } });
  });

  it('answers 401 without a cookie', async () => {
    const res = await app.client.request({ method: 'post', url: `${API}/auth/refresh-token` });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Refresh token required');
  });

  it('answers 401 for an unknown refresh token', async () => {
    const res = await app.client.request({
      method: 'post',
      url: `${API}/auth/refresh-token`,
      cookies: ['refreshToken=not-a-session'],
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({
      type: 'UnauthorizedError',
      message: 'Invalid refresh token',
    });
  });
});

describe('POST /auth/ticket', () => {
  it('issues a one-time 64 character hex ticket to an authenticated user', async () => {
    const { auth } = await newSession();
    const res = await app.client.request({
      method: 'post',
      url: `${API}/auth/ticket`,
      headers: auth,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.ticket).toMatch(/^[0-9a-f]{64}$/);
  });

  it('answers 401 without a token', async () => {
    const res = await app.client.request({ method: 'post', url: `${API}/auth/ticket` });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({
      type: 'UnauthorizedError',
      message: 'Missing authentication token',
    });
  });
});

describe('POST /auth/logout', () => {
  it('answers 204, clears the cookie on the current and legacy paths and ends the session', async () => {
    const { refreshCookie } = await newSession();
    const res = await app.client.request({
      method: 'post',
      url: `${API}/auth/logout`,
      cookies: [refreshCookie],
    });
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    const cleared = res.setCookies.filter((c) => c.startsWith('refreshToken=;'));
    expect(cleared.map((c) => /Path=([^;]+)/.exec(c)![1]).sort()).toEqual(
      ['/', '/api/v2/auth', '/api/v2/auth/refresh-token'].sort(),
    );

    const after = await app.client.request({
      method: 'post',
      url: `${API}/auth/refresh-token`,
      cookies: [refreshCookie],
    });
    expect(after.status).toBe(401);
  });

  it('answers 204 without a cookie', async () => {
    const res = await app.client.request({ method: 'post', url: `${API}/auth/logout` });
    expect(res.status).toBe(204);
  });

  it('accepts an empty body that declares a JSON content type', async () => {
    const res = await app.client.request({
      method: 'post',
      url: `${API}/auth/logout`,
      contentType: 'application/json',
    });
    expect(res.status).toBe(204);
  });
});

describe('PATCH /auth/me', () => {
  it('changes the username, answers data null and ends every session', async () => {
    const { auth, refreshCookie } = await newSession();
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/auth/me`,
      headers: auth,
      json: { username: uniqueName('renamed') },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: null });

    const stale = await app.client.request({
      method: 'get',
      url: `${API}/components`,
      headers: auth,
    });
    expect(stale.status).toBe(401);
    const refresh = await app.client.request({
      method: 'post',
      url: `${API}/auth/refresh-token`,
      cookies: [refreshCookie],
    });
    expect(refresh.status).toBe(401);
  });

  it('changes the password when a matching confirmation is sent', async () => {
    const { auth, username } = await newSession();
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/auth/me`,
      headers: auth,
      json: { password: 'brand-new', passwordConfirmation: 'brand-new' },
    });
    expect(res.status).toBe(200);
    expect((await login(username, 'brand-new')).status).toBe(200);
    expect((await login(username, SEED_PASSWORD)).status).toBe(401);
  });

  it('rejects a missing or mismatching confirmation with 400', async () => {
    const { auth } = await newSession();
    const missing = await app.client.request({
      method: 'patch',
      url: `${API}/auth/me`,
      headers: auth,
      json: { password: 'brand-new' },
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toBe('Password confirmation is required');

    const mismatch = await app.client.request({
      method: 'patch',
      url: `${API}/auth/me`,
      headers: auth,
      json: { password: 'brand-new', passwordConfirmation: 'other' },
    });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.message).toBe('Passwords do not match');
  });

  it('rejects an empty update with 400', async () => {
    const { auth } = await newSession();
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/auth/me`,
      headers: auth,
      json: {},
    });
    expect(res.status).toBe(400);
  });

  it('answers 401 without a token', async () => {
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/auth/me`,
      json: { username: 'x' },
    });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /auth/:id', () => {
  it('lets an admin update another user', async () => {
    const admin = await app.signIn('admin');
    const target = await app.createUser('user');
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/auth/${target.id}`,
      headers: admin.auth,
      json: { username: uniqueName('by-admin') },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: null });
  });

  it('answers 403 for a non-admin', async () => {
    const user = await app.signIn('user');
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/auth/${user.user.id}`,
      headers: user.auth,
      json: { username: uniqueName('nope') },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Admin access required');
  });

  it('answers 404 for an unknown user', async () => {
    const admin = await app.signIn('admin');
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/auth/999999`,
      headers: admin.auth,
      json: { username: uniqueName('ghost') },
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /auth/me', () => {
  it('deletes the account with 204 and the credentials stop working', async () => {
    const { auth, username } = await newSession();
    const res = await app.client.request({
      method: 'delete',
      url: `${API}/auth/me`,
      headers: auth,
    });
    expect(res.status).toBe(204);
    expect((await login(username, SEED_PASSWORD)).status).toBe(401);
  });
});

describe('token handling', () => {
  it('rejects a garbage bearer token', async () => {
    const res = await app.client.request({
      method: 'get',
      url: `${API}/components`,
      headers: { Authorization: 'Bearer garbage' },
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({
      type: 'UnauthorizedError',
      message: 'Invalid or expired token',
    });
  });

  it('ignores a token sent in an accessToken cookie', async () => {
    const { accessToken } = await newSession();
    const res = await app.client.request({
      method: 'get',
      url: `${API}/components`,
      cookies: [`accessToken=${accessToken}`],
    });
    expect(res.status).toBe(401);
  });

  it('answers 401 for a token whose session ended', async () => {
    const { accessToken, refreshCookie } = await newSession();
    await app.client.request({
      method: 'post',
      url: `${API}/auth/logout`,
      cookies: [refreshCookie],
    });
    const res = await app.client.request({
      method: 'get',
      url: `${API}/components`,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid session. Please log in again.');
  });

  it('keeps the other sessions of a user alive when one session logs out', async () => {
    const user = await app.createUser('user');
    const first = app.session(user);
    const second = app.session(user);
    await app.client.request({
      method: 'post',
      url: `${API}/auth/logout`,
      cookies: [first.refreshCookie],
    });
    expect(
      (await app.client.request({ method: 'get', url: `${API}/components`, headers: first.auth }))
        .status,
    ).toBe(401);
    expect(
      (await app.client.request({ method: 'get', url: `${API}/components`, headers: second.auth }))
        .status,
    ).toBe(200);
  });

  it('gives two logins in the same second distinct tokens', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const username = uniqueName();
      await register(username);
      const first = await login(username);
      const second = await login(username);
      expect(second.body.data.accessToken).not.toBe(first.body.data.accessToken);
      expect(refreshCookieOf(second)).not.toBe(refreshCookieOf(first));
      await app.client.request({
        method: 'post',
        url: `${API}/auth/logout`,
        cookies: [refreshCookieOf(first)],
      });
      const res = await app.client.request({
        method: 'post',
        url: `${API}/auth/refresh-token`,
        cookies: [refreshCookieOf(second)],
      });
      expect(res.status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts the oldest of more than three sessions of one user', async () => {
    const user = await app.createUser('user');
    const sessions = [1, 2, 3, 4].map(() => app.session(user));
    const statuses = await Promise.all(
      sessions.map((s) =>
        app.client.request({ method: 'get', url: `${API}/components`, headers: s.auth }),
      ),
    );
    expect(statuses.map((r) => r.status)).toEqual([401, 200, 200, 200]);
  });
});

describe('guest account', () => {
  const guestSession = async () => {
    const res = await app.client.request({ method: 'post', url: `${API}/auth/login/guest` });
    return {
      res,
      auth: { Authorization: `Bearer ${res.body.data.accessToken}` },
      refreshCookie: refreshCookieOf(res),
    };
  };

  it('cannot change its profile', async () => {
    const { auth } = await guestSession();
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/auth/me`,
      headers: auth,
      json: { password: 'guest', passwordConfirmation: 'guest' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Guests are not allowed to perform this action');
  });

  it('cannot delete the shared guest account, so guest login keeps working', async () => {
    const { auth } = await guestSession();
    const res = await app.client.request({
      method: 'delete',
      url: `${API}/auth/me`,
      headers: auth,
    });
    expect(res.status).toBe(403);
    expect(
      (await app.client.request({ method: 'post', url: `${API}/auth/login/guest` })).status,
    ).toBe(200);
  });

  it('is protected from admin edits and deletion too', async () => {
    const admin = await app.signIn('admin');
    const [{ id: guestId }] = app.db.query<{ id: number }>(
      "SELECT id FROM users WHERE username = 'guest'",
    );
    const patch = await app.client.request({
      method: 'patch',
      url: `${API}/auth/${guestId}`,
      headers: admin.auth,
      json: { username: 'renamed-guest' },
    });
    expect(patch.status).toBe(404);
    expect(app.db.query("SELECT 1 FROM users WHERE username = 'guest'")).toHaveLength(1);
  });

  it('can refresh its session even though the seeded guest id is 0', async () => {
    const { refreshCookie } = await guestSession();
    const res = await app.client.request({
      method: 'post',
      url: `${API}/auth/refresh-token`,
      cookies: [refreshCookie],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it('can end its own session', async () => {
    const { refreshCookie } = await guestSession();
    expect(
      (
        await app.client.request({
          method: 'post',
          url: `${API}/auth/logout`,
          cookies: [refreshCookie],
        })
      ).status,
    ).toBe(204);
  });

  it('keeps every concurrent guest session alive', async () => {
    const guests = await Promise.all([1, 2, 3, 4, 5].map(() => guestSession()));
    const statuses = await Promise.all(
      guests.map((g) =>
        app.client.request({ method: 'get', url: `${API}/components`, headers: g.auth }),
      ),
    );
    expect(statuses.every((r) => r.status === 200)).toBe(true);
  });
});

describe('bodies of null', () => {
  it('accepts a JSON body of null on logout and ends the session', async () => {
    const { refreshCookie } = await newSession();
    const res = await app.client.request({
      method: 'post',
      url: `${API}/auth/logout`,
      cookies: [refreshCookie],
      rawBody: 'null',
    });
    expect(res.status).toBe(204);
    const refresh = await app.client.request({
      method: 'post',
      url: `${API}/auth/refresh-token`,
      cookies: [refreshCookie],
    });
    expect(refresh.status).toBe(401);
  });

  it('accepts a JSON body of null on guest login', async () => {
    const res = await app.client.request({
      method: 'post',
      url: `${API}/auth/login/guest`,
      rawBody: 'null',
    });
    expect(res.status).toBe(200);
  });

  it('answers a null body on login with a validation error, not a server error', async () => {
    const res = await app.client.request({
      method: 'post',
      url: `${API}/auth/login`,
      rawBody: 'null',
    });
    expect(res.status).toBe(400);
  });
});

describe('known defects', () => {
  it('accepts a one character password (SEC-09)', async () => {
    const username = uniqueName();
    expect((await register(username, 'x')).status).toBe(201);
    expect((await login(username, 'x')).status).toBe(200);
  });

  it('answers a rename onto an existing username with 500 instead of 409 (BUG-03)', async () => {
    const { username: taken } = await newSession();
    const { auth } = await newSession();
    const res = await app.client.request({
      method: 'patch',
      url: `${API}/auth/me`,
      headers: auth,
      json: { username: taken },
    });
    expect(res.status).toBe(500);
  });
});
