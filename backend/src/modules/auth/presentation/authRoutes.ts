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
 *  - PATCH /auth/me           → 200 (data: null — sessions invalidated, client must re-login)
 *  - PATCH /auth/:id          → 200 (admin override)
 *  - DELETE /auth/me          → 204 No Content
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
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
  createRateLimiter,
  perUserKey,
} from '../../../core/middleware';
import {
  AUTH,
  AUTH_RATE_LIMIT,
  USER_RATE_LIMIT,
  HTTP_STATUS,
  getApiVersionPath,
} from '../../../core/config';

// ── Rate limiting ─────────────────────────────────────────────────────────────

const authIpLimiter = createRateLimiter({
  windowMs: AUTH_RATE_LIMIT.WINDOW_MS,
  max: AUTH_RATE_LIMIT.MAX_PER_IP,
});

const authAccountLimiter = createRateLimiter({
  windowMs: AUTH_RATE_LIMIT.WINDOW_MS,
  max: AUTH_RATE_LIMIT.MAX_PER_ACCOUNT,
  key: (req) => {
    const body = req.body as Record<string, unknown> | undefined;
    return typeof body?.username === 'string' ? `account:${body.username}` : undefined;
  },
});

const ticketLimiter = createRateLimiter({
  windowMs: USER_RATE_LIMIT.WINDOW_MS,
  max: USER_RATE_LIMIT.MAX_TICKETS,
  key: perUserKey,
});

// ── Cookie helpers ────────────────────────────────────────────────────────────

const COOKIE_BASE = { httpOnly: true, sameSite: 'strict' as const };

const isHttpsRequest = (req: Request): boolean =>
  req.secure || req.headers['x-forwarded-proto'] === 'https';

export const createAuthRouter = (): Router => {
  const router = Router();
  const repo = new SQLiteUserRepository();

  const register = new RegisterUseCase(repo);
  const login = new LoginUseCase(repo);
  const guestLogin = new GuestLoginUseCase(repo);
  const refresh = new RefreshTokenUseCase();
  const logout = new LogoutUseCase();
  const requestTicket = new RequestTicketUseCase();
  const updateProfile = new UpdateProfileUseCase(repo);
  const deleteProfile = new DeleteProfileUseCase(repo);

  // Scope the refresh cookie to the auth module: /refresh-token reads it
  // to mint new access tokens and /logout reads it to invalidate the
  // session server-side. It is still never sent along with regular API
  // calls outside /auth. (Scoping it to /refresh-token only — as earlier
  // releases did — meant /logout never saw the cookie, so sessions were
  // never invalidated and a page load could silently sign the user back
  // in via the surviving refresh token.)
  const refreshCookiePath = `/api/${getApiVersionPath()}/auth`;

  // Cookie paths used by earlier releases — logout keeps clearing them so
  // sessions created before the upgrade can still sign out cleanly.
  const legacyCookiePaths = [`/api/${getApiVersionPath()}/auth/refresh-token`, '/'];

  // POST /register → 201 + user
  router.post(
    '/register',
    authIpLimiter,
    authAccountLimiter,
    async (req: Request, res: Response) => {
      const user = await register.execute(req.body);
      res.status(HTTP_STATUS.CREATED).location('/auth/me').json({ data: user });
    },
  );

  // POST /login → 200 + accessToken (refresh token in scoped cookie)
  router.post('/login', authIpLimiter, authAccountLimiter, async (req: Request, res: Response) => {
    const { accessToken, refreshToken } = await login.execute(req.body);
    res.cookie(AUTH.REFRESH_TOKEN_COOKIE, refreshToken, {
      ...COOKIE_BASE,
      secure: isHttpsRequest(req),
      maxAge: AUTH.REFRESH_COOKIE_MAX_AGE_MS,
      path: refreshCookiePath,
    });
    res.json({ data: { accessToken } });
  });

  // POST /login/guest → 200 + accessToken
  router.post('/login/guest', authIpLimiter, async (req: Request, res: Response) => {
    const { accessToken, refreshToken } = await guestLogin.execute();
    res.cookie(AUTH.REFRESH_TOKEN_COOKIE, refreshToken, {
      ...COOKIE_BASE,
      secure: isHttpsRequest(req),
      maxAge: AUTH.GUEST_REFRESH_COOKIE_MAX_AGE_MS,
      // Same scope as the regular login — without it the cookie lands on
      // path "/" and the logout clearCookie (attribute-matched) never
      // removes it, so guests could not actually sign out.
      path: refreshCookiePath,
    });
    res.json({ data: { accessToken } });
  });

  // POST /refresh-token → 200 + accessToken
  router.post('/refresh-token', async (req: Request, res: Response) => {
    const accessToken = refresh.execute(req.cookies?.refreshToken);
    res.json({ data: { accessToken } });
  });

  // POST /ticket → 200 + one-time SSE ticket
  router.post('/ticket', authenticateToken, ticketLimiter, async (req: Request, res: Response) => {
    const ticket = requestTicket.execute(req.user!.id);
    res.json({ data: { ticket } });
  });

  // POST /logout → 204 No Content
  router.post('/logout', (req: Request, res: Response) => {
    // The cookie is scoped to /auth, so it arrives here and the session
    // can actually be invalidated server-side.
    logout.execute(req.cookies?.refreshToken);
    for (const path of [refreshCookiePath, ...legacyCookiePaths]) {
      res.clearCookie(AUTH.REFRESH_TOKEN_COOKIE, {
        ...COOKIE_BASE,
        secure: isHttpsRequest(req),
        path,
      });
    }
    res.status(HTTP_STATUS.NO_CONTENT).end();
  });

  // PATCH /me — own profile
  router.patch('/me', authenticateToken, async (req: Request, res: Response) => {
    await updateProfile.execute(req.user!.id, req.body);
    // Sessions are invalidated after a profile change — the client
    // must re-authenticate. data: null signals "log out cleanly".
    res.json({ data: null });
  });

  // PATCH /:id — admin profile override
  router.patch('/:id', authenticateToken, isAdmin, async (req: Request, res: Response) => {
    await updateProfile.execute(Number(req.params.id), req.body);
    res.json({ data: null });
  });

  // DELETE /me — own account
  router.delete('/me', authenticateToken, async (req: Request, res: Response) => {
    await deleteProfile.execute(req.user!.id);
    res.status(HTTP_STATUS.NO_CONTENT).end();
  });

  return router;
};
