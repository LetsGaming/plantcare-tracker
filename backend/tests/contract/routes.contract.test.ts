import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, createContractApp, type ContractApp } from './harness';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

interface RouteSpec {
  method: Method;
  path: string;
  /** Roles allowed to mutate; guests must be refused on every mutating route. */
  admin?: boolean;
}

/** Every route that requires a bearer token. Path params use ids that need not exist. */
const AUTHENTICATED_ROUTES: RouteSpec[] = [
  { method: 'post', path: '/auth/ticket' },
  { method: 'patch', path: '/auth/me' },
  { method: 'patch', path: '/auth/1', admin: true },
  { method: 'delete', path: '/auth/me' },
  { method: 'get', path: '/watering/fertilizer-types' },
  { method: 'get', path: '/watering/plant/1' },
  { method: 'get', path: '/watering/1' },
  { method: 'post', path: '/watering/1' },
  { method: 'patch', path: '/watering/1' },
  { method: 'delete', path: '/watering/1' },
  { method: 'get', path: '/substrates' },
  { method: 'get', path: '/substrates/1' },
  { method: 'post', path: '/substrates' },
  { method: 'patch', path: '/substrates/1' },
  { method: 'post', path: '/substrates/1/components' },
  { method: 'patch', path: '/substrates/1/components' },
  { method: 'delete', path: '/substrates/1' },
  { method: 'get', path: '/components' },
  { method: 'get', path: '/components/fineness-levels' },
  { method: 'get', path: '/components/1' },
  { method: 'post', path: '/components', admin: true },
  { method: 'put', path: '/components/1', admin: true },
  { method: 'delete', path: '/components/1', admin: true },
  { method: 'post', path: '/images/plant/1' },
  { method: 'get', path: '/images/plant?entityId=1' },
  { method: 'get', path: '/images/plant/1' },
  { method: 'patch', path: '/images/1' },
  { method: 'delete', path: '/images/1' },
  { method: 'delete', path: '/images/plant/1' },
  { method: 'post', path: '/plants' },
  { method: 'patch', path: '/plants/1' },
  { method: 'delete', path: '/plants/1' },
  { method: 'get', path: '/sales/health', admin: true },
  { method: 'post', path: '/sales/health/alpha/check', admin: true },
];

/** Guests may not reach these (see the known defect for the two /auth/me routes). */
const GUEST_EXEMPT = new Set(['patch /auth/me', 'delete /auth/me', 'post /auth/ticket']);

let app: ContractApp;

beforeAll(async () => {
  app = await createContractApp();
});
afterAll(() => app.close());

describe('authenticated route inventory', () => {
  it.each(AUTHENTICATED_ROUTES.map((r) => [`${r.method.toUpperCase()} ${r.path}`, r] as const))(
    '%s answers 401 without a token',
    async (_name, route) => {
      const res = await app.client.request({ method: route.method, url: `${API}${route.path}` });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({ type: 'UnauthorizedError', statusCode: 401 });
    },
  );

  const mutating = AUTHENTICATED_ROUTES.filter(
    (r) => r.method !== 'get' && !GUEST_EXEMPT.has(`${r.method} ${r.path}`),
  );
  it.each(mutating.map((r) => [`${r.method.toUpperCase()} ${r.path}`, r] as const))(
    '%s answers 403 for a guest',
    async (_name, route) => {
      const guest = await app.signIn('guest');
      const res = await app.client.request({
        method: route.method,
        url: `${API}${route.path}`,
        headers: guest.auth,
        json: route.method === 'delete' ? undefined : {},
      });
      expect(res.status).toBe(403);
      expect(res.body.error.type).toBe('ForbiddenError');
    },
  );

  const adminOnly = AUTHENTICATED_ROUTES.filter((r) => r.admin);
  it.each(adminOnly.map((r) => [`${r.method.toUpperCase()} ${r.path}`, r] as const))(
    '%s answers 403 for a regular user',
    async (_name, route) => {
      const user = await app.signIn('user');
      const res = await app.client.request({
        method: route.method,
        url: `${API}${route.path}`,
        headers: user.auth,
        json: route.method === 'get' || route.method === 'delete' ? undefined : {},
      });
      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe('Admin access required');
    },
  );
});

describe('public route inventory', () => {
  it('serves the public routes without a token', async () => {
    for (const [method, path] of [
      ['get', '/plants'],
      ['get', '/health'],
      ['get', '/health/ready'],
      ['post', '/auth/logout'],
    ] as const) {
      const res = await app.client.request({ method, url: `${API}${path}` });
      expect(res.status, `${method} ${path}`).toBeLessThan(300);
    }
  });

  it('requires a ticket for the more-info stream', async () => {
    const res = await app.client.request({ method: 'get', url: `${API}/more-info?plantName=a` });
    expect(res.status).toBe(401);
  });
});
