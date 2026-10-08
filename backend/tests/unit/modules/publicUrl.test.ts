/**
 * tests/unit/modules/publicUrl.test.ts
 *
 * Address and URL checks guarding requests to scraped image URLs.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isPublicAddress,
  isSafePublicUrl,
  type HostLookup,
} from '../../../src/modules/sales/infrastructure/publicUrl';

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '0.0.0.0',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.5',
    'not-an-ip',
  ])('refuses %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['93.184.216.34', '172.32.0.1', '8.8.8.8', '2606:4700::1111', '::ffff:8.8.8.8'])(
    'accepts %s',
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
});

describe('isSafePublicUrl', () => {
  const lookupTo =
    (...addresses: string[]): HostLookup =>
    async () =>
      addresses.map((address) => ({ address }));

  it('accepts http and https hosts that resolve to public addresses', async () => {
    expect(await isSafePublicUrl('https://cdn.example/a.jpg', lookupTo('93.184.216.34'))).toBe(
      true,
    );
    expect(await isSafePublicUrl('http://cdn.example/a.jpg', lookupTo('93.184.216.34'))).toBe(true);
  });

  it('refuses a host when any resolved address is private', async () => {
    expect(
      await isSafePublicUrl('https://cdn.example/a.jpg', lookupTo('93.184.216.34', '10.0.0.1')),
    ).toBe(false);
  });

  it('refuses ip literals without a lookup', async () => {
    const lookup = vi.fn();
    expect(await isSafePublicUrl('http://169.254.169.254/latest', lookup)).toBe(false);
    expect(await isSafePublicUrl('http://[::1]/a.jpg', lookup)).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('refuses other schemes and non-default ports', async () => {
    const lookup = lookupTo('93.184.216.34');
    expect(await isSafePublicUrl('ftp://cdn.example/a.jpg', lookup)).toBe(false);
    expect(await isSafePublicUrl('https://cdn.example:8443/a.jpg', lookup)).toBe(false);
    expect(await isSafePublicUrl('http://cdn.example:22/a.jpg', lookup)).toBe(false);
  });

  it('refuses when resolution fails or returns nothing', async () => {
    expect(
      await isSafePublicUrl('https://cdn.example/a.jpg', async () => {
        throw new Error('ENOTFOUND');
      }),
    ).toBe(false);
    expect(await isSafePublicUrl('https://cdn.example/a.jpg', lookupTo())).toBe(false);
    expect(await isSafePublicUrl('not a url', lookupTo('93.184.216.34'))).toBe(false);
  });
});
