# Roadmap & Known Limitations

## Known Limitations

### In-Memory Session Store

The `sessionStore` and `ticketStore` live in process memory. All active sessions are lost on server restart, forcing users to log in again.

**Impact:** Low for personal/hobby use. High for any multi-instance or frequently-restarted deployment.

**Fix:** Replace the stores in `src/core/auth/sessions.ts` with a persistent implementation (Redis or a SQLite table) behind the same `sessionStore` / `ticketStore` interface (`create`, `has`, `count`, `end`, `deleteAll`; `create`, `validateAndBurn`). Nothing else depends on how sessions are stored.

---

### No Email Verification

Account registration immediately grants access. There is no verification step, no password reset flow, and no account recovery mechanism.

---

### Scraper Selector Fragility

The sales scraper selectors in `src/modules/sales/infrastructure/scrapers/index.ts` are CSS selectors tied to each shop's current HTML structure. Shops update their frontends periodically, which breaks selector based extraction.

**Mitigation:** Scrapers now try several extraction strategies (Shopify JSON feed, selectors, structured data, layout heuristics) and fall back automatically, and every source reports its health to `scrape_source_health`, which admins can inspect in the app (Profile, Admin tools, Scraper status). See the architecture document. A shop that is not on Shopify still depends on its selectors with only the structured data and heuristic fallbacks behind them, so Palmenmann and PLNTS are the most exposed.

**Remaining gap:** an HTML strategy that returns nothing on page 1 is reported as failing even if the shop simply has no sale items at that moment. Zero results of the plant link HTML search are deliberately not reported, so a broken search selector shows up only as a stale status.

---

### Playwright Memory Usage

Playwright launches a full Chromium browser for 5 of the 9 scrapers. The concurrency limiter caps simultaneous Chromium sessions at 2, but the idle browser process still consumes ~150–300 MB.

**Alternative:** Run Playwright in a separate microservice or sidecar container, expose it over HTTP, and call it from the main process. This decouples scraping memory from the API server.

---

## Potential Improvements

### Redis-Backed Sessions

Replace the in-memory session store with a persistent one for survival across restarts and horizontal scaling. Only `src/core/auth/sessions.ts` changes; the `AUTH` limits in `core/config` stay the source of truth for session counts and lifetimes.

---

### Refresh Token Rotation

Currently, a refresh token is valid until it expires (7 days) or is explicitly invalidated. Rotating the refresh token on every use (issue a new one, invalidate the old one) limits the window of exposure if a token is leaked.

---

### Structured Logging to External Services

Winston is already configured. Adding a transport for a log aggregation service (Datadog, Loki, CloudWatch) is one additional transport in `logger.ts`.

---

### Image CDN Integration

Images are currently served directly from Node.js via `@fastify/static`. For better performance, store originals in object storage (S3, MinIO, Cloudflare R2) and serve via CDN. The images module already isolates file handling behind the `ImageStorage` port (`LocalImageStorage` today) — an S3/R2 backend is a second adapter implementing the same interface; no use case or route changes required.

---

### E2E Test Suite

The contract suite already drives the whole app over HTTP against a real SQLite file. A browser-level E2E suite for the frontend against a running backend is still missing.

---

### OpenAPI / Swagger Spec

An OpenAPI 3 spec would enable automatic client SDK generation and interactive API documentation. Given the consistent request/response shapes in V2, generating it from Zod schemas using `zod-to-openapi` or `@anatine/zod-openapi` is feasible without duplication.

---

← [Deployment](./deployment.md) · [Back to index](./index.md)
