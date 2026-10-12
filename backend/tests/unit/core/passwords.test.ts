import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from '../../../src/core/auth/passwords';

const scryptHash = (plain: string, N: number, keyLength = 64): string => {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(plain, salt, keyLength, { N, r: 8, p: 1 });
  return ['scrypt', N, 8, 1, salt.toString('base64'), key.toString('base64')].join('$');
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hashPassword', () => {
  it('stores scrypt parameters, a 16 byte salt and a 64 byte key', async () => {
    const parts = (await hashPassword('correct horse')).split('$');
    expect(parts.slice(0, 4)).toEqual(['scrypt', '16384', '8', '1']);
    expect(Buffer.from(parts[4], 'base64')).toHaveLength(16);
    expect(Buffer.from(parts[5], 'base64')).toHaveLength(64);
  });

  it('salts every hash differently', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('derives keys with the asynchronous scrypt only', async () => {
    const asyncSpy = vi.spyOn(crypto, 'scrypt');
    const syncSpy = vi.spyOn(crypto, 'scryptSync');
    const stored = await hashPassword('off the loop');
    await verifyPassword('off the loop', stored);
    expect(asyncSpy).toHaveBeenCalledTimes(2);
    expect(syncSpy).not.toHaveBeenCalled();
  });
});

describe('verifyPassword', () => {
  it('round trips a scrypt hash', async () => {
    const stored = await hashPassword('round trip');
    expect(await verifyPassword('round trip', stored)).toEqual({ ok: true, needsRehash: false });
    expect(await verifyPassword('round trip!', stored)).toEqual({
      ok: false,
      needsRehash: false,
    });
  });

  it('verifies a legacy bcrypt hash and asks for a rehash', async () => {
    const stored = await bcrypt.hash('legacy', 4);
    expect(await verifyPassword('legacy', stored)).toEqual({ ok: true, needsRehash: true });
    expect((await verifyPassword('wrong', stored)).ok).toBe(false);
  });

  it('asks for a rehash when the scrypt parameters differ', async () => {
    expect(await verifyPassword('older', scryptHash('older', 1024))).toEqual({
      ok: true,
      needsRehash: true,
    });
    expect(await verifyPassword('shorter', scryptHash('shorter', 16384, 32))).toEqual({
      ok: true,
      needsRehash: true,
    });
  });

  it('rejects a malformed legacy bcrypt hash instead of throwing', async () => {
    for (const stored of ['$2', '$2b$10$broken', '$2a$99$' + 'x'.repeat(53)]) {
      expect(await verifyPassword('x', stored), stored).toEqual({ ok: false, needsRehash: false });
    }
  });

  it('verifies a legacy hash of a password longer than 72 bytes by its prefix', async () => {
    const stored = await bcrypt.hash('a'.repeat(72), 4);
    expect(await verifyPassword('a'.repeat(80), stored)).toEqual({ ok: true, needsRehash: true });
  });

  it('rejects costly parameters without computing them', async () => {
    const spy = vi.spyOn(crypto, 'scrypt');
    const salt = crypto.randomBytes(16).toString('base64');
    const key = crypto.randomBytes(64).toString('base64');
    for (const [N, r, p] of [
      [2 ** 20, 2, 16],
      [2 ** 20, 1, 1],
      [2 ** 15, 8, 3],
      [16384, 8, 5],
    ]) {
      const stored = ['scrypt', N, r, p, salt, key].join('$');
      expect(await verifyPassword('x', stored), stored).toEqual({ ok: false, needsRehash: false });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('accepts parameters at the work cap', async () => {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync('edge', salt, 64, {
      N: 2 ** 15,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    const stored = ['scrypt', 2 ** 15, 8, 1, salt.toString('base64'), key.toString('base64')].join(
      '$',
    );
    expect(await verifyPassword('edge', stored)).toEqual({ ok: true, needsRehash: true });
  });

  it('rejects malformed and unknown hashes', async () => {
    const valid = await hashPassword('x');
    const [, , r, p, salt, key] = valid.split('$');
    for (const stored of [
      '',
      'plaintext',
      'scrypt$16384$8$1$onlyfive',
      `scrypt$1000$${r}$${p}$${salt}$${key}`,
      `scrypt$${2 ** 21}$${r}$${p}$${salt}$${key}`,
      `scrypt$16384$0$${p}$${salt}$${key}`,
      `scrypt$16384$${r}$${p}$${salt}$`,
      `argon2$16384$${r}$${p}$${salt}$${key}`,
    ]) {
      expect(await verifyPassword('x', stored), stored).toEqual({ ok: false, needsRehash: false });
    }
  });
});
