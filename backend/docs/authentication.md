# Authentication

## Overview

Authentication is JWT-based with an in-memory session store. Two token types are used:

- **Access token** — short-lived (15 min), sent in `Authorization` header or `accessToken` cookie
- **Refresh token** — long-lived (7 days), stored in an `httpOnly` cookie and validated against the session store

## Login Flow

```
Client                          Server
  │                               │
  │  POST /auth/login             │
  │  { username, password }  ───► │  1. Validate credentials (bcrypt)
  │                               │  2. Generate access + refresh tokens
  │                               │  3. Save refresh token to session store
  │  { accessToken }         ◄─── │  4. Set refreshToken cookie (httpOnly)
  │                               │
  │  GET /plants                  │
  │  Authorization: Bearer ...──► │  5. Verify JWT signature
  │                               │  6. Check session store (token still valid?)
  │  { data: [...] }         ◄─── │
  │                               │
  │  POST /auth/refresh-token     │
  │  (cookie: refreshToken)  ───► │  7. Find user in session store
  │                               │  8. Verify refresh token signature
  │  { accessToken }         ◄─── │  9. Issue new access token
  │                               │
  │  POST /auth/logout            │
  │  (cookie: refreshToken)  ───► │ 10. Remove from session store
  │                               │     Clear cookie
```

## Token Delivery

Access tokens can be sent two ways — the middleware checks both:

```
Authorization: Bearer <accessToken>
```
```
Cookie: accessToken=<accessToken>
```

The refresh token is always delivered via cookie:
```
Cookie: refreshToken=<refreshToken>; HttpOnly; SameSite=Strict; Path=/api/v2/auth/refresh-token
```

The `path` restriction means the refresh token cookie is **only sent** to the `/refresh-token` endpoint, not to every API call.

## Guest Access

Guest users can read all public data but cannot create, modify, or delete anything.

```
POST /auth/login/guest
  → Returns { accessToken } (1h expiry)
  → Sets refreshToken cookie (no path restriction, 1h expiry)
```

The `checkGuestPermission` middleware blocks non-GET methods for the `guest` role.

## SSE Ticket Authentication

`EventSource` does not support custom headers, so SSE endpoints (`/sales`, `/more-info`) use one-time tickets:

```
1. POST /auth/request-ticket   (requires valid JWT)
   → { ticket: "a3f9b2..." }

2. GET /sales?ticket=a3f9b2...
   → Ticket validated and burned immediately
   → SSE stream begins
```

Tickets:
- Expire after **60 seconds**
- Are **single-use** (burned on first use, even if invalid)
- Are generated with `crypto.randomBytes(32)`

Use `makeAuthenticateSSE(pool)` for SSE routes that need full user data (role, username). Use `authenticateSSE` for routes that only need the user ID.

## Roles

| Role | Code | Permissions |
|------|------|-------------|
| Admin | `admin` | Full access, including component CRUD |
| User | `user` | CRUD on own plants, substrates, watering records |
| Guest | `guest` | GET only on public data |

The `isAdmin` middleware checks `req.user.role === 'admin'` (case-insensitive).

## Session Store

Sessions are stored in a `Map<userId, refreshToken[]>` in memory.

- **Max sessions per user:** 3. When exceeded, the oldest token is evicted (FIFO).
- **No persistence:** sessions are lost on server restart.
- **Invalidation:** `POST /logout` removes the specific token. `UpdateProfileUseCase` removes **all** sessions for the user after a password change.

> ⚠️ **Production recommendation:** Replace the in-memory store with Redis. The `sessionStore` interface (save, get, findUser, invalidate, deleteAll) makes this straightforward — update only `core/middleware/auth.ts`.

## Middleware Reference

All middleware lives in `src-v2/core/middleware/auth.ts`.

### `authenticateToken`

Validates the access token (header or cookie) and checks the session store. Sets `req.user` on success.

```typescript
router.get('/protected', authenticateToken, handler);
```

### `optionalAuth`

Like `authenticateToken`, but never blocks the request. `req.user` is set if a valid token is present, `undefined` otherwise. Used for `GET /plants` so public plants are visible without login.

```typescript
router.get('/', optionalAuth, handler);
```

### `isAdmin`

Requires `req.user.role === 'admin'`. Must be placed after `authenticateToken`.

```typescript
router.post('/admin', authenticateToken, isAdmin, handler);
```

### `checkGuestPermission`

Blocks non-GET requests from the `guest` role.

```typescript
router.post('/', authenticateToken, checkGuestPermission, handler);
```

### `makeAuthenticateSSE(pool)`

For SSE endpoints. Validates ticket, burns it, then performs a DB lookup to populate `req.user` with full user data (username, role).

```typescript
const authenticateSSE = makeAuthenticateSSE(pool);
router.get('/', authenticateSSE, sseHandler);
```

### `authenticateSSE`

Fallback version without DB lookup — sets `req.user` with only `{ id, username: '', role: 'user' }`. Only use when user details beyond ID are not needed.

---

← [Database](./database.md) · **Next:** [API Reference](./api-reference.md)
