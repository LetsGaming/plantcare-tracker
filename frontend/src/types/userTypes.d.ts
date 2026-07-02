// ─────────────────────────────────────────────────────────────────────────────
// userTypes.d.ts
//
// Frontend types for the Auth/User domain.
//
// V2 API shapes (payloads shown unwrapped from the { data } envelope):
//   - POST /auth/login          → { accessToken: string } (+ refreshToken cookie)
//   - POST /auth/refresh-token  → { accessToken: string }
//   - POST /auth/register       → { id, username }
//   - POST /auth/ticket         → { ticket: string }
//   - PATCH /auth/me            → data: null (invalidates all sessions — re-login required)
//   - DELETE /auth/me           → 204 No Content
// ─────────────────────────────────────────────────────────────────────────────

/** Login request payload */
interface LoginData {
  username: string;
  password: string;
}

/** Registration request payload — same fields as login */
interface RegisterData extends LoginData {}

/** Response body for POST /auth/login and POST /auth/login/guest */
interface LoginResponse {
  accessToken: string;
}

/** Profile update payload for PATCH /auth/me */
interface EditProfile {
  username?: string;
  password?: string;
  passwordConfirmation?: string;
}

/** Roles supported by V2 — "guest" is read-only, "admin" has full access */
type UserRole = "admin" | "user" | "guest";

/** Decoded JWT payload — claims embedded in the access token */
interface AuthToken {
  id: number;
  username: string;
  role: UserRole;
}
