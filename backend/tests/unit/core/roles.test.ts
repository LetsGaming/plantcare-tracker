import { describe, expect, it } from 'vitest';
import { ROLE, isAdminRole, isGuestRole } from '../../../src/core/auth';

describe('role predicates', () => {
  it('matches the admin role case-insensitively', () => {
    expect(isAdminRole(ROLE.ADMIN)).toBe(true);
    expect(isAdminRole('Admin')).toBe(true);
    expect(isAdminRole(ROLE.USER)).toBe(false);
    expect(isAdminRole('')).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });

  it('matches the guest role case-insensitively', () => {
    expect(isGuestRole(ROLE.GUEST)).toBe(true);
    expect(isGuestRole('GUEST')).toBe(true);
    expect(isGuestRole(ROLE.ADMIN)).toBe(false);
    expect(isGuestRole(undefined)).toBe(false);
  });
});
