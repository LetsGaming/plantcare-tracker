# Roadmap & Known Limitations

## Known Limitations

### In-Memory Session Store

The `sessionStore` and `ticketStore` live in process memory. All active sessions are lost on server restart, forcing users to log in again.

**Impact:** Low for personal/hobby use. High for any multi-instance or frequently-restarted deployment.

**Fix:** Replace with Redis. The `CacheService` interface (`src/core/cache/CacheService.ts`) is already abstracted. Add a `RedisAdapter` that implements the same `get / set / delete / flush` methods and swap it in `server-v2.ts`.

---

### No Rate Limiting on Auth Endpoints

`POST /auth/register` and `POST /auth/login` have no rate limiting, making brute-force attacks straightforward.

**Fix:** Add `express-rate-limit` as middleware on these two routes:

```typescript
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', authLimiter, async (req, res, next) => { ... });
router.post('/register', authLimiter, async (req, res, next) => { ... });
```

---

### No Email Verification

Account registration immediately grants access. There is no verification step, no password reset flow, and no account recovery mechanism.

---

### Scraper Selector Fragility

The sales scraper selectors in `src/modules/sales/infrastructure/scrapers/index.ts` are CSS selectors tied to each shop's current HTML structure. Shops update their frontends periodically, which silently breaks scrapers (they return empty results rather than errors).

**Mitigation:** The `FetchSalesOverview` use case is resilient — a failing scraper is caught and logged, other scrapers continue. Add monitoring on the `sale_seller` distribution in SSE responses to detect when a specific shop stops producing results.

---

### Playwright Memory Usage

Playwright launches a full Chromium browser for 5 of the 9 scrapers. The concurrency limiter caps simultaneous Chromium sessions at 2, but the idle browser process still consumes ~150–300 MB.

**Alternative:** Run Playwright in a separate microservice or sidecar container, expose it over HTTP, and call it from the main process. This decouples scraping memory from the API server.

---

### No Request Body Size Limit

Express's `json()` middleware has no configured size limit. Large payloads are accepted.

**Fix:**

```typescript
app.use(express.json({ limit: '1mb' }));
```

---

## Potential Improvements

### Redis-Backed Sessions

Replace the in-memory session store with Redis for persistence across restarts and horizontal scaling. The `CacheService` abstraction is already in place — only `server-v2.ts` needs to change:

```typescript
// Replace:
const cache = new NodeCacheAdapter();

// With:
import { createClient } from 'redis';
const redis = createClient({ url: process.env.REDIS_URL });
const cache = new RedisCacheAdapter(redis);
```

---

### Refresh Token Rotation

Currently, a refresh token is valid until it expires (7 days) or is explicitly invalidated. Rotating the refresh token on every use (issue a new one, invalidate the old one) limits the window of exposure if a token is leaked.

---

### Structured Logging to External Services

Winston is already configured. Adding a transport for a log aggregation service (Datadog, Loki, CloudWatch) is one additional transport in `logger.ts`.

---

### Image CDN Integration

Images are currently served directly from Node.js via `express.static`. For better performance, store originals in object storage (S3, MinIO, Cloudflare R2) and serve via CDN. The `MySQLImageRepository` stores a URL string — switching storage backends only requires changing where `imageUrl` is written in `imageRoutes.ts`.

---

### E2E Test Suite

The current test suite covers unit and integration layers with a mocked database. A true E2E suite (Playwright or Supertest against a test MySQL container) would catch schema drift and migration issues. A Docker Compose file with a test database is the natural starting point.

```yaml
# docker-compose.test.yml
services:
  db-test:
    image: mysql:8
    environment:
      MYSQL_DATABASE: plantcare_test
      MYSQL_ROOT_PASSWORD: test
    ports:
      - "3307:3306"
```

---

### OpenAPI / Swagger Spec

An OpenAPI 3 spec would enable automatic client SDK generation and interactive API documentation. Given the consistent request/response shapes in V2, generating it from Zod schemas using `zod-to-openapi` or `@anatine/zod-openapi` is feasible without duplication.

---

← [Migration from V1](./migration.md) · [Back to index](./index.md)
