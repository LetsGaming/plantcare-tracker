/**
 * tests/helpers/mockFactory.ts
 *
 * Row factories for unit tests that stub a repository port.
 */

export const makeUserRow = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 2,
  username: 'testuser',
  password: '$2a$10$somehashedpassword',
  role: 'user',
  ...o,
});
