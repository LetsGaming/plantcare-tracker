import { describe, it, expect, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  clearRefreshCookies,
  readRefreshToken,
  refreshCookiePath,
  setRefreshCookie,
} from '../../../src/modules/auth/presentation/refreshCookie';
import { AUTH, getApiBasePath } from '../../../src/core/config';

const makeReply = () =>
  ({ setCookie: vi.fn(), clearCookie: vi.fn() }) as unknown as FastifyReply & {
    setCookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };

const makeRequest = (overrides: Partial<FastifyRequest> = {}) =>
  ({ protocol: 'http', headers: {}, cookies: {}, ...overrides }) as unknown as FastifyRequest;

describe('refresh cookie', () => {
  it('is scoped to the auth module under the API base path', () => {
    expect(refreshCookiePath()).toBe(`${getApiBasePath()}/auth`);
  });

  it('sets an http-only strict cookie with the given lifetime in seconds', () => {
    const reply = makeReply();
    setRefreshCookie(makeRequest(), reply, 'tok', 90_500);
    expect(reply.setCookie).toHaveBeenCalledWith(AUTH.REFRESH_TOKEN_COOKIE, 'tok', {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      maxAge: 90,
      path: refreshCookiePath(),
    });
  });

  it('marks the cookie secure behind an https proxy', () => {
    const reply = makeReply();
    setRefreshCookie(makeRequest({ headers: { 'x-forwarded-proto': 'https' } }), reply, 't', 1000);
    expect(reply.setCookie.mock.calls[0][2]).toMatchObject({ secure: true });
  });

  it('clears the current and the legacy cookie paths', () => {
    const reply = makeReply();
    clearRefreshCookies(makeRequest(), reply);
    const paths = reply.clearCookie.mock.calls.map((call) => (call[1] as { path: string }).path);
    expect(paths).toEqual([refreshCookiePath(), `${getApiBasePath()}/auth/refresh-token`, '/']);
  });

  it('reads the token from the request cookies', () => {
    const request = makeRequest({ cookies: { [AUTH.REFRESH_TOKEN_COOKIE]: 'abc' } });
    expect(readRefreshToken(request)).toBe('abc');
  });
});
