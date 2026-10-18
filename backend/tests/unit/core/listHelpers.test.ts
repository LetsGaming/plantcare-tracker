import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { CREATED_OR_NAME_SORTS, emptyPage } from '../../../src/core/pagination';
import { viewerOf } from '../../../src/core/middleware';

const requestOf = (user?: { id: number; role: string }) =>
  ({ user: user && { ...user, username: 'u' } }) as unknown as FastifyRequest;

describe('emptyPage', () => {
  it('reports a zero total on the first page', () => {
    expect(emptyPage(null)).toEqual({ items: [], nextCursor: null, total: 0 });
  });

  it('omits the total on later pages', () => {
    expect(emptyPage({ v: 1, id: 2 })).toEqual({ items: [], nextCursor: null });
  });
});

describe('viewerOf', () => {
  it('is null without a signed-in user', () => {
    expect(viewerOf(requestOf())).toBeNull();
  });

  it('flags guests case-insensitively', () => {
    expect(viewerOf(requestOf({ id: 0, role: 'Guest' }))).toEqual({ id: 0, isGuest: true });
    expect(viewerOf(requestOf({ id: 4, role: 'user' }))).toEqual({ id: 4, isGuest: false });
  });
});

describe('CREATED_OR_NAME_SORTS', () => {
  it('offers newest-first and alphabetical ordering', () => {
    expect(CREATED_OR_NAME_SORTS.created.direction).toBe('desc');
    expect(CREATED_OR_NAME_SORTS.name.direction).toBe('asc');
  });
});
