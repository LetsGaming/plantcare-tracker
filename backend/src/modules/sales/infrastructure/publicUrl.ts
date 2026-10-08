/**
 * modules/sales/infrastructure/publicUrl.ts
 *
 * Guards requests to URLs taken from scraped pages: only plain http(s) on the
 * default port to hosts that resolve exclusively to public addresses.
 */

import dns from 'node:dns';
import net from 'node:net';

const isPublicIPv4 = (address: string): boolean => {
  const [a, b, c] = address.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
};

const MAPPED_IPV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

const isPublicIPv6 = (address: string): boolean => {
  const mapped = address.match(MAPPED_IPV4);
  if (mapped) return isPublicIPv4(mapped[1]);

  const firstGroup = parseInt(address.split(':')[0] || '0', 16);
  // Only global unicast (2000::/3) is public; this excludes loopback, link-local and ULA.
  return firstGroup >= 0x2000 && firstGroup <= 0x3fff;
};

export const isPublicAddress = (address: string): boolean => {
  if (net.isIPv4(address)) return isPublicIPv4(address);
  if (net.isIPv6(address)) return isPublicIPv6(address);
  return false;
};

export type HostLookup = (host: string) => Promise<{ address: string }[]>;

const defaultLookup: HostLookup = (host) => dns.promises.lookup(host, { all: true });

export const isSafePublicUrl = async (
  rawUrl: string,
  lookup: HostLookup = defaultLookup,
): Promise<boolean> => {
  try {
    const url = new URL(rawUrl);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.port !== '') return false;

    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host);
    return addresses.length > 0 && addresses.every(({ address }) => isPublicAddress(address));
  } catch {
    return false;
  }
};
