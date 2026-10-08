/**
 * core/auth/tokens.ts
 *
 * JWT signing and verification. Both token types carry the session id of
 * the login that issued them; callers decide whether the session must
 * still be alive.
 */

import jwt, { type SignOptions } from 'jsonwebtoken';
import { getConfig } from '../config';
import { GUEST_SESSION_POLICY, USER_SESSION_POLICY, sessionStore } from './sessions';

const JWT_ALGORITHMS: jwt.Algorithm[] = ['HS256'];

export interface TokenIdentity {
  id: number;
  username: string;
  role: string;
}

/** Claims carried by both token types. */
export interface JwtPayload extends TokenIdentity {
  sid: string;
}

/** The authenticated principal on a request; SSE tickets carry no session. */
export interface AuthUser extends TokenIdentity {
  sid?: string;
}

export const isGuestRole = (role: string | undefined): boolean => role?.toLowerCase() === 'guest';

const claimsOf = (user: TokenIdentity, sid: string): JwtPayload => ({
  id: user.id,
  username: user.username,
  role: user.role,
  sid,
});

export const signAccessToken = (user: TokenIdentity, sid: string): string => {
  const { secret, expiration } = getConfig().jwt;
  const options: SignOptions = { expiresIn: expiration as SignOptions['expiresIn'] };
  return jwt.sign(claimsOf(user, sid), secret, options);
};

export const generateTokens = (user: TokenIdentity, sid: string) => {
  const { refreshSecret, refreshExpiration } = getConfig().jwt;
  const options: SignOptions = { expiresIn: refreshExpiration as SignOptions['expiresIn'] };
  return {
    accessToken: signAccessToken(user, sid),
    refreshToken: jwt.sign(claimsOf(user, sid), refreshSecret, options),
  };
};

/** Starts a session for the user and returns the matching token pair. */
export const issueSession = (user: TokenIdentity) => {
  const policy = isGuestRole(user.role) ? GUEST_SESSION_POLICY : USER_SESSION_POLICY;
  return generateTokens(user, sessionStore.create(user.id, policy));
};

const hasSessionClaims = (decoded: unknown): decoded is JwtPayload => {
  const d = decoded as Partial<JwtPayload> | null;
  return (
    typeof d === 'object' &&
    d !== null &&
    typeof d.id === 'number' &&
    typeof d.sid === 'string' &&
    typeof d.role === 'string'
  );
};

/** True when the token has a valid signature and has not expired. */
export const isValidAccessToken = (token: string): boolean => {
  try {
    jwt.verify(token, getConfig().jwt.secret, { algorithms: JWT_ALGORITHMS });
    return true;
  } catch {
    return false;
  }
};

/** Decodes an access token and checks that its session is still registered. */
export const readAccessSession = (token: string): JwtPayload | null => {
  try {
    const decoded = jwt.verify(token, getConfig().jwt.secret, { algorithms: JWT_ALGORITHMS });
    if (!hasSessionClaims(decoded)) return null;
    return sessionStore.has(decoded.id, decoded.sid) ? decoded : null;
  } catch {
    return null;
  }
};

/**
 * Verifies a refresh token's signature and claims. The session itself is
 * not checked here; callers decide (logout ignores expiry and missing sessions).
 */
export const verifyRefreshToken = (
  token: string,
  options: { ignoreExpiration?: boolean } = {},
): JwtPayload | null => {
  try {
    const decoded = jwt.verify(token, getConfig().jwt.refreshSecret, {
      algorithms: JWT_ALGORITHMS,
      ignoreExpiration: options.ignoreExpiration ?? false,
    });
    return hasSessionClaims(decoded) ? decoded : null;
  } catch {
    return null;
  }
};
