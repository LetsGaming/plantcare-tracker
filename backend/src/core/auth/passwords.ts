/**
 * core/auth/passwords.ts
 *
 * Password hashing with scrypt on the libuv thread pool, so a login never
 * blocks the event loop. Hashes are stored as `scrypt$N$r$p$<salt>$<hash>`
 * (base64). bcrypt is only used to verify legacy `$2*` hashes, which callers
 * replace with a scrypt hash after a successful login.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';

interface ScryptParams {
  N: number;
  r: number;
  p: number;
  keyLength: number;
}

const CURRENT: ScryptParams = { N: 16384, r: 8, p: 1, keyLength: 64 };
const SALT_BYTES = 16;
const PREFIX = 'scrypt';
const LEGACY_BCRYPT_PREFIX = '$2';

/** Bounds for parameters read back from storage; anything outside is rejected. */
const LIMITS = { maxN: 2 ** 20, maxR: 32, maxP: 16, minKeyLength: 16, maxKeyLength: 128 };
const MAX_MEMORY_BYTES = 256 * 1024 * 1024;

export interface PasswordCheck {
  ok: boolean;
  /** True when the stored hash is legacy bcrypt or uses other scrypt parameters than `hashPassword`. */
  needsRehash: boolean;
}

const deriveKey = (plain: string, salt: Buffer, params: ScryptParams): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    crypto.scrypt(
      plain,
      salt,
      params.keyLength,
      { N: params.N, r: params.r, p: params.p, maxmem: MAX_MEMORY_BYTES },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });

export const hashPassword = async (plain: string): Promise<string> => {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await deriveKey(plain, salt, CURRENT);
  const { N, r, p } = CURRENT;
  return [PREFIX, N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
};

const isPowerOfTwo = (n: number): boolean => n > 1 && (n & (n - 1)) === 0;

const parseScrypt = (
  stored: string,
): { params: ScryptParams; salt: Buffer; key: Buffer } | null => {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return null;
  const [N, r, p] = parts.slice(1, 4).map((part) => (/^\d+$/.test(part) ? Number(part) : NaN));
  if (!isPowerOfTwo(N) || N > LIMITS.maxN) return null;
  if (!(r >= 1 && r <= LIMITS.maxR) || !(p >= 1 && p <= LIMITS.maxP)) return null;
  const salt = Buffer.from(parts[4], 'base64');
  const key = Buffer.from(parts[5], 'base64');
  if (!salt.length || key.length < LIMITS.minKeyLength || key.length > LIMITS.maxKeyLength) {
    return null;
  }
  return { params: { N, r, p, keyLength: key.length }, salt, key };
};

const hasCurrentParams = (params: ScryptParams): boolean =>
  params.N === CURRENT.N &&
  params.r === CURRENT.r &&
  params.p === CURRENT.p &&
  params.keyLength === CURRENT.keyLength;

const REJECTED: PasswordCheck = { ok: false, needsRehash: false };

export const verifyPassword = async (plain: string, stored: string): Promise<PasswordCheck> => {
  if (stored.startsWith(LEGACY_BCRYPT_PREFIX)) {
    const ok = await bcrypt.compare(plain, stored);
    return { ok, needsRehash: true };
  }

  const parsed = parseScrypt(stored);
  if (!parsed) return REJECTED;
  try {
    const key = await deriveKey(plain, parsed.salt, parsed.params);
    const ok = crypto.timingSafeEqual(key, parsed.key);
    return { ok, needsRehash: !hasCurrentParams(parsed.params) };
  } catch {
    return REJECTED;
  }
};
