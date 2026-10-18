# Roadmap & Known Limitations

## Known Limitations

### In-Memory Ticket Store

Sessions are persisted in SQLite, but the one-time SSE `ticketStore` lives in process memory. Tickets live 60 seconds, so a restart costs at most a retried stream.

**Impact:** None for a single instance. A multi-instance deployment needs a shared ticket store (and a shared SQLite replacement for sessions).

**Fix:** Replace `ticketStore` in `src/core/auth/sessions.ts` behind the same `create` / `validateAndBurn` interface.

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

Playwright launches a full Chromium browser for 5 of the 9 scrapers. The concurrency limiter caps simultaneous Chromium sessions at 2, and the browser is closed after 10 idle minutes, but a running scrape still holds ~150–300 MB.

**Alternative:** Run Playwright in a separate microservice or sidecar container, expose it over HTTP, and call it from the main process. This decouples scraping memory from the API server.

---

## Potential Improvements

### Refresh Token Rotation

Currently, a refresh token is valid until it expires (7 days) or is explicitly invalidated. Rotating the refresh token on every use (issue a new one, invalidate the old one) limits the window of exposure if a token is leaked.

---

### Structured Logging to External Services

Winston is already configured. Adding a transport for a log aggregation service (Datadog, Loki, CloudWatch) is one additional transport in `logger.ts`.

---

### Image CDN Integration

Images are currently served directly from Node.js via `@fastify/static`. For better performance, store originals in object storage (S3, MinIO, Cloudflare R2) and serve via CDN. The images module already isolates file handling behind the `ImageStorage` port (`LocalImageStorage` today), an S3/R2 backend is a second adapter implementing the same interface; no use case or route changes required.

---

### E2E Test Suite

The contract suite already drives the whole app over HTTP against a real SQLite file. A browser-level E2E suite for the frontend against a running backend is still missing.

---

### Watering Summary Endpoint

The plant list shows when each plant was last watered, so the frontend loads the watering records of every
visible personal plant (three requests at a time, cached per account). A single read, for example
`GET /watering/summary` returning the last date and the average interval per plant, would replace that fan-out.

---

### Server-Side Sales Price History

Price history is built in the browser from the prices it sees on each load, so a new device starts empty.
Persisting a price point per sale on the server (written by the scrape that already runs) would give every
client the full history and make the price chart useful from the first visit.

---

### Reviewing Uncaptured Frontend States

The last design reviews did not capture the Sales stream loading state, the admin refresh failure banner,
component edit and delete as admin, and dark passes of the desktop modals. Add them to a browser test
suite (see the E2E item above) so they are checked on every change.

---

### OpenAPI / Swagger Spec

An OpenAPI 3 spec would enable automatic client SDK generation and interactive API documentation. Given the consistent request/response shapes in V2, generating it from Zod schemas using `zod-to-openapi` or `@anatine/zod-openapi` is feasible without duplication.

---

← [Deployment](./deployment.md) · [Back to index](./index.md)
