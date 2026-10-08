import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const load = async (env: Record<string, string | undefined>) => {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, '');
    else vi.stubEnv(key, value);
  }
  const uploads = await import('../../../src/core/config/uploads');
  const logging = await import('../../../src/core/logging/logger');
  return { ...uploads, requestContext: logging.requestContext };
};

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

describe('toStoredImagePath', () => {
  it('builds the origin-free path under the uploads route', async () => {
    const { toStoredImagePath } = await load({});
    expect(toStoredImagePath('plant', 'a.webp')).toBe('/uploads/plant/a.webp');
  });
});

describe('toPublicImageUrl', () => {
  it('prefers PUBLIC_BASE_URL and trims a trailing slash', async () => {
    const { toPublicImageUrl, requestContext } = await load({
      PUBLIC_BASE_URL: 'https://api.example.com/',
    });
    const url = requestContext.run({ requestId: 'r', origin: 'http://internal:5000' }, () =>
      toPublicImageUrl('/uploads/plant/a.webp'),
    );
    expect(url).toBe('https://api.example.com/uploads/plant/a.webp');
  });

  it('falls back to the origin of the current request', async () => {
    const { toPublicImageUrl, requestContext } = await load({ PUBLIC_BASE_URL: undefined });
    const url = requestContext.run({ requestId: 'r', origin: 'https://seen.example' }, () =>
      toPublicImageUrl('/uploads/plant/a.webp'),
    );
    expect(url).toBe('https://seen.example/uploads/plant/a.webp');
  });

  it('uses the local server address outside a request', async () => {
    const { toPublicImageUrl } = await load({ PUBLIC_BASE_URL: undefined, PORT: '5000' });
    expect(toPublicImageUrl('/uploads/plant/a.webp')).toBe(
      'http://localhost:5000/uploads/plant/a.webp',
    );
  });

  it('passes absolute urls through and tolerates a missing leading slash', async () => {
    const { toPublicImageUrl } = await load({ PUBLIC_BASE_URL: 'https://api.example.com' });
    expect(toPublicImageUrl('https://cdn.example/x.webp')).toBe('https://cdn.example/x.webp');
    expect(toPublicImageUrl('uploads/plant/a.webp')).toBe(
      'https://api.example.com/uploads/plant/a.webp',
    );
  });
});
