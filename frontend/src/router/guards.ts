export type AccessDecision = "allow" | "login" | "home";

export interface RouteAccessMeta {
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
}

export interface AccessChecks {
  isAuthenticated(): Promise<boolean>;
  isAdmin(): Promise<boolean>;
}

/**
 * Decides whether a navigation may proceed. Admin routes send signed-in
 * non-admins home instead of to the login page, since logging in again
 * would not change the outcome.
 */
export const resolveAccess = async (
  meta: RouteAccessMeta,
  checks: AccessChecks,
): Promise<AccessDecision> => {
  if (!meta.requiresAuth && !meta.requiresAdmin) return "allow";
  if (!(await checks.isAuthenticated())) return "login";
  if (meta.requiresAdmin && !(await checks.isAdmin())) return "home";
  return "allow";
};
