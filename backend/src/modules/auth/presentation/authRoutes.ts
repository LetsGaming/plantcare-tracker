/**
 * modules/auth/presentation/authRoutes.ts
 *
 * REST compliance:
 *  - POST /auth/register     → 201 + user resource
 *  - POST /auth/login        → 200 + token
 *  - POST /auth/login/guest  → 200 + token
 *  - POST /auth/logout       → 204 No Content
 *  - POST /auth/refresh-token → 200 + new token
 *  - POST /auth/ticket       → 200 + ticket
 *  - PATCH /auth/me          → 200 (no body — session invalidated, client must re-login)
 *  - DELETE /auth/me         → 204 No Content
 *
 * URL cleanup:
 *  - PATCH /auth/me     (was PUT /auth/update — verb in URL, wrong method for partial update)
 *  - PATCH /auth/:id    (was PUT /auth/update/:id — admin override)
 *  - DELETE /auth/me    (was DELETE /auth/delete — verb in URL)
 *  - POST /auth/ticket  (was POST /auth/request-ticket — verb in URL)
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
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
import { authenticateToken, isAdmin } from '../../../core/middleware';

const authIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

const authAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const body = req.body as Record<string, unknown> | undefined;
    return (
      (typeof body?.email === 'string' ? body.email : undefined) ??
      (typeof body?.username === 'string' ? body.username : undefined) ??
      ipKeyGenerator(req.ip ?? '')
    );
  },
});

export const createAuthRouter = (_pool?: unknown): Router => {
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

  const COOKIE_BASE = { httpOnly: true, sameSite: 'strict' as const };
  const apiVersion = process.env.API_VERSION_PATH ?? (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pkg = require('../../../../../package.json') as { versionPath?: string };
      return pkg.versionPath ?? 'v2';
    } catch { return 'v2'; }
  })();
  const refreshCookiePath = `/api/${apiVersion}/auth/refresh-token`;

  // POST /register → 201 + user
  router.post(
    '/register',
    authIpLimiter,
    authAccountLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = await register.execute(req.body);
        res.status(201).location(`/auth/me`).json({ data: user });
      } catch (err) { next(err); }
    },
  );

  // POST /login → 200 + accessToken
  router.post(
    '/login',
    authIpLimiter,
    authAccountLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { accessToken, refreshToken } = await login.execute(req.body);
        const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
        res.cookie('refreshToken', refreshToken, {
          ...COOKIE_BASE,
          secure: isHttps,
          maxAge: 7 * 24 * 60 * 60 * 1000,
          path: refreshCookiePath,
        });
        res.json({ data: { accessToken } });
      } catch (err) { next(err); }
    },
  );

  // POST /login/guest → 200 + accessToken
  router.post(
    '/login/guest',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { accessToken, refreshToken } = await guestLogin.execute();
        const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
        res.cookie('refreshToken', refreshToken, {
          ...COOKIE_BASE,
          secure: isHttps,
          maxAge: 60 * 60 * 1000,
        });
        res.json({ data: { accessToken } });
      } catch (err) { next(err); }
    },
  );

  // POST /refresh-token → 200 + accessToken
  router.post(
    '/refresh-token',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const accessToken = refresh.execute(req.cookies?.refreshToken);
        res.json({ data: { accessToken } });
      } catch (err) { next(err); }
    },
  );

  // POST /ticket — was /request-ticket (verb removed)
  router.post(
    '/ticket',
    authenticateToken,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const ticket = requestTicket.execute(req.user!.id);
        res.json({ data: { ticket } });
      } catch (err) { next(err); }
    },
  );

  // POST /logout → 204 No Content
  router.post('/logout', (req: Request, res: Response) => {
    logout.execute(req.cookies?.refreshToken);
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.clearCookie('refreshToken', {
      ...COOKIE_BASE,
      secure: isHttps,
      path: refreshCookiePath,
    });
    res.status(204).end();
  });

  // PATCH /me — own profile (was PUT /update — verb in URL + wrong method)
  router.patch(
    '/me',
    authenticateToken,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await updateProfile.execute(req.user!.id, req.body);
        // Sessions are invalidated after profile change — client must re-authenticate.
        // Return 200 with no data body so the client knows to log out cleanly.
        res.json({ data: null });
      } catch (err) { next(err); }
    },
  );

  // PATCH /:id — admin profile override (was PUT /update/:id)
  router.patch(
    '/:id',
    authenticateToken,
    isAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await updateProfile.execute(Number(req.params.id), req.body);
        res.json({ data: null });
      } catch (err) { next(err); }
    },
  );

  // DELETE /me — own account (was DELETE /delete — verb in URL)
  router.delete(
    '/me',
    authenticateToken,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await deleteProfile.execute(req.user!.id);
        res.status(204).end();
      } catch (err) { next(err); }
    },
  );

  return router;
};
