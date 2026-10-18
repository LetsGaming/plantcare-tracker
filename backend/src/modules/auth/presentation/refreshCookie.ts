import type { FastifyReply, FastifyRequest } from 'fastify';
import { AUTH, getApiBasePath } from '../../../core/config';

const COOKIE_BASE = { httpOnly: true, sameSite: 'strict' as const };

const isHttpsRequest = (request: FastifyRequest): boolean =>
  request.protocol === 'https' || request.headers['x-forwarded-proto'] === 'https';

const seconds = (ms: number): number => Math.floor(ms / 1000);

/**
 * Scoped to the auth module: /refresh-token reads the cookie to mint access
 * tokens and /logout reads it to end the session server-side. It is never
 * sent along with regular API calls outside /auth.
 */
export const refreshCookiePath = (): string => `${getApiBasePath()}/auth`;

/** Cookie paths used by earlier releases; logout keeps clearing them so old sessions can sign out. */
const legacyRefreshCookiePaths = (): string[] => [`${getApiBasePath()}/auth/refresh-token`, '/'];

export const setRefreshCookie = (
  request: FastifyRequest,
  reply: FastifyReply,
  token: string,
  maxAgeMs: number,
): void => {
  void reply.setCookie(AUTH.REFRESH_TOKEN_COOKIE, token, {
    ...COOKIE_BASE,
    secure: isHttpsRequest(request),
    maxAge: seconds(maxAgeMs),
    path: refreshCookiePath(),
  });
};

export const clearRefreshCookies = (request: FastifyRequest, reply: FastifyReply): void => {
  for (const path of [refreshCookiePath(), ...legacyRefreshCookiePaths()]) {
    void reply.clearCookie(AUTH.REFRESH_TOKEN_COOKIE, {
      ...COOKIE_BASE,
      secure: isHttpsRequest(request),
      path,
    });
  }
};

export const readRefreshToken = (request: FastifyRequest): string | undefined =>
  request.cookies?.[AUTH.REFRESH_TOKEN_COOKIE];
