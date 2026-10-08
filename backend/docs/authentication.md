# Authentication

## Overview

Authentication is JWT-based with an in-memory session store. Every login creates a session with a random id (`sid`). Two token types carry it:

- **Access token**: short-lived (15 min), sent in the `Authorization` header only
- **Refresh token**: long-lived (7 days), stored in an `httpOnly` cookie

Both tokens embed the `sid`. The access token is only accepted while its session is alive, so logout, password changes and eviction end it immediately. Tokens are signed and verified with HS256 only.

## Login Flow

```
Client                          Server
  │                               │
  │  POST /auth/login             │
  │  { username, password }  ───► │  1. Validate credentials (bcrypt)
  │                               │  2. Generate access + refresh tokens
  │                               │  3. Create a session (sid) in the session store
  │  { accessToken }         ◄─── │  4. Set refreshToken cookie (httpOnly)
  │                               │
  │  GET /plants                  │
  │  Authorization: Bearer ...──► │  5. Verify JWT signature
  │                               │  6. Check the session is alive (401 otherwise)
  │  { data: [...] }         ◄─── │
  │                               │
  │  POST /auth/refresh-token     │
  │  (cookie: refreshToken)  ───► │  7. Verify refresh token signature
  │                               │  8. Check its session is alive (401 otherwise)
  │  { accessToken }         ◄─── │  9. Issue new access token, same session
  │                               │
  │  POST /auth/logout            │
  │  (cookie: refreshToken)  ───► │ 10. End that session only
  │                               │     Clear cookie
```

## Token Delivery

Access tokens are sent in the `Authorization` header. A token in an `accessToken` cookie is ignored.

```
Authorization: Bearer <accessToken>
```

The refresh token is always delivered via cookie:
```
Cookie: refreshToken=<refreshToken>; HttpOnly; SameSite=Strict; Path=/api/v2/auth
```

The `path` restriction scopes the cookie to the auth module: it is sent to
`/refresh-token` (to mint new access tokens) and to `/logout` (so the session
can be invalidated server-side), but never to regular API calls outside
`/auth`. Logout also clears the cookie on the paths used by earlier releases
(`/api/v2/auth/refresh-token` and `/`), so sessions created before an upgrade
can still sign out cleanly.

## Guest Access

Guest users can read all public data but cannot create, modify, or delete anything.

```
POST /auth/login/guest
  → Returns { accessToken } (1h expiry)
  → Sets refreshToken cookie (same /auth path scope as a regular login, 1h expiry)
```

All guests share one account but each guest login gets its own session, so concurrent guests do not end each other's sessions (up to `AUTH.MAX_GUEST_SESSIONS`). The `guestReadOnly` middleware is mounted once before the routers and answers `403` to any non-GET, non-HEAD, non-OPTIONS request from a guest with a live session, except the session endpoints. The shared guest account cannot be edited or deleted through the profile or admin routes.

## SSE Ticket Authentication

`EventSource` does not support custom headers, so both SSE endpoints (`/sales`, `/more-info`) use one-time tickets. Guests may request tickets:

```
1. POST /auth/ticket           (requires valid JWT)
   → { ticket: "a3f9b2..." }

2. GET /sales?ticket=a3f9b2...
   → Ticket validated and burned immediately
   → SSE stream begins
```

Tickets:
- Expire after **60 seconds**
- Are **single-use** (burned on first use, even if invalid)
- Are generated with `crypto.randomBytes(32)`

A bad, used or expired ticket answers `401`. Ticket creation and the AI stream are rate limited per user (`USER_RATE_LIMIT`). SSE routes use `makeAuthenticateSSE({ loadUserFromDb })`. See the middleware reference below. Ticket TTL and the session limit live in `core/config` (`AUTH.SSE_TICKET_TTL_MS`, `AUTH.MAX_SESSIONS_PER_USER`).

## Roles

| Role | Code | Permissions |
|------|------|-------------|
| Admin | `admin` | Full access, including component CRUD |
| User | `user` | CRUD on own plants, substrates, watering records |
| Guest | `guest` | GET only |

The `isAdmin` middleware checks `req.user.role === 'admin'` (case-insensitive). The guest restriction is enforced once by `guestReadOnly`, before any router, so new mutating routes are covered by default.

## Session Store

Sessions are stored in a `Map<userId, Session[]>` in memory, where a session is `{ sid, expiresAt }`.

- **Max sessions per user:** 3. When exceeded, the oldest session is evicted (FIFO). The guest account uses a larger limit and a 1 h lifetime.
- **No persistence:** sessions are lost on server restart.
- **Invalidation:** `POST /logout` ends the session named by the refresh token, including its access token. `UpdateProfileUseCase` removes **all** sessions for the user after a password change.

> ⚠️ **Production recommendation:** Replace the in-memory store with Redis. The `sessionStore` interface (create, has, count, end, deleteAll) makes this straightforward; update only `core/auth/sessions.ts`.

## Middleware Reference

The Fastify hooks live in `src/core/middleware/auth.ts`; tokens and stores live in `src/core/auth/`.

### `authenticateToken`

Validates the bearer access token and checks that its session is alive. Answers `401` otherwise. Sets `req.user` on success.

```typescript
router.get('/protected', authenticateToken, handler);
```

### `optionalAuthenticateToken`

Like `authenticateToken`, but never blocks the request. `req.user` is set if a valid token is present, `undefined` otherwise. Used for `GET /plants` so public plants are visible without login.

```typescript
router.get('/', optionalAuthenticateToken, handler);
```

### `isAdmin`

Requires `req.user.role === 'admin'`. Must be placed after `authenticateToken`.

```typescript
router.post('/admin', authenticateToken, isAdmin, handler);
```

### `makeGuestReadOnly`

Global hook. Blocks unsafe methods from a live `guest` session with `403`. Registered in `buildApp` as an `onRequest` hook before the routes.

```typescript
app.addHook("onRequest", makeGuestReadOnly(apiBase));
```

### `makeAuthenticateSSE(options)`

The single SSE authenticator (the former standalone `authenticateSSE` variant is merged into it). Validates the one-time ticket and burns it, then populates `req.user`:

- `makeAuthenticateSSE()` — no DB lookup; `req.user` carries only `{ id, username: '', role: 'user' }`. Used by sales.
  User id `0` is a valid identity.
- `makeAuthenticateSSE({ loadUserFromDb: true })` — additionally loads username and role from the database. Used by moreInfo.

```typescript
router.get('/', makeAuthenticateSSE({ loadUserFromDb: true }), sseHandler);
```

---

← [Database](./database.md) · **Next:** [API Reference](./api-reference.md)
