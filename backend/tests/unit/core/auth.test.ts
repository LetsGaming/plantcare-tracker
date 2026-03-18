import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import {
  generateTokens,
  authenticateToken,
  sessionStore,
  ticketStore,
  type JwtPayload,
} from "../../../src/core/middleware/auth";

// ── ENV SETUP ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  process.env.JWT_EXPIRATION = "15m";
  process.env.JWT_REFRESH_EXPIRATION = "7d";

  // clear session store
  (sessionStore as any).deleteAll?.(1);
});

// ── HELPERS ───────────────────────────────────────────────────────────────────

const mockReq = (overrides: Partial<Request> = {}): Request =>
  ({
    headers: {},
    cookies: {},
    ...overrides,
  }) as unknown as Request;

const mockRes = (): Response => ({}) as Response;

const mockNext = (): NextFunction => vi.fn();

// ── TESTS ─────────────────────────────────────────────────────────────────────

describe("auth.ts", () => {
  const user: JwtPayload = {
    id: 1,
    username: "testuser",
    role: "user",
  };

  // ── generateTokens ──────────────────────────────────────────────────────────

  it("should generate valid access and refresh tokens", () => {
    const { accessToken, refreshToken } = generateTokens(user);

    const decodedAccess = jwt.verify(accessToken, process.env.JWT_SECRET!);
    const decodedRefresh = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET!,
    );

    expect((decodedAccess as JwtPayload).id).toBe(user.id);
    expect((decodedRefresh as JwtPayload).id).toBe(user.id);
  });

  // ── authenticateToken ───────────────────────────────────────────────────────

  it("should authenticate valid token from Authorization header", () => {
    const { accessToken, refreshToken } = generateTokens(user);

    sessionStore.save(user.id, refreshToken);

    const req = mockReq({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    const next = mockNext();

    authenticateToken(req, mockRes(), next);

    expect(req.user).toBeDefined();
    expect(req.user?.id).toBe(user.id);
    expect(next).toHaveBeenCalledWith();
  });

  it("should reject missing token", () => {
    const req = mockReq();
    const next = mockNext();

    authenticateToken(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
  });

  it("should reject invalid token", () => {
    const req = mockReq({
      headers: {
        authorization: "Bearer invalid.token.here",
      },
    });

    const next = mockNext();

    authenticateToken(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
  });

  it("should reject if no active session exists", () => {
    const { accessToken } = generateTokens(user);

    const req = mockReq({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    const next = mockNext();

    authenticateToken(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
  });

  // ── sessionStore ────────────────────────────────────────────────────────────

  it("should store and retrieve sessions", () => {
    sessionStore.save(user.id, "token1");
    sessionStore.save(user.id, "token2");

    const sessions = sessionStore.get(user.id);

    expect(sessions.length).toBe(2);
    expect(sessions).toContain("token1");
    expect(sessions).toContain("token2");
  });

  // ── ticketStore ─────────────────────────────────────────────────────────────

  it("should create and validate ticket", () => {
    const ticket = ticketStore.create(user.id);

    const validatedUserId = ticketStore.validateAndBurn(ticket);

    expect(validatedUserId).toBe(user.id);
  });

  it("should invalidate ticket after use", () => {
    const ticket = ticketStore.create(user.id);

    ticketStore.validateAndBurn(ticket);
    const secondTry = ticketStore.validateAndBurn(ticket);

    expect(secondTry).toBeNull();
  });
});
