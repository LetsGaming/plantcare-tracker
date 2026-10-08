/**
 * modules/auth/presentation/authRoutes.ts
 *
 * Composition root for the auth module.
 *
 * REST compliance:
 *  - POST /auth/register      → 201 + user resource
 *  - POST /auth/login         → 200 + token
 *  - POST /auth/login/guest   → 200 + token
 *  - POST /auth/logout        → 204 No Content
 *  - POST /auth/refresh-token → 200 + new token
 *  - POST /auth/ticket        → 200 + ticket
 *  - PATCH /auth/me           → 200 (data: null, sessions invalidated, client must re-login)
 *  - PATCH /auth/:id          → 200 (admin override)
 *  - DELETE /auth/me          → 204 No Content
 */

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { SQLiteUserRepository } from '../infrastructure/SQLiteUserRepository';
import {
  RegisterUseCase,
  LoginUseCase,
  GuestLoginUseCase,
  RefreshTokenUseCase,
  LogoutUseCase,
  RequestTicketUseCase,
  UpdateProfileUseCase,
  DeleteProfileUseCase,
} from '../application/AuthUseCases';
import {
  authenticateToken,
  isAdmin,
  createLimiter,
  numericParam,
  perUserKey,
} from '../../../core/middleware';
import {
  AUTH,
  AUTH_RATE_LIMIT,
  USER_RATE_LIMIT,
  HTTP_STATUS,
  getApiVersionPath,
} from '../../../core/config';

const COOKIE_BASE = { httpOnly: true, sameSite: 'strict' as const };

const isHttpsRequest = (request: FastifyRequest): boolean =>
  request.protocol === 'https' || request.headers['x-forwarded-proto'] === 'https';

const seconds = (ms: number): number => Math.floor(ms / 1000);

export const authRoutes: FastifyPluginAsync = async (app) => {
  const repo = new SQLiteUserRepository();

  const register = new RegisterUseCase(repo);
  const login = new LoginUseCase(repo);
  const guestLogin = new GuestLoginUseCase(repo);
  const refresh = new RefreshTokenUseCase();
  const logout = new LogoutUseCase();
  const requestTicket = new RequestTicketUseCase();
  const updateProfile = new UpdateProfileUseCase(repo);
  const deleteProfile = new DeleteProfileUseCase(repo);

  const ipLimiter = createLimiter(app, {
    windowMs: AUTH_RATE_LIMIT.WINDOW_MS,
    max: AUTH_RATE_LIMIT.MAX_PER_IP,
  });
  const accountLimiter = createLimiter(app, {
    windowMs: AUTH_RATE_LIMIT.WINDOW_MS,
    max: AUTH_RATE_LIMIT.MAX_PER_ACCOUNT,
    key: (request) => {
      const body = request.body as Record<string, unknown> | null | undefined;
      return typeof body?.username === 'string' ? `account:${body.username}` : undefined;
    },
  });
  const ticketLimiter = createLimiter(app, {
    windowMs: USER_RATE_LIMIT.WINDOW_MS,
    max: USER_RATE_LIMIT.MAX_TICKETS,
    key: perUserKey,
  });

  // Scope the refresh cookie to the auth module: /refresh-token reads it
  // to mint new access tokens and /logout reads it to invalidate the
  // session server-side. It is still never sent along with regular API
  // calls outside /auth.
  const refreshCookiePath = `/api/${getApiVersionPath()}/auth`;

  // Cookie paths used by earlier releases: logout keeps clearing them so
  // sessions created before the upgrade can still sign out cleanly.
  const legacyCookiePaths = [`/api/${getApiVersionPath()}/auth/refresh-token`, '/'];

  const refreshTokenOf = (request: FastifyRequest): string | undefined =>
    request.cookies?.[AUTH.REFRESH_TOKEN_COOKIE];

  app.post('/register', { preHandler: [ipLimiter, accountLimiter] }, async (request, reply) => {
    const user = await register.execute(request.body);
    return reply.code(HTTP_STATUS.CREATED).header('Location', '/auth/me').send({ data: user });
  });

  app.post('/login', { preHandler: [ipLimiter, accountLimiter] }, async (request, reply) => {
    const { accessToken, refreshToken } = await login.execute(request.body);
    void reply.setCookie(AUTH.REFRESH_TOKEN_COOKIE, refreshToken, {
      ...COOKIE_BASE,
      secure: isHttpsRequest(request),
      maxAge: seconds(AUTH.REFRESH_COOKIE_MAX_AGE_MS),
      path: refreshCookiePath,
    });
    return { data: { accessToken } };
  });

  app.post('/login/guest', { preHandler: [ipLimiter] }, async (request, reply) => {
    const { accessToken, refreshToken } = await guestLogin.execute();
    void reply.setCookie(AUTH.REFRESH_TOKEN_COOKIE, refreshToken, {
      ...COOKIE_BASE,
      secure: isHttpsRequest(request),
      maxAge: seconds(AUTH.GUEST_REFRESH_COOKIE_MAX_AGE_MS),
      // Same scope as the regular login: otherwise the cookie lands on
      // path "/" and the logout clear never removes it.
      path: refreshCookiePath,
    });
    return { data: { accessToken } };
  });

  app.post('/refresh-token', async (request) => {
    const accessToken = refresh.execute(refreshTokenOf(request));
    return { data: { accessToken } };
  });

  app.post(
    '/ticket',
    { onRequest: authenticateToken, preHandler: [ticketLimiter] },
    async (request) => {
      const ticket = requestTicket.execute(request.user!.id);
      return { data: { ticket } };
    },
  );

  app.post('/logout', async (request, reply) => {
    // The cookie is scoped to /auth, so it arrives here and the session
    // can actually be invalidated server-side.
    logout.execute(refreshTokenOf(request));
    for (const path of [refreshCookiePath, ...legacyCookiePaths]) {
      void reply.clearCookie(AUTH.REFRESH_TOKEN_COOKIE, {
        ...COOKIE_BASE,
        secure: isHttpsRequest(request),
        path,
      });
    }
    return reply.code(HTTP_STATUS.NO_CONTENT).send();
  });

  app.patch('/me', { onRequest: authenticateToken }, async (request) => {
    await updateProfile.execute(request.user!.id, request.body);
    // Sessions are invalidated after a profile change; data: null signals
    // "log out cleanly".
    return { data: null };
  });

  app.patch('/:id', { onRequest: [authenticateToken, isAdmin] }, async (request) => {
    await updateProfile.execute(numericParam(request, 'id'), request.body);
    return { data: null };
  });

  app.delete('/me', { onRequest: authenticateToken }, async (request, reply) => {
    await deleteProfile.execute(request.user!.id);
    return reply.code(HTTP_STATUS.NO_CONTENT).send();
  });
};
