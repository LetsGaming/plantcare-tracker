/**
 * core/config/constants.ts
 *
 * Cross-cutting configuration values that were previously inlined as
 * magic numbers and strings across the codebase. Module-specific
 * constants (image processing sizes, AI cache keys, etc.) live inside
 * their module — this file only holds values shared by more than one
 * layer or module.
 *
 * Error status codes intentionally do NOT live here: each AppError
 * subclass owns its own HTTP status (see core/errors/AppError.ts).
 * HTTP_STATUS below covers success codes only, which controllers
 * assign directly.
 */

// ── HTTP success codes (error codes live in the AppError hierarchy) ──────────

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
} as const;

// ── Authentication & sessions ─────────────────────────────────────────────────

export const AUTH = {
  /** Maximum concurrent refresh-token sessions kept per user. */
  MAX_SESSIONS_PER_USER: 3,
  /** Lifetime of a one-time SSE ticket. */
  SSE_TICKET_TTL_MS: 60_000,
  /** bcrypt cost factor for password hashing. */
  BCRYPT_SALT_ROUNDS: 10,
  /** Cookie names used on the wire — shared with the frontend contract. */
  REFRESH_TOKEN_COOKIE: 'refreshToken',
  ACCESS_TOKEN_COOKIE: 'accessToken',
  /** Refresh cookie lifetime for a full login (mirrors JWT_REFRESH_EXPIRATION default). */
  REFRESH_COOKIE_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  /** Guest sessions are short-lived by design. */
  GUEST_REFRESH_COOKIE_MAX_AGE_MS: 60 * 60 * 1000,
} as const;

export const AUTH_RATE_LIMIT = {
  WINDOW_MS: 15 * 60 * 1000,
  /** Requests per window from a single IP across all auth endpoints. */
  MAX_PER_IP: 50,
  /** Requests per window against a single account (email/username). */
  MAX_PER_ACCOUNT: 10,
} as const;

// ── Server-Sent Events ─────────────────────────────────────────────────────────

export const SSE = {
  /** Comment-line heartbeat interval keeping proxies from closing idle streams. */
  HEARTBEAT_INTERVAL_MS: 20_000,
  /** Upper bound for a single data frame before batches are split. */
  MAX_CHUNK_BYTES: 16_384,
  /** Named events of the shared stream lifecycle (see core/sse). */
  EVENT: {
    DONE: 'done',
    ERROR: 'error',
  },
} as const;
