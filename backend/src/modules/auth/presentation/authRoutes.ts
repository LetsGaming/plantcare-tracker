/**
 * modules/auth/presentation/authRoutes.ts
 */

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { SQLiteUserRepository } from "../infrastructure/SQLiteUserRepository";
import {
  RegisterUseCase,
  LoginUseCase,
  GuestLoginUseCase,
  RefreshTokenUseCase,
  LogoutUseCase,
  RequestTicketUseCase,
  UpdateProfileUseCase,
  DeleteProfileUseCase,
} from "../application/AuthUseCases";
import { authenticateToken, isAdmin } from "../../../core/middleware";

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
      (typeof body?.email === "string" ? body.email : undefined) ??
      (typeof body?.username === "string" ? body.username : undefined) ??
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

  const COOKIE_BASE = { httpOnly: true, sameSite: "strict" as const };
  const refreshCookiePath = "/api/v2/auth/refresh-token";

  // POST /register
  router.post(
    "/register",
    authIpLimiter,
    authAccountLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = await register.execute(req.body);
        res.status(201).json({ success: true, data: user });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /login
  router.post(
    "/login",
    authIpLimiter,
    authAccountLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { accessToken, refreshToken } = await login.execute(req.body);
        const isHttps =
          req.secure || req.headers["x-forwarded-proto"] === "https";
        res.cookie("refreshToken", refreshToken, {
          ...COOKIE_BASE,
          secure: isHttps,
          maxAge: 7 * 24 * 60 * 60 * 1000,
          path: refreshCookiePath,
        });
        res.json({ success: true, data: { accessToken } });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /login/guest
  router.post(
    "/login/guest",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { accessToken, refreshToken } = await guestLogin.execute();
        const isHttps =
          req.secure || req.headers["x-forwarded-proto"] === "https";
        res.cookie("refreshToken", refreshToken, {
          ...COOKIE_BASE,
          secure: isHttps,
          maxAge: 60 * 60 * 1000,
        });
        res.json({ success: true, data: { accessToken } });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /refresh-token
  router.post(
    "/refresh-token",
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const accessToken = refresh.execute(req.cookies?.refreshToken);
        res.json({ success: true, data: { accessToken } });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /request-ticket
  router.post(
    "/request-ticket",
    authenticateToken,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const ticket = requestTicket.execute(req.user!.id);
        res.json({ success: true, data: { ticket } });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /logout
  router.post("/logout", (req: Request, res: Response) => {
    logout.execute(req.cookies?.refreshToken);
    const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
    res.clearCookie("refreshToken", {
      ...COOKIE_BASE,
      secure: isHttps,
      path: refreshCookiePath,
    });
    res.json({ success: true, data: { loggedOut: true } });
  });

  // PUT /update (own profile)
  router.put(
    "/update",
    authenticateToken,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await updateProfile.execute(req.user!.id, req.body);
        res.json({ success: true, data: { updated: true } });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /update/:id (admin)
  router.put(
    "/update/:id",
    authenticateToken,
    isAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await updateProfile.execute(Number(req.params.id), req.body);
        res.json({ success: true, data: { updated: true } });
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /delete
  router.delete(
    "/delete",
    authenticateToken,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await deleteProfile.execute(req.user!.id);
        res.json({ success: true, data: { deleted: true } });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
};
