# PlantCare Tracker performance audit

Audit only. No application code was changed. Date: 2026-10-11. Baseline: `main` at `f11430d`.

Evidence labels: **Confirmed** = traced in code (file:line) and/or measured. **Suspected** = pattern-based, not measured. Sections 1 to 4, 6 and 7 are the synthesis. The complete per-finding write-ups (evidence, root cause, fix, layers, impact, effort, dependencies) are in section 5 and the appendices A to D, one per area, with finding IDs `SALES-n`, `IMG-n`, `FE-n`, `BE-n`, `DB-n`.

---

## 1. Executive summary

Ranked by impact on a real user, not by effort.

1. **Sales scraping runs inside the user request (SALES-1, BE-4, Critical).** The Sales list is not read from the database like every other list. `GET /sales` is a server-sent-event stream that fans out 31 live page fetches across 14 third-party shops (up to 8 parallel, Chromium for two shops, 15 s timeouts with retries). The only cache is an in-process 24 h TTL map that is empty after every restart and does not deduplicate concurrent work. Nothing is persisted, so there is no server-side price history or NEW flag. This is why Sales is slower than every other list: its latency is bounded by the slowest external website, the others by one indexed SQLite query. The root fix is a scheduled refresher that persists items and price points, so the endpoint becomes an indexed read.
2. **The image "progressive loading" is fake and doubles the traffic (IMG-1, IMG-2, SALES-3, Critical).** `ProgressiveImage.vue:88-116` requests `url?size=128` first, then `url`. `/uploads/*` is plain `@fastify/static` (`backend/src/app.ts:109`) and ignores the query, so each photo is downloaded twice at full size under two cache keys. Both `new Image()` loaders start the moment a card mounts, whether it is on screen or not, so lazy loading does not exist and images appear in random network-completion order. Sale images are hotlinked originals from shop CDNs with the same treatment (IMG-11).
3. **No placeholder, dimensions or decode control for photos (IMG-3 to IMG-6, High).** The DB and API carry no width, height, aspect ratio, blurhash or dominant colour. The placeholder is removed before the image can be shown, `ion-img` adds a blank frame, and a blur filter transition runs on a full-size image. This is the visible "pop-in" and flash.
4. **N+1 on the plant list (BE-1, FE-2, High, measured).** Opening Plants issues `GET /plants` and then one `GET /watering/plant/:id` per plant (13 requests for 13 plants in the seeded data, 3 at a time) just to compute the "due" state. Each response re-sorts the whole list. The fix is to return `lastWateredAt` and `lastFertilizedAt` on the list query.
5. **Slow first paint on mobile (FE-1, FE-3, FE-4, High).** Measured on the production build with 4x CPU throttling and Fast 4G: first contentful paint 3.36 s. The boot is a serial chain (IndexedDB, auth, refresh-token round trip, route chunk, locale chunk). `vendor-ionic` is one 1.27 MB eager chunk (289 KB gzip) and the Chart.js chunk (201 KB, 69 KB gzip) is modulepreloaded on every page including login although charts only appear on a detail route.
6. **Sales stream does quadratic UI work (SALES-4, High).** Every 16 KB SSE frame re-sorts and re-renders the whole list and builds `Intl.NumberFormat` objects per item. Measured: 3 long tasks totalling 942 ms (longest 627 ms) while 36 items streamed in under 4x CPU throttling.
7. **Photos are stored sideways and oversized (IMG-7, High).** No `.rotate()` on upload (phone photos are stored in sensor orientation), `nearLossless` WebP inflates files, no AVIF, no variants (160/480/1024), so every consumer downloads the same large file.
8. **Caching and compression are missing in the app server (IMG-8, BE-5, High/Medium).** Measured: `/api/v2/plants` returns no `content-encoding`, no `etag`, no `cache-control`. `@fastify/static` sends `max-age=0`, so every upload revalidates on every view outside the Docker/nginx path. Behind nginx the situation is better (gzip, immutable hashed assets) but there is no brotli and the headers can double up (BE-9, FE-9).
9. **Indexes do not match the queries and lists are unbounded (DB-1, DB-2, BE-2, High/Medium).** Measured with `EXPLAIN QUERY PLAN`: `plants WHERE user_id=?` is a full `SCAN` plus a temp B-tree sort, `substrates` and `substrate_components(component_id)` and `plants(substrate_id)` are full scans. Data is tiny today so latency is invisible, but the plan is O(n) and every list returns every image of every item.
10. **Smaller but real:** bcryptjs on the main thread (BE-7), Winston logs without rotation and every 4xx at warn (BE-10), no container memory limits while Chromium, ONNX and sharp share one process (BE-12), whole-collection persistence on every mutation (FE-10), AI care guide quadratic markdown render (FE-7).

What the refactor got right (do not touch): lazy route chunks, lazy locale loading, tree-shaken Ionic and icon imports, WAL and sane pragmas, no per-request DB lookup for auth, no `SELECT *`, nginx immutable caching for hashed assets, multi-stage non-root Dockerfile. See section 7.

---

## 2. Stack and architecture summary (Phase 1)

| Layer | Facts |
|---|---|
| Monorepo | `backend` and `frontend`, each with its own `pnpm` lockfile; `scripts/dev-up.mjs` isolated dev stacks |
| Frontend | Ionic Vue (Options API enforced by a test), Vue 3, Pinia (8 entity stores), `vue-router` with hash history and lazy route components, Vite with Rolldown (`rolldownOptions`), `vite-plugin-pwa` generateSW, Chart.js via `vue-chartjs`, Luxon, `LocalizationService` with lazy locale chunks, IndexedDB-backed `StorageService` |
| Rendering mode | Pure client-side SPA. Data is fetched on mount or on Ionic view enter from the stores. No SSR/SSG |
| Backend | Fastify 5, Kysely over better-sqlite3 (SQLite WAL), layered modules (`presentation`, `application`, `domain`, `infrastructure`), SSE helper in `core/sse`, `NodeCacheAdapter` (node-cache), Winston logging, sharp for image processing, ONNX recognition model, Chromium (Puppeteer-style) for two scrapers, bcryptjs, JWT access token plus refresh cookie |
| Images | Stored on disk under the uploads dir, DB table `images(entity_type, entity_id, image_url, upload_date)`, served by `@fastify/static` at `/uploads/*`. A resize route `/api/v1/images/:type/:id?size=` exists but the client never calls it. Sale images are hotlinked third-party URLs |
| Deployment | `docker-compose.yml`: `frontend` (nginx serving the build, proxy `/api` and `/uploads` to `backend:5000`), `backend` (multi-stage non-root image). Fallback `frontend/serve.js` for non-Docker. TLS terminates in front |
| Build | `vue-tsc && vite build`, manual chunk groups `vendor-ionic`, `vendor-charts`, `vendor-luxon`, `vendor-vue` in `frontend/vite.config.ts:36-50` |

### Routes and the API each one calls

Route table lives in appendix B ("Route and view API map"). Condensed:

| View | Calls |
|---|---|
| Plants list | `GET /plants`, then `GET /watering/plant/:id` x N (N+1), `GET /substrates` for detail |
| Substrates list | `GET /substrates` (joins components and images), `GET /components` |
| Components list | `GET /components` |
| Sales list | `POST /auth/ticket`, `GET /sales?ticket=` (SSE); no DB read |
| Sales detail | local store only, lazy Chart.js chunk |
| Water round | `GET /plants` plus per-plant watering history, `POST /watering/batch`, `POST /recognition/match` |
| Plant detail | `GET /plants/:id`, watering history, more-info care guide (SSE, auto start when cache older than 24 h) |
| Admin | `GET /sales/health`, `POST /sales/health/:key/check` |
| Boot | IndexedDB token read, `POST /auth/refresh-token` |

### Where images come from

User photos: multipart upload, sharp re-encode to WebP, stored in the uploads dir, URL written to `images`. Sale photos: URL strings scraped from shops (optimizer-proxy URLs are unwrapped to the largest source in `scrapeHelpers.ts:63-103`), never stored or proxied. Plant fallback art: `PlantPlaceholder` SVG components (generated, no network).

---

## 3. Baseline metrics (Phase 2)

Environment for everything below: Windows 11, Node 24.14.1, seeded dev stack (`dev-up --id perf-audit`, mocked shops that answer instantly), Microsoft Edge via DevTools protocol, **mobile profile 390x844 at DPR 3, 4x CPU slowdown, Fast 4G**, production build served by a small Node server that emulates `frontend/nginx.conf` (gzip, immutable `/assets`, no-cache shell). Docker and nginx are not installed here, so brotli, HTTP/2 and the real proxy path were not measured.

### 3.1 Build and bundle (`pnpm run build`, measured)

| Item | Raw | Gzip |
|---|---|---|
| `vendor-ionic` JS | 1,274 kB | 289 kB |
| `vendor-charts` JS | 201 kB | 69 kB |
| `vendor-luxon` JS | 70 kB | 22 kB |
| `index` (entry) JS | 97 kB | 30 kB |
| `vendor-vue` JS | 15 kB | 6.5 kB |
| `PlantDetails` chunk | 42 kB | 13 kB |
| Locale chunks `en` / `de` | 32 kB / 35 kB | 8.7 kB / 9.7 kB |
| `vendor-ionic` CSS | 48 kB | 7.3 kB |
| `index` CSS | 24 kB | 5.8 kB |
| PWA precache | 86 entries, 2,624 KiB | |
| Modulepreloaded at boot (`dist/index.html`) | ionic, vue, **charts**, icons, LocalizationService, IconButton, useMountWhileOpen, fieldShared, formState, luxon | |
| JS actually transferred by the plants route load (24 files, gzip) | 531 kB | |

Chunk size warning from the bundler: `vendor-ionic` exceeds 500 kB.

### 3.2 Page load, plants route (production build, throttled, measured once; repeat for statistics)

| Metric | Value |
|---|---|
| First contentful paint | 3,356 ms |
| `load` event | 1,231 ms (document ready long before first paint: the app mounts late) |
| `POST /auth/refresh-token` | starts at 1,334 ms, 196 ms |
| `GET /plants` | starts at 3,317 ms (about 1.8 s gap after refresh: chunk parse and hydrate) |
| `GET /watering/plant/:id` | 13 requests, 3 in parallel, starting at 3,868 ms and ending about 5,080 ms |
| Upload image requests on the plants list | 11 for 13 plants (each with `?size=128` and the full URL, see IMG-1) |
| CLS | not captured. The one DevTools trace I took ran against a broken emulation server (blank page) and is discarded |

Not measured here (tooling gap): LCP, TBT, INP, a full Lighthouse performance score. The available Lighthouse tool excludes the performance category. Procedure to run: build, serve behind the real nginx, sign in, then `npx lighthouse http://HOST/#/tabs/plants --only-categories=performance --form-factor=mobile --screenEmulation.mobile --throttling-method=simulate --extra-headers` with an `Authorization` token placed in localStorage key `CapacitorStorage.authToken` through a puppeteer pre-script, or use the Chrome DevTools Performance panel with the same throttling and record from tab click to last image.

### 3.3 API (seed data, local loopback, measured 3 runs each)

| Endpoint | TTFB | Payload | Headers |
|---|---|---|---|
| `GET /plants` | 2.5 to 4 ms | 5,917 B (17 plants) | no `content-encoding`, no `etag`, no `cache-control` |
| `GET /substrates` | 2.3 to 2.9 ms | 3,441 B | same |
| `GET /components` | 2.1 to 2.3 ms | 1,489 B | same |
| `GET /watering/plant/:id` | about 1 ms each | small | called 13 times per plants view |
| `POST /auth/ticket` + `GET /sales` (SSE, mock shops) | 3 to 5 ms to first frame | 36 items, 5 frames, 22.7 kB, about 630 B per item | stream |
| 401 body on SSE route | | includes a stack trace string | see BE finding on error serialization |

Caveat: the dev stack mocks the scrapers, so the real Sales latency (seconds to tens of seconds on a cold cache) cannot be reproduced locally. Procedure: run the production backend with an empty cache, `time` the ticket and SSE open, log time to first frame, time to `done`, and the count of upstream requests (`LOG_LEVEL=debug`). Repeat twice (cold, warm) and once right after a restart. SALES-1 derives the worst case from code constants (31 page jobs, 8-way concurrency, 15 s timeout, 2 retries with 0/2/4 s backoff).

### 3.4 Database (`EXPLAIN QUERY PLAN` on the seeded dev DB, read-only)

Rows: plants 17, images 17, watering_records 99, substrates 7. Wall times are meaningless at this size, the plans are the baseline.

| Query | Plan |
|---|---|
| plants by `user_id` (list, own) | `SCAN p` + `SEARCH img USING idx_images_lookup` + `USE TEMP B-TREE FOR ORDER BY` |
| plants public | `SEARCH p USING idx_plants_list (is_public=?)` + temp B-tree for ORDER BY |
| watering history by plant | `SEARCH USING idx_watering_history (plant_id=?)` (no LIMIT in the handler) |
| substrates by `user_id` | `SCAN substrates` + temp B-tree |
| `substrate_components` by `component_id` | `SCAN` |
| `plants` by `substrate_id` | `SCAN` |

### 3.5 Sales view in the browser (measured, throttled)

| Metric | Value |
|---|---|
| Tab click to first cards | 145 ms (19 cards from locally persisted data) |
| Tab click to 49 cards in DOM | 1,419 ms (a stream completed over the mock) |
| Long tasks during the stream | 3 tasks, 942 ms total, longest 627 ms |
| Requests | `POST /auth/ticket` 186 ms, then `GET /sales?ticket=` 198 ms to open (two serial round trips before any data) |
| Image requests | none in the mock (shop images are placeholders), so the double hotlink fetch of SALES-3 is traced in code, not measured |

### 3.6 Reproduction

```bash
node scripts/dev-up.mjs --id perf-audit                 # backend on a free port, seeded
(cd frontend && pnpm run build)                          # production bundle
node <scratchpad>/serve-prod.mjs                         # nginx emulation used above
node scripts/dev-down.mjs --id perf-audit
```

---

## 4. Root-cause analysis of the known symptoms

### 4.1 Why the Sales list appears slowly

Full trace (route to render) and the comparison table are in appendix A sections 1 and 2. Summary:

1. Router lazy-loads `SalesOverview` (fine). `mounted()` calls `store.load()`. If the persisted list is older than 24 h (6 h in dev) the store starts a stream.
2. `ApiUtils.stream` first does `POST /auth/ticket` (an extra round trip), then opens `EventSource /sales?ticket=`.
3. The server runs `FetchSalesOverview.execute`: 14 shops, 31 page jobs, limiter of 8 plain HTTP and 2 Chromium jobs. Every miss in the in-process cache is a live scrape with 15 s timeouts and retries. Page 1 of each shop additionally awaits image probes (HEAD then GET, 5 s each) and a health write before returning items (SALES-6).
4. Items are batched into 16 KB SSE frames. On the client each frame runs the conversion, price-point recording and (via the `items` replacement on `done`) the whole sort, filter and render pipeline (SALES-4, SALES-8).
5. The list renders unvirtualised, each card with two eager image loaders (SALES-3, IMG-2).

Why Plants, Substrates and Components differ: their data lives in the app's own SQLite and arrives in one `GET` (one RTT plus a few ms of SQL). Sales time-to-first-data is one RTT plus the ticket RTT plus the fastest external scrape, and time-to-complete is the slowest of 31 external fetches. After every server restart the cache is cold and the next visitor pays the full price, and two concurrent visitors both pay it because the cache stores results, not in-flight work (SALES-2).

Root cause in one sentence: **a read endpoint does extraction work (network scraping) synchronously per request, with no persistence layer between the scrapers and the user.** Everything else (SSE streaming, progress, stale client cache) exists to hide that. Fix at that level: scheduled refresh into a `sales_items` plus `sales_price_points` store, `GET /sales` as a keyset-paginated indexed read, SSE only for admin recheck progress (appendix A, SALES-1, SALES-2, SALES-9, SALES-10).

### 4.2 Why images load janky

Frame by frame trace is in appendix C. Summary of a list card:

1. Card mounts. `ProgressiveImage` starts two `new Image()` loaders at once for `url?size=128` and `url`, whether the card is visible or not (IMG-2). Nothing is lazy.
2. `?size=128` is ignored by the static route, so both requests return the full file (IMG-1). Two cache keys, so the browser cache does not dedupe them. The service worker stores both (IMG-10).
3. Whichever finishes first sets `currentSrc`. The placeholder is removed by a `v-else` as soon as `currentSrc` is truthy, before `ion-img` has laid out and decoded, so a blank frame appears (IMG-4, IMG-5).
4. When the second download completes the `src` swaps to the same bytes under a different URL, which re-triggers decode, and a CSS blur transition runs on the full-size image (IMG-6).
5. Because there is no width/height/aspect in the data model (IMG-3), only list cards that hard-code `aspect-ratio: 4/3` avoid layout shift. Thumbs, modals and detail galleries do not.
6. Order of appearance is the order of network completion, so a top-to-bottom list fills in randomly. Orientation is wrong for phone photos because upload never calls `.rotate()` (IMG-7). Lists return every image of every entity though cards use one (IMG-12).

Root cause: **the system has one image per record and no notion of variants, dimensions or placeholders, and the client simulates progressive loading with a query parameter nothing honours.** Fix as one coherent change (appendix C "Suggested end-to-end design"): at upload generate 160/480/1024 WebP (plus AVIF where supported) variants with `.rotate()`, store width, height and a tiny placeholder (blurhash or dominant colour) per image, expose variant URLs and dimensions in list payloads (cover image only), backfill existing rows with a migration, render with a native `<img>` using `srcset`/`sizes`, `loading="lazy"`, `decoding="async"`, reserved aspect-ratio and a placeholder that stays mounted until `load`. Serve `/uploads` with `immutable` in the app server too.

---

## 5. Findings

Ranked index (impact on real users, highest first). Every finding has the full entry (evidence, root cause, fix, layers, impact, effort, risk, dependencies) in the appendix named in the last column.

| Rank | ID | Title | Sev | Status | Effort | Appendix |
|---|---|---|---|---|---|---|
| 1 | SALES-1, BE-4 | Scraping inside the user request, no persistence or refresher | Critical | Confirmed | L | A, D |
| 2 | IMG-1 | `?size=` is not honoured, every image downloaded twice at full size | Critical | Confirmed | M (part of variant pipeline) | C |
| 3 | IMG-2, SALES-3 | Two eager `new Image()` loaders per card, no lazy loading, random order | Critical | Confirmed | S | C, A |
| 4 | BE-1, FE-2 | Plant list N+1 for watering state | High | Confirmed, measured | M | D, B |
| 5 | FE-3 | Serial boot chain before first paint | High | Confirmed | M | B |
| 6 | FE-4 | `vendor-ionic` 1.27 MB single eager chunk | High | Confirmed size, Suspected cause | M | B |
| 7 | FE-1 | Chart.js on the critical path of every page | High | Confirmed | S | B |
| 8 | IMG-3, IMG-4 | No dimensions or placeholder for photos, placeholder removed too early | High | Confirmed | M | C |
| 9 | SALES-4, FE-15 | Whole list re-sorted and re-rendered per SSE frame | High | Confirmed, measured long tasks | S/M | A, B |
| 10 | IMG-7 | No `.rotate()`, `nearLossless`, no AVIF, no variants | High | Confirmed | M | C |
| 11 | IMG-8, BE-9 | `/uploads` revalidates every view in app server, duplicate Cache-Control behind nginx | High/Medium | Confirmed, wire specifics Suspected | S | C, D |
| 12 | IMG-11 | Sale images hotlinked originals, no proxy or dimensions | High | Confirmed, sizes Suspected | L | C |
| 13 | DB-1, DB-2, BE-2 | Indexes do not match queries, unbounded lists returning all images | High/Medium | Confirmed (plans measured) | S (indexes) / M (list contract) | D |
| 14 | SALES-2 | No in-flight dedup, no stale-while-revalidate, cold after restart | High | Confirmed | absorbed by SALES-1 | A |
| 15 | BE-5, FE-9 | No compression, ETag or Cache-Control on API, no brotli in nginx | Medium | Confirmed | S | D, B |
| 16 | SALES-5, SALES-6 | 250-product feeds per page, image probes blocking page 1 | Medium | Confirmed | S/M | A |
| 17 | IMG-5, IMG-6, IMG-13 | `ion-img` blank frame, blur on full-size, raw files in thumbs | Medium | Confirmed, magnitude Suspected | S | C |
| 18 | IMG-10 | SW cache keyed per URL, 200 entries cover 100 photos, sale images uncached | Medium | Confirmed config | S | C |
| 19 | FE-5, FE-6, FE-10, FE-11 | Token read from IndexedDB per request, hidden pages recompute, whole-collection persistence, unvirtualised lists | Medium | Confirmed | S/M | B |
| 20 | BE-3, BE-7, BE-6, BE-10, BE-12 | Substrate cartesian join, bcryptjs on main thread, sync HTML parsing, log rotation, no memory limits | Medium | Confirmed / Suspected as labelled | S/M | D |
| 21 | FE-7 | Care guide quadratic markdown render and auto start | Medium | Confirmed | S | B |
| 22 | SALES-9 | NEW flags, badge and price history only local, wrong on first install | Medium | Confirmed | absorbed by SALES-1 | A |
| 23 | DB-3 | Deleting a user owning substrates fails on the FK (found on the way) | Medium (correctness) | Confirmed by schema | S | D |
| 24 | Remaining Low items | SALES-7/8/10/11, IMG-9/12/14/15/16, FE-8/12 to FE-19, BE-8/11/14/15/16, DB-4 to DB-8 | Low | as labelled | S | A to D |

Detail for every ID follows verbatim from the area audits.


---

## 6. Fix plan

Ordered so that contracts and data come before the components that consume them. Each wave ends with a verification step against section 3. Waves 0 and 1 are independent and can run in parallel. Per project rules the tests run once per wave, after the wave's changes are complete.

### Wave 0: cheap, contract-free wins (S, low risk)

| Change | Findings |
|---|---|
| Stop the Chart.js chunk from being preloaded: keep the class-field helper out of the `vendor-charts` manual group (or drop the group so Rolldown splits by import graph) | FE-1 |
| One migration: `plants(user_id, created_at DESC)`, `substrates(user_id)` and a public partial index, `plants(substrate_id)`, `substrate_components(component_id)`; run `PRAGMA optimize` on open and periodically; set `busy_timeout` | DB-1, DB-2, DB-4, DB-5 |
| Register `@fastify/compress`, add ETag and `Cache-Control: private, no-cache` on list reads; set `maxAge` and `immutable` on `@fastify/static` for uploads; fix duplicate `Cache-Control` in nginx (`proxy_hide_header`); add `gzip_vary` and brotli in nginx; scope `proxy_buffering off` to the SSE locations | BE-5, IMG-8, BE-9, FE-9, FE-8 |
| Memoise `Intl.NumberFormat` and `Intl.Collator` instances instead of building per item or per sort | SALES-4 (formatter part) |
| Read the token from the session store, not IndexedDB, on each request | FE-5 |
| Fix FK on `substrates.user_id` (`ON DELETE CASCADE` or explicit cleanup) and orphan image cleanup on profile delete | DB-3 |

Verify: rebuild; boot preload list no longer contains `vendor-charts` (boot JS gzip about 69 kB lower); `GET /plants` shows `content-encoding` and `etag`, second request is 304; `EXPLAIN QUERY PLAN` for the six queries in 3.4 shows `SEARCH ... USING INDEX` and no temp B-tree for the user list; repeat the 3.2 load and compare FCP and transferred JS.

### Wave 1: foundations (new data contracts, backend first)

1. **Sales persistence and refresher** (L). New tables `sales_items` and `sales_price_points`; a scheduled worker (single-flight per source, stale-while-revalidate, jittered interval, health tracker kept) writes to them; `scraped_at` becomes the true scrape time; image probing moves off the user path and its results are stored. `GET /sales` becomes a keyset-paginated indexed read (`?cursor=&limit=`), with server-computed `isNew`, `previousPrice`, `priceHistory` (bounded). The SSE route remains only for admin recheck progress. Findings absorbed: SALES-1, 2, 5, 6, 7, 9, 10, BE-4.
2. **Plant list summary** (M). Add `lastWateredAt`, `lastFertilizedAt` (and the due-state inputs) to the list query via a grouped join on `idx_watering_history`; return only the cover image per entity in lists (`coverImage`, `imageCount`) and move full galleries to detail endpoints; add a bounded `LIMIT` to the watering history endpoint; replace the substrate cartesian join with two queries or aggregate JSON. Findings: BE-1, BE-2, BE-3, IMG-12, FE-2 (backend half).
3. **Image variant pipeline** (L). On upload: `.rotate()`, generate 160/480/1024 WebP (AVIF when available), compute width, height and a tiny placeholder; store in `images` (new columns plus `variants` JSON or a `image_variants` table); backfill job for existing files with a resumable migration script; expose `src`, `srcset`, `width`, `height`, `placeholder` in payloads; serve with `immutable`. Remove or repoint the unused `/api/v1/images/...` resize route. Findings: IMG-1, 3, 4, 7, 9, 15, 16.

Verify: `GET /sales` p95 independent of shop latency (point the dev stack's mock shops at a 10 s delay and confirm the endpoint still answers in single-digit ms from the DB); no per-shop HTTP on a request (log count is 0); plants view makes 1 request instead of 14; list payload shrinks (record the new bytes per endpoint next to 3.3); a freshly uploaded photo yields three files plus stored dimensions; backfill dry run reports counts.

### Wave 2: frontend consumption of the new contracts

1. **`ProgressiveImage` rewrite** (M): native `<img>` with `srcset`/`sizes`, `loading="lazy"` (eager and `fetchpriority="high"` only for the first row), `decoding="async"`, reserved `aspect-ratio` from the payload, placeholder (colour or blurhash canvas) that stays mounted and cross-fades on `load`, no `new Image()` preloaders, no blur on the full image; thumbs and modals use the 160/480 variant. Findings: IMG-2, 3, 4, 5, 6, 13, SALES-3 (own-origin part).
2. **Sales store and view** (M): consume the paginated read, one request, no ticket round trip; append pages into a `shallowRef` list; compute sort and filter once per change, not per frame; drop whole-list persistence (the server is now the source of truth, keep only the "seen" ids). Findings: SALES-4, 8, 11, FE-10, FE-15.
3. **Plants and Water round** (S): remove the per-plant watering fetch and the re-sort on every response; use the summary fields. Finding: FE-2 (client half), FE-13.
4. **Boot path** (M): start auth and route chunk in parallel, render the shell before IndexedDB hydration completes, keep the token in memory; split `vendor-ionic` by import graph (remove the catch-all manual group, check with a visualizer build which Ionic components truly load eagerly) and lazy-load rarely used ones (modals, popovers, datetime). Findings: FE-3, FE-4, FE-14, FE-19.
5. **Hidden-page recomputation and list scale** (M): guard computeds and watchers of inactive Ionic pages, debounce search at the input, virtualise lists only after measuring a realistic size (Suspected scale today). Findings: FE-6, FE-11, FE-12, FE-7.

Verify: repeat 3.2 and 3.5 and compare: FCP, number of requests on plants (target 2), transferred JS on first load, long tasks during the Sales load (target zero over 200 ms), image requests per card (target 1), and no layout shift on the lists and detail heroes (record CLS with the Performance panel). Check visually in the browser that images reveal from the placeholder in place, top to bottom.

### Wave 3: remaining infrastructure and hardening

| Change | Findings |
|---|---|
| Sale image proxy and cache (resize once, store variants, serve `immutable`) so shop CDNs are hit once per image, plus SW caching for them | IMG-11, IMG-10, SALES-3 (external part) |
| Move bcrypt to the native `bcrypt` or a worker; move heavy HTML parsing to a worker or a streaming parser | BE-7, BE-6 |
| Log rotation and 4xx logging at info, container memory limits and `UV_THREADPOOL_SIZE` for sharp, tighter SSE ticket sweep, cheaper guest sessions | BE-10, BE-12, BE-11 |
| Response schemas for hot routes (fast-json-stringify), single JWT verification per request | BE-16, BE-14 |
| Luxon or dead Capacitor dependencies, animations on layout properties, admin health fetched once | FE-17, FE-18, FE-16 |

Verify: sale images come from `/uploads` or the proxy path with one request each; container RSS stays below the limit during a full refresher cycle with Chromium; login p95 does not block concurrent reads.

Dependencies at a glance: SALES-1 needs the DB migration framework and is a prerequisite for the Sales client work; the image pipeline (Wave 1.3) is a prerequisite for the `ProgressiveImage` rewrite; the plant list summary (Wave 1.2) is a prerequisite for FE-2's client half. Wave 0 has no prerequisites.

---

## 7. Things explicitly ruled out (checked and found fine)

| Area | Why it is fine |
|---|---|
| Route-level code splitting | Every view is a lazy import; Chart.js is only needed by `SalesDetails` and `PlantDetails` (the problem is only the preload, FE-1) |
| Locale loading | One locale chunk loaded lazily at a time |
| Ionic and icon imports | Named imports from `@ionic/vue` and `icons.ts`, tree-shaking works (the chunk is large because of the manual group, FE-4) |
| Sales chart rendering | Details route only, max 30 points, lazy chunk |
| Sales SSE transport mechanics | Back-pressure, abort handling and heartbeat are correct; the cost is what runs behind it |
| Client stream coalescing and skeletons | Fine, no layout shift from them |
| Plants query itself | No N+1 inside the query; ownership checks in SQL; `idx_images_lookup` and `idx_watering_history` are correct |
| SQLite config | WAL, `synchronous=NORMAL`, foreign keys on; no sync blocking work on the hot path other than noted |
| Auth cost | No per-request DB or session lookup |
| SQL shape | No `SELECT *`, no loops with awaited queries in list handlers (other than the client-side N+1) |
| Logging | No Fastify per-request logging in the hot path (only the 4xx noise, BE-10) |
| Graceful shutdown | Present |
| Docker | Multi-stage, non-root, production defaults, no dev settings leaking into the image |
| nginx caching | Hashed `/assets` immutable one year, `sw.js` and `index.html` no-cache, `/uploads` immutable (only the duplicate-header and brotli points remain) |
| Listener and timer hygiene | Intervals, listeners and observers are cleaned up; object URLs revoked; no polling |
| Image layout reservation in lists | List cards already reserve `aspect-ratio: 4/3`, hero and gallery use fixed boxes |
| Failure fallback | Failed image loads fall back to the placeholder; generated SVG letter tiles from scrapers are filtered out |
| Image filenames | Unique, so immutable caching is safe |

---

## Limits of this audit

- No LCP, TBT, INP or a Lighthouse performance score: tooling gap (procedure in 3.2).
- Real scraper latency not measured: mocked shops locally (procedure in 3.3). SALES-1's worst case comes from code constants.
- Row counts are tiny, so query plans are the baseline, not times.
- Docker, nginx, brotli, HTTP/2 not exercised: emulated.
- A measured Lighthouse CLS and the effect of the deletion of `ion-img` are Suspected until Wave 2.
- Single run per throttled measurement; repeat 5 times and take the median before using them as acceptance numbers.

---

# Appendices: per-area audits (unabridged)

Each appendix is the full output of one area audit with the evidence for every finding listed above.


---

## Appendix A: Sales list audit (SALES-n)

### Sales list performance audit (read-only, static analysis)

Scope: route -> view -> store -> SSE transport -> use case -> scrapers -> cache/health -> render. Compared against the Plants list (and its repository). No code was run and nothing was measured; "Confirmed" means traced in code, numbers are derived from code constants, not profiling.
Paths are relative to `C:\Users\owner\Documents\github\plantcare-tracker`. BE = `backend/src`, FE = `frontend/src`.

#### 1. The path, end to end

1. Router: `FE/router/index.ts:28` lazy-loads `SalesOverview` (fine). Chart.js is only pulled in by `SalesDetails` (lazy, `:29`), so no chart cost on the list.
2. `SalesOverview.vue:165` `mounted()` calls `fetchSales(false)` -> `store.load({force:false})` (`FE/stores/sales.ts:113`). `TabsPage.vue:87` independently calls `restore()` (hydrate from Ionic storage).
3. If the store is not fresh (`isStale`: 24 h prod, 6 h dev, `FE/utils/utils.ts:21`), `runStream()` (`sales.ts:121`) starts.
4. `ApiUtils.stream` (`FE/utils/apiUtils.ts:284`): first `POST /auth/ticket` (one extra round trip, rate limited at `BE/modules/auth/presentation/authRoutes.ts:76,130`), then opens `EventSource /sales?ticket=`.
5. Route `GET /sales` (`BE/modules/sales/presentation/salesRoutes.ts:39`) -> `createSseEndpoint` (`BE/core/sse/sseEndpoint.ts:425`) -> `FetchSalesOverview.execute` (`BE/modules/sales/application/FetchSalesOverview.ts:138`).
6. The use case fans out `sum(maxPages)` jobs: 14 shops, 31 page jobs (3+5+1+2+4+2+2+1+2+1+2+1+1+4, from `BE/modules/sales/infrastructure/scrapers/index.ts` maxPages lines 29..454). Limiter: 8 concurrent axios jobs, 2 chromium jobs (`FetchSalesOverview.ts:133-134`).
7. Each job calls `BaseScraper.fetchPage` (`scrapers/BaseScraper.ts:78`): in-memory NodeCache hit returns immediately; a miss does a live HTTP fetch of the shop (Shopify `products.json?limit=250&page=N`, or HTML parse, or Chromium), runs strategies, and on page 1 awaits image probes and a health write.
8. Items are mapped to `Sale`, deduped, and pushed over SSE in <=16 KB frames (`BE/core/sse/SseManager.ts:504-578`, `core/config/constants.ts:66`).
9. FE: every frame runs `convertToSales`, pushes into `incoming`, calls `addPricePoint` per item (`sales.ts:136-155`); `items` is only replaced on the `done` event (`sales.ts:156-163`).
10. Render: `visibleSales` -> `filteredSales` -> `mappedSales` -> `ItemsOverview` `filteredItems` -> unvirtualized `<ul>` of cards each containing `ProgressiveImage`.

There is no database query on the Sales request path. The only DB interaction is `SourceHealthTracker.record` (SQLite read+upsert on page 1 of a cache miss, `core/scrapeHealth/SourceHealthTracker.ts:32-56`), which is cheap. Price history is not server-side at all: it lives only in the browser (`sales.ts:36,191-198`, persisted under `sales_price_history`). There is no cron, no background scraper, no warm-up (grep for `cron|schedule|setInterval` in `BE` finds only the SSE heartbeat and a snapshot sweeper).

#### 2. Why Sales is slower to appear than Plants / Substrates / Components

| Aspect | Plants (and the other REST lists) | Sales |
|---|---|---|
| Data source | Own SQLite, one indexed query (`BE/modules/plants/infrastructure/SQLitePlantRepository.ts:26-70`, indexes `idx_plants_list`, `idx_images_lookup`, `0001_baseline.ts:101-102`) | Live scraping of 14 third-party shops per cold request |
| Transport | One `GET`, one JSON body (`stores/plants.ts:92`) | `POST /auth/ticket` + SSE stream of N frames |
| Time to first data | One RTT + a few ms of SQL | RTT + ticket RTT + the fastest external scrape (seconds), image probes on page 1 |
| Time to complete | Same | Slowest of 31 external fetches (worst case tens of seconds with retries) |
| Server cache | n/a (DB is the source) | In-memory, per process, 24 h flat TTL, cold after every restart (`NodeCacheAdapter.ts:19`) |
| Client cache | Hydrate then `ensureLoaded` | Same pattern, but a stale client cache triggers a full re-stream |
| Images | Own origin, `?size=128` resized by sharp, `Cache-Control: public, max-age=86400` (`imageController.ts:115-127`) | Third-party CDN originals, see SALES-3 |
| Per-batch UI work | One assignment of `items` | Re-sort and re-render the whole list for every 16 KB frame, see SALES-4 |

Net effect: Plants latency is bounded by local SQLite. Sales latency is bounded by the slowest external site on a cold cache, plus a UI that does quadratic work while the stream is running and fetches every image eagerly.

#### 3. Findings

##### SALES-1: Scraping happens inside the user request, with no background refresh
- Severity: Critical. Status: Confirmed.
- Evidence: `FetchSalesOverview.ts:171-179` (fan-out of 31 live page jobs per request), `BaseScraper.ts:78-138` (cache miss means live fetch), `HttpFetcher.ts:63-90` (15 s timeout, 2 retries with 0/2/4 s backoff, so up to about 45 s per page), `HttpFetcher.ts:104-129` (Chromium: browser launch, 1.5 s + 1 s fixed sleeps, 30 s goto timeout, limiter of 2 for `greenMeUp`, `scrapers/index.ts:191`). Cache is `NodeCacheAdapter` with `stdTTL` 24 h in process memory (`NodeCacheAdapter.ts:19`), created inside the route plugin (`salesRoutes.ts:27`). No scheduler exists anywhere in `BE`.
- Root cause: The data product (a catalogue of current sales) is refreshed lazily by whichever user request first finds the cache empty, and the cache is process-local and volatile. Freshness, scraping cost and user latency are coupled.
- Fix (root cause): Move scraping out of the request path into a scheduler (in-process interval with jitter, or a small worker) that refreshes each source on its own cadence (for example every 1-3 h, per-source), and persist the merged result in SQLite (`sales_items` table keyed by `sale_id`, with `first_seen_at`, `last_seen_at`, `price`, `old_price`, `source_key`, plus `sales_price_points` for real price history). `GET /sales` then becomes a plain indexed read that also survives restarts, and the request path never touches the network. Keep an admin "recheck" that enqueues a refresh. Health tracking (`SourceHealthTracker`) moves to the worker unchanged.
- Layers: backend infra, DB (new migration), application use case, scheduler/bootstrap.
- Expected impact: Sales list time to first data drops from seconds-to-tens-of-seconds (cold) to roughly the Plants level (tens of ms); removes outbound traffic and Chromium from user requests; enables server-side price history and NEW flags (see SALES-9).
- Effort: L. Dependencies: SALES-2 and SALES-5 become partly moot once this lands; SALES-6/7 are best done in the same change.

##### SALES-2: Cache is cold after every restart and has no stale-while-revalidate or in-flight dedup
- Severity: High. Status: Confirmed.
- Evidence: `BaseScraper.ts:79-83` and `:136` (check, then set only after the whole fetch completes, so no shared in-flight promise); `salesRoutes.ts:27` (one `NodeCacheAdapter` per app instance, in memory); `NodeCacheAdapter.ts:19-24` (flat 24 h TTL, expiry is a hard miss).
- Root cause: The cache stores results, not work. Two concurrent requests (two devices, pull-to-refresh during a stream, `SalesDetails` triggering `load`) each start identical scrapes of every uncached page; after expiry every user waits for the live fetch instead of receiving the previous result while a refresh runs.
- Fix (root cause): If SALES-1 is adopted this disappears (reads come from the DB). If SALES-1 is deferred, the interim design is a per-source single-flight map (`Map<key, Promise<RawSaleItem[]>>`) plus stale-while-revalidate (serve expired value immediately, refresh in background), with the last good result persisted so a restart is not cold.
- Layers: backend infra/cache. Impact: removes duplicate scraping under concurrency and the "first visitor after restart/expiry pays everything" pattern. Effort: S-M (interim) or free with SALES-1. Dependencies: none.

##### SALES-3: Every sale image is preloaded eagerly, twice, from third-party origins at full size
- Severity: High. Status: Confirmed for the request pattern; byte sizes Suspected (depends on shop CDNs).
- Evidence: `FE/components/ProgressiveImage.vue:73-102` creates `new Image()` for a low-res URL (`url + "?size=128"`) immediately on `src` watch (`:64-70`) and then a second `new Image()` for the original in `fetchHighRes` (`:105-121`). It is used for every card in `ItemsOverview.vue:99` with no viewport gating (the `new Image()` preload ignores `ion-img` lazy loading, because `currentSrc` is only set after the preload completes). For sales, `sale_image_url` is the shop's own URL (`SaleMapping.ts:307`, scrapers `normalizeImageUrl` at `scrapeHelpers.ts:71-87`), so `?size=128` is meaningless to those CDNs (the `size` parameter is only implemented by this app's own image route, `imageController.ts:115-127`).
- Root cause: One image component assumes a first-party backend that can resize on `?size=`. For external images it triggers two full-size downloads per item for the whole list, regardless of what is on screen, competing with the SSE stream for bandwidth and main-thread decode time.
- Fix (root cause): Introduce an image proxy/cache owned by the backend for sale images (`GET /sales/:id/image?size=` backed by sharp, stored on disk at scrape time in the SALES-1 worker, long `Cache-Control`/ETag), and give `ProgressiveImage` an explicit "has resize endpoint" capability so third-party/inline URLs use a single `<ion-img loading="lazy">` request. This also removes hotlink and mixed-content risks. Cheaper alternative if no proxy: skip the low-res step for non-own-origin URLs and rely on `loading="lazy"` only.
- Layers: backend (image storage/proxy), frontend component, scraper pipeline. Impact: for N sales removes up to 2N eager full-size requests; typically the biggest bandwidth and "list looks slow to settle" factor. Effort: M (no proxy) to L (proxy). Dependencies: SALES-1 for the proxy variant.

##### SALES-4: List recomputed and re-rendered in full for every SSE frame (quadratic work during streaming)
- Severity: High. Status: Confirmed pattern; cost per frame Suspected (not profiled).
- Evidence: Per frame, `sales.ts:147-149` mutates `incoming` and calls `addPricePoint` per item. That invalidates `visibleSales` (`:81-85`, builds a Set of all `items` and a new array), `filteredSales` (`:87-89`, copies and sorts everything with `localeCompare(..., locale, {numeric:true})` as the tiebreak, `salesQuery.ts:272`; with the default sort `"new"` the primary compare is nearly always 0 so the slow `localeCompare` runs for almost every comparison and constructs collator options each call), `sellers` (`:90-94`), then `mappedSales` (`SalesOverview.vue:150-163`) which builds three `Intl.NumberFormat` objects per item (`formatPrice` `formatPrice.ts:5`, `formatDiscount` `:22`, plus `discountPercent` twice), then `ItemsOverview` watcher re-sorts and re-renders (`ItemsOverview.vue:321-331`, `newInView` filter `:265`). With about 45 items per 16 KB frame and N total items, total work is about (N/45) x O(N log N) with expensive constants.
- Root cause: Streaming granularity (frame) is tied to full derived-state recomputation, and per-item formatting objects are recreated instead of cached.
- Fix (root cause): (a) Cache `Intl.NumberFormat` and `Intl.Collator` per locale (module-level singletons) and precompute `priceText`/`discountText` once when mapping the API sale into the store model, so `mappedSales` is a cheap projection. (b) Do not re-derive during streaming: if SALES-1 lands, the list arrives as one JSON response and this vanishes; otherwise buffer frames and commit at most once per animation frame or per 250 ms, and keep sort keys (`isNew`, discount) precomputed on the sale. (c) Render with a virtual scroller or incremental windowing for the grid.
- Layers: frontend store, view, component. Impact: removes jank during load and shortens "time to final render"; benefit scales with N (several hundred items). Effort: S for (a), M for (b)+(c). Dependencies: none for (a); SALES-1 simplifies (b).

##### SALES-5: Every Shopify page downloads and parses a 250-product catalogue feed to find the discounted few
- Severity: Medium. Status: Confirmed.
- Evidence: `strategies/ShopifyJsonStrategy.ts:25,73-74` (`products.json?limit=250&page=N`, full product objects with all images, variants, tags), `:80-91` (filter client-side to discounted items). `mgPlants` alone requests 4 pages of the whole catalogue (`scrapers/index.ts:442-455`). `maxPages` is a fixed config, so pages beyond the last real page are still requested (`FetchSalesOverview.ts:171-173`; empty pages are accepted at `BaseScraper.ts:158-162`).
- Root cause: Source adapters model "pages" as a fixed count and cannot ask the shop for only discounted items or stop when the catalogue ends.
- Fix (root cause): Make pagination adaptive in the source contract (`fetchAll()` that loops until an empty/short page, sequentially per source, instead of pre-scheduled fixed pages) and prefer shop-side filtering where available (collection scoped to sale, `products.json` with `fields=` where supported). With SALES-1 these costs move off the request path; this finding then only affects scrape duration and outbound load.
- Layers: backend infra/domain interface. Impact: fewer and smaller external requests; faster cold refresh. Effort: M. Dependencies: pairs with SALES-1.

##### SALES-6: Image probing and health write block page 1 of every source before items are returned
- Severity: Medium. Status: Confirmed.
- Evidence: `BaseScraper.ts:129-133` awaits `checkFields` (including `probeImage`) and `this.report` before `cache.set` (`:136`) and before returning items. `fieldChecks.ts:63-69` probes 2 sample URLs; `HttpFetcher.ts:148-186` does DNS safety lookup, then HEAD (5 s timeout) then GET (5 s timeout) sequentially per URL, so an unresponsive image host can add up to about 10 s to that shop's first page, which is also the page the stream most wants early.
- Root cause: Health diagnostics are computed synchronously in the data path.
- Fix (root cause): Decouple observation from delivery: return and cache the items first, then run `checkFields` and `health.record` as a detached task (or in the SALES-1 worker, where it belongs). Health can lag by seconds without consequence.
- Layers: backend infra. Impact: removes up to about 10 s from first-page latency of affected shops. Effort: S. Dependencies: none.

##### SALES-7: Sale payload carries redundant per-item data and `scraped_at` is request time, not scrape time
- Severity: Low. Status: Confirmed.
- Evidence: `Sale.ts:281` sets `sale_scraped_at = new Date().toISOString()` at serialization time, so cached items report "now" on every request (also defeats any future diffing). Each item repeats seller name and a full URL for link and image; each item is `JSON.stringify`ed twice (`SseManager.ts:562` for size, `:582` for the frame).
- Root cause: Entity built per request from raw cached data; wire format is verbose and un-compressed (no `@fastify/compress` anywhere, `grep compress` in `BE` is empty; SSE here is also hand-written headers via `reply.hijack`, `sseEndpoint.ts:434`).
- Fix (root cause): With a persisted `sales_items` table (SALES-1) store the true `scraped_at`/`first_seen_at`; return a normalized payload (seller table once, items reference seller key) from a normal JSON endpoint and enable response compression (brotli/gzip) there. Compression must not be applied to the SSE route or must flush per frame.
- Layers: backend domain, serialization, middleware. Impact: smaller payload and correct timestamps; minor latency effect on its own. Effort: S-M. Dependencies: SALES-1.

##### SALES-8: Persistence and reactivity overhead on a large deep-reactive list
- Severity: Low-Medium. Status: Suspected (not profiled).
- Evidence: `sales.ts:42-75` persists all of `items` plus `priceHistory` through `l2Persistence` (`FE/stores/persistence.ts:128-138`): `$subscribe` with `flush:"sync"` fires on every mutation (one per `addPricePoint`, `sales.ts:195`, so N times per stream) and each resets a timer; the debounced flush then does `JSON.stringify(entry.pick(state))` for all three entries (`:66-67,117`) and `JSON.parse(json)` again (`:121`) before the async storage write. `items`, `incoming`, `priceHistory` are deeply reactive Pinia state (`sales.ts:31-39`) though items are read-only after commit.
- Root cause: Whole-collection snapshots and deep reactivity are used for data that is replaced wholesale and never mutated in place (except `isNew`).
- Fix (root cause): Store the committed list with `shallowRef`-style semantics (replace the array, mutate `isNew` via a small separate `seenIds` set), persist `seenIds` and `priceHistory` only, and drop the list snapshot once the server list is cheap (SALES-1) or keep it as a single cache entry written only on `done`. Batch `addPricePoint` into one mutation per commit.
- Layers: frontend store/persistence. Impact: less main-thread work at stream end and on every list read. Effort: M. Dependencies: touches NEW logic, see SALES-9.

##### SALES-9: NEW pills, tab badge and price history are computed client-side from local history only
- Severity: Medium (correctness and coupling that also affects perf). Status: Confirmed.
- Evidence: `isNew: !knownIds.has(sale.id)` (`sales.ts:143`) means on a first install or after storage loss every item is NEW; `newCount` (`:95`) feeds the tab badge (`TabsPage.vue:84`) but is only meaningful from hydrated data (`TabsPage.vue:87`, `restore`), so the badge is stale until the Sales tab is opened and a stream completes. Price history is per device (`sales.ts:36,191-198`), points are stamped `Date.now()` of the client observation (not the shop price change) and only exist for sales the device has streamed.
- Root cause: The server has no persisted notion of when a sale was first seen or how its price moved, so every client reconstructs it.
- Fix (root cause): Persist `first_seen_at` and a price-points table server-side (SALES-1), expose `isNew` relative to a per-user "last seen" watermark and a lightweight `GET /sales/summary` (count of new) for the badge, plus `GET /sales/:id/history` for the detail chart. List responses then do not need to carry history at all.
- Layers: backend DB/API, frontend store, tab badge. Impact: instant correct badge and NEW pills, smaller client state, no history loss. Effort: M-L. Dependencies: SALES-1.

##### SALES-10: No pagination or windowing of the list at any layer
- Severity: Low now, grows with the number of shops. Status: Confirmed.
- Evidence: `FetchSalesOverview` streams everything; `ItemsOverview.vue:95-141` renders every item; the Plants list does the same but with an own-DB list that is small and local.
- Root cause: List size is bounded by the number of shops times discounted items, which has been growing (a recent commit added five shops).
- Fix (root cause): After SALES-1, an end-to-end cursor design is justified: keyset pagination on `(sort_key, sale_id)` over the indexed `sales_items` table (`limit` + opaque cursor), with server-side filter/sort parameters matching `SalesQuery` (shops, min/max price, discount, new) so filters no longer require holding the whole set in the client; the client appends pages and virtualizes. Do not add pagination before SALES-1: with scraped data it would only paginate the output of an unbounded request-time job.
- Layers: DB (index), API, store, view. Impact: bounded payload and render cost as shops are added. Effort: L. Dependencies: SALES-1, SALES-4.

##### SALES-11: Second `load` entry points and double hydration on mount
- Severity: Low. Status: Confirmed.
- Evidence: `TabsPage.vue:87` `restoreSales()` and `SalesOverview.vue:166` `fetchSales(false)` both hydrate (`sales.ts:108-109,116`); `SalesDetails.vue:137-139` calls `loadSales` on every enter. `coalesced` (`FE/stores/resource.ts`) shares the running stream, but hydration itself is not coalesced when `status` is still `idle`, so storage may be read and JSON-parsed twice (the list entry is the largest stored blob).
- Fix (root cause): Make `$hydrate` idempotent per store (memoize the in-flight promise) in the persistence plugin. Impact: small. Effort: S. Dependencies: none.

#### 4. Checked and found fine

- DB path for sales: there is none per request. `scrape_source_health` is read/written once per cache-miss page 1 (`SourceHealthTracker.ts`); table and queries are trivial.
- Plants list query: single query with left joins, supported by `idx_plants_list` and `idx_images_lookup` (`0001_baseline.ts:101-102`), no N+1 (rows grouped in memory, `SQLitePlantRepository.ts:153-190`). The only cost is no pagination and a sort on `created_at`, negligible at this size.
- Chart rendering: charts are only on `SalesDetails` (lazy route chunk), fed by at most 30 points (`sales.ts:23`), not part of list rendering.
- Route-level code splitting: all views lazy (`router/index.ts:12-28`).
- SSE transport itself: heartbeat 20 s, 16 KB framing, back-pressure via `drain` (`SseManager.ts:580-590`), abort handling skips not-yet-started work (`FetchSalesOverview.ts:142,147,160`); in-flight fetches still populate the cache. Ticket auth is one-time with 60 s TTL (`constants.ts:32`).
- Client coalescing: concurrent `load()` callers share one stream (`resource.ts` `coalesced`); a stream commits only on `done`, so partial data never overwrites a good snapshot (`sales.ts:156-163`).
- Skeleton behaviour: `ItemsOverview.vue:59` shows the skeleton only while there are no items, so with a hydrated cache the list is visible immediately and refreshed behind it.
- Scrape correctness guards: field-completeness threshold, strategy fallback, SSRF check for probes (`publicUrl.ts`, `HttpFetcher.ts:148`).
- Dedup: ids deduped both in the use case (`FetchSalesOverview.ts:139,153-157`) and in `SseManager.sendUnique` (redundant but cheap).

#### 5. Suggested order

1. SALES-6 and SALES-4(a) (S, quick wins independent of architecture).
2. SALES-3 (cheap variant first: skip low-res double fetch for non-own origins and lazy load).
3. SALES-1 as the structural fix, bundling SALES-2, SALES-5, SALES-7, SALES-9; then SALES-8, SALES-10, SALES-11 follow naturally.

Caveat: all timing statements are derived from constants and code paths; please confirm with a trace of time to first SSE frame, time to `done`, and a main-thread profile of one stream before ranking the frontend items (SALES-4, SALES-8) against SALES-3.


---

## Appendix B: Frontend audit (FE-n)

### Frontend performance audit (read-only)

Scope: `frontend/` (Ionic Vue 8, Options API, Pinia, Vite 8 / rolldown, vite-plugin-pwa, nginx). Nothing was built or run. Bundle numbers come from the existing `frontend/dist` (note: that dist has no `sw.js`, so it may be an older or partial build; sizes are still representative). Image pipeline is out of scope except where noted as an interaction.

Severity scale: Critical (broken or order-of-magnitude), High (clearly user visible), Medium, Low. Status: Confirmed (traced with file:line) or Suspected (needs measurement).

---

#### Summary table

| ID | Title | Sev | Status | Effort |
|----|-------|-----|--------|--------|
| FE-1 | Chart.js chunk (68 KB gz) is on the critical path of every page via a shared helper | High | Confirmed | S |
| FE-2 | Plant list issues one GET per plant for watering state (N+1), and recomputes the whole list per response | High | Confirmed | M |
| FE-3 | Nothing paints until storage, auth and locale are ready (blank screen, serial boot chain) | High | Confirmed | M |
| FE-4 | `vendor-ionic` is 1.27 MB raw / 286 KB gz and is a single eager chunk | High | Confirmed (size), Suspected (cause) | M |
| FE-5 | Token read from IndexedDB on every API request | Medium | Confirmed | S |
| FE-6 | Pages stay mounted in the Ionic stack and keep recomputing on every store change | Medium | Confirmed | M |
| FE-7 | AI care guide re-renders markdown of the whole text on every streamed chunk (O(n^2)) and starts on every plant visit | Medium | Confirmed | S |
| FE-8 | `serve.js` fallback server marks `sw.js` and all non-HTML files `immutable` for 1 year, reads files without caching, no compression | Medium | Confirmed | S |
| FE-9 | nginx: no brotli, weak gzip config, `/uploads` and API JSON not cached or tuned, `proxy_buffering off` on all of `/api/` | Medium | Confirmed | S/M |
| FE-10 | Persistence layer serializes whole state on each flush and writes whole collections | Medium | Confirmed | M |
| FE-11 | Large lists are rendered fully, with deep reactive wrapping and per-keystroke filter+sort | Medium | Confirmed (render), Suspected (scale) | M |
| FE-12 | PlantDetails refetches `GET /plants/:id` on every re-entry and double-triggers substrate loading | Low | Confirmed | S |
| FE-13 | Watering store: parallel hydrate race and mislabeled freshness | Low | Confirmed | S |
| FE-14 | Fonts: all unicode subsets precached, no preload, fonts requested only after first render | Low | Confirmed | S |
| FE-15 | Sales stream recomputes the full filter/sort pipeline per SSE event | Low | Confirmed | S |
| FE-16 | Admin health loaded 2 to 3 times per session without dedupe | Low | Confirmed | S |
| FE-17 | Luxon (70 KB raw) loaded eagerly for 5 trivial date calls; unused Capacitor deps | Low | Confirmed | S |
| FE-18 | Animations on layout/paint properties (accordion grid rows, shimmer, blur filter, box-shadow) | Low | Confirmed | S |
| FE-19 | Service worker: precaches everything incl. both locales; `autoUpdate` reloads; upload cache doubles per image | Low | Confirmed | S |

---

#### Findings

##### FE-1 Chart.js chunk on the critical path of every page (High, Confirmed)

Evidence:
- `dist/index.html` modulepreloads `vendor-charts-*.js` (201 KB raw, 68 KB gz) for every route, including `/login`.
- `dist/assets/LocalizationService-*.js` begins with `import{p as n}from"./vendor-charts-LEMOkMNE.js"`; `index-*.js` also imports `p` from it. `p` is the class-field helper (`n(this,'translations',...)`) used by `LocalizationService` and other classes.
- `frontend/vite.config.ts:49-52` defines `codeSplitting.groups` with a `vendor-charts` group matching `chart.js|vue-chartjs|@kurkle`. Rolldown placed a shared runtime helper into that group, and the group's real consumers (`LineChart.vue`, `PieChart.vue`, only used by `components/sales/PriceHistoryChart.vue` and `components/substrates/SubstrateContainer.vue`) are lazy.
- Also `vendor-charts` imports back from `vendor-ionic` (circular chunk edge), which prevents clean separation.

Root cause: manual chunk groups by package regex, with no control over where rolldown hoists shared helpers. A lazy-only library ended up statically reachable from the entry.

Fix: remove the `vendor-charts` group (let rolldown split charts by dynamic import naturally; `LineChart`/`PieChart` are only reached from lazy route chunks), or keep it but use `groups` with `minShareCount`/priority so helpers stay in the entry. Also make the two chart components async (`defineAsyncComponent`) at their two call sites. Verify afterwards that `index.html` no longer lists `vendor-charts` in modulepreload.

Layers: build config, component import style. Impact: about 68 KB gz less on first load for every user and no chart parse on login; faster LCP on slow mobile. Effort S. Dependencies: none.

##### FE-2 N+1 watering requests on the plant list (High, Confirmed)

Evidence:
- `src/views/plants/PlantOverview.vue:161-168`: `plants` watcher (immediate) calls `warmWateringRecords(ids)` which is `useWateringStore().ensureRecordsFor`.
- `src/stores/watering.ts:343-359`: workers fetch `GET /watering/plant/:id` per plant, 3 at a time (`limit = 3`). 40 plants cold = 40 requests, about 14 serial round trips.
- `src/views/water/WaterRound.vue:325-326`: the round screen blocks on all of them (`loading` stays true until `ensureRecordsFor` resolves), so time to interactive scales with the plant count.
- `PlantOverview.vue:100,131-158`: `overviewItems` depends on the whole `byPlantId` map. Each of the N responses invalidates it, so every response re-spreads all plants, recomputes `wateringStatus` per plant (`utils/wateringStats.ts:5-14` builds a Set, sorts, creates Dates per record), and the `ItemsOverview` `items` watcher re-sorts and re-renders the entire grid. Total work O(N * (N + records)).
- `byPlantId` records are cached 24h in memory and IndexedDB, so this hits mainly cold starts, new logins, after "refresh", and after `batch` writes (`refetchPlants` forces refetch of every affected plant, `watering.ts:526-530`).

Root cause: the list view needs one derived fact per plant (last watering and rhythm) but the data model only exposes it through per-plant record lists.

Fix (root cause): serve it from the list endpoint. Add `lastWateredAt`/`wateringIntervalDays` (or the last N watering days) to `GET /plants`, or add `GET /watering/summary` (bulk, one query) and store it as `statusByPlantId` in the watering store; keep `ensureRecords(plantId)` for details/calendar only. `WaterRound` should use the same summary. Client side: make `overviewItems` depend on a per-plant status lookup, not the full records map. Short-term mitigation without backend: raise the worker limit to 6 on HTTP/2 and apply results in one batched assignment.

Layers: backend (query + endpoint), store, view. Impact: plant list goes from 1 + N requests to 1; removes N recomputes; WaterRound opens after one request. Effort M (backend S, frontend M). Dependencies: backend change (separate agent's domain).

##### FE-3 Serial boot chain before first paint (High, Confirmed)

Evidence (`src/main.ts:56-87`):
1. Entry script parses (its static graph includes ionic, vue, luxon, charts, see FE-1/4).
2. `await applyInitialTheme()` opens IndexedDB via `StorageService` (`theme/darkMode.ts:31-38`, `StorageService.ts:37-48`).
3. `await Promise.all([router.isReady(), localizationService.resolveInitialLocale()])`: `router.isReady` runs `beforeEach` -> `Utils.closeAllOpenModals()` -> `session.ensureAuthenticated()` -> `hydrate()` (IDB) -> if no token, `POST /auth/refresh-token` (`stores/session.ts:193-197`), then the lazy route chunk (`TabsPage` + `PlantOverview`, `router/index.ts:12-35`). The locale chunk (`en-*.js` 31 KB / `de-*.js` 35 KB) is a dynamic import started only after step 2 (`main.ts:39-49`, `LocalizationService.ts:222-226`).
4. Only then `app.mount`. `index.html` has an empty `<div id="app">`, no splash/skeleton, so the user sees a blank page for the whole chain.

Root cause: mount is gated on everything; independent async work (locale chunk, route chunk, IDB open, refresh call) is partially serialized behind the theme/IDB step.

Fix: (a) mount immediately and let `ion-router-outlet` and `StateBlock` skeletons show loading; or at least start `resolveInitialLocale()` and the route resolution before `await applyInitialTheme()` (kick off all three promises first, then await together). (b) Apply theme class synchronously from `localStorage`/`matchMedia` in an inline script in `index.html` (a mirror key), and persist to IDB as today. (c) Put an inline app-shell skeleton/background color in `index.html`. (d) Preload the active locale chunk (store `pc_locale` is already read from storage; use `<link rel=modulepreload>` is impossible with hashes, so start the import at the top of `main.ts`).

Layers: boot code, index.html. Impact: removes 2 to 3 serial round trips from time-to-first-render; perceived load improvement on every cold start. Effort M. Dependencies: FE-5 helps.

##### FE-4 vendor-ionic is one 1.27 MB eager chunk (High, Confirmed size / Suspected cause)

Evidence: `dist/assets/vendor-ionic-*.js` = 1,274,302 B raw, 286 KB gz, plus 48 KB CSS (7 KB gz); `vite.config.ts:47` forces `@ionic|ionicons|@stencil` into one group, which is modulepreloaded by `index.html`. The app imports 55 distinct `Ion*` components, always via named imports from `@ionic/vue` (good), and icons from `ionicons/icons` by name (good; only 3 stray `M256 48` path hits, so icons are tree-shaken).
`main.ts:10-20` imports 10 Ionic CSS files incl. utility sets (padding, float, text-alignment, text-transformation, flex-utils, display).

Root cause: the Ionic runtime (stencil custom-elements, overlays, gestures, animation, router integration) is large; the group pins everything reachable, including overlay controllers (modal, popover, toast, alert, action-sheet, picker, loading) that most first screens do not need.

Fix: (1) measure with `rollup-plugin-visualizer` on a build (not run here) to see what dominates; (2) drop the ionic group so rolldown can split overlay-only code to the lazy chunks that use them (modals/popover are already mounted lazily via `useMountWhileOpen`); (3) drop unused Ionic utility CSS imports (`padding`, `float-elements`, `text-alignment`, `text-transformation`, `flex-utils`, `display`) after grepping for the utility classes, `custom.css` uses tokens; (4) keep `ionic.config`/`ionicConfig` tree-shake friendly.

Layers: build config, CSS. Impact: potentially 20 to 40 percent of that chunk plus about 3 KB gz CSS; verify by visualizer. Effort M. Dependencies: FE-1.

##### FE-5 Token read from IndexedDB on every request (Medium, Confirmed)

Evidence: `src/utils/apiUtils.ts:109-122` `getHeaders` awaits `TokenUtils.getToken()` (`tokenUtils.ts:7-9`) which awaits `storageService.get` (IndexedDB through localforage) for every request; `apiUtils.ts:198` reads it again on 401. The session store already holds `token` in memory (`stores/session.ts:47-50`, `hydrate`, `storeToken`).

Root cause: transport reads the persistence layer instead of the in-memory session state.

Fix: keep a module-level `currentToken` in `apiUtils` (or read from the session store) updated by `storeToken`/`localLogout`/`hydrate`; read IDB only at hydrate. Fits the existing `AuthBridge` seam (add `getToken(): string | null`).

Impact: removes an async IDB transaction (1 to 10 ms, more under contention) from each of the N+1 requests and every user action. Effort S. Dependencies: none.

##### FE-6 Hidden pages keep recomputing (Medium, Confirmed)

Evidence: `ion-router-outlet` (`App.vue:12`, `TabsPage.vue:4`) keeps visited views mounted. `PlantOverview.overviewItems` (`PlantOverview.vue:131`), the `plants` watcher (`:161`), `ItemsOverview` watcher/sort (`ItemsOverview.vue:321-331`), `WaterRound.rows` (`WaterRound.vue:272`) and `SalesOverview.mappedSales` (`SalesOverview.vue:146`) all react to store changes while their page is covered. Example: editing a watering record in PlantDetails mutates `byPlantId` and re-derives and re-renders the whole hidden plant grid.

Root cause: derived list state lives in each view's reactive graph with no concept of "active page"; pinia state is global.

Fix: gate expensive computeds/watchers on page activity (`ionViewWillEnter`/`ionViewWillLeave` toggling an `active` flag, return cached value when inactive, or `v-if`/`v-show` the heavy subtree), and move per-plant derivation into store getters keyed by id (see FE-2) so a change touches one item. Optionally `shallowRef`/`markRaw` for large immutable arrays (FE-11).

Impact: removes background re-render work on navigation-heavy flows and mobile CPU. Effort M. Dependencies: FE-2, FE-11.

##### FE-7 AI care guide: quadratic markdown render and automatic start (Medium, Confirmed)

Evidence: `src/stores/moreInfo.ts` stream handler (around `:121-160`): on every SSE event, `render()` calls `renderMarkdown(raw.ai)` over the entire accumulated string and `convertToMoreInfo`, then assigns `this.drafts[key]`, which re-renders `MoreInfo.vue` computeds (`ai`, `links`, `hasContent`) per token. `MoreInfo.vue:102-104` starts the load in `mounted()` for every plant detail visit once the 24h cache expires (`ensureInfo`, key per plant and locale); it opens `POST /auth/ticket` + `EventSource` automatically (an external AI call per plant per day per device).

Root cause: no batching of stream chunks, and generation is eager rather than user-initiated.

Fix: coalesce chunks per animation frame (append to raw, schedule one render with `requestAnimationFrame`/50 ms throttle), render markdown incrementally or only at throttle ticks; consider starting the stream when the section scrolls into view or on user action (keep the cached result path as is).

Impact: CPU on long guides drops from O(n^2) to O(n); fewer wasted AI calls. Effort S. Dependencies: none.

##### FE-8 serve.js fallback server (Medium, Confirmed)

Evidence (`frontend/serve.js`): `cacheControlFor` (`:94-98`) returns `public, max-age=31536000, immutable` for everything except `.html`, including `sw.js`, `workbox-*.js`, `manifest.json`, icons. A browser that has cached `sw.js` for a year never checks for updates through this server (browsers cap SW script cache at 24h for update checks, but intermediaries and the immutable hint still harm). `sendFile` (`:113-121`) reads the full file with `fs.readFile` per request, no caching of buffers, no `ETag`/`Last-Modified`, no gzip/brotli, no `Range`. Used by `scripts/deploy.mjs` (copied as `serve.cjs`).

Root cause: a hand-rolled static server that only treats `.html` as mutable.

Fix: apply immutable only under `/assets/`; `no-cache` for `sw.js`, `manifest`, favicons short max-age; stream with `fs.createReadStream`, add `ETag`/304, and `zlib` brotli/gzip for text types (or precompress at build). If Docker/nginx is the supported path, mark `serve.js` as legacy.

Impact: correctness of updates plus transfer size for non-Docker deploys. Effort S. Dependencies: none.

##### FE-9 nginx configuration (Medium, Confirmed)

Evidence (`frontend/nginx.conf`):
- `:30-32` gzip only: no `gzip_vary on`, default `gzip_comp_level 1`, no `gzip_proxied`, no brotli (the `nginx:1.27-alpine` image lacks the brotli module). `.woff2` and images correctly excluded. Build output is not precompressed (no `gzip_static`).
- `:46-57` `/api/` uses `proxy_buffering off` for every API call (needed only for SSE on `/sales` and `/more-info`). Plain JSON (`GET /plants`, `/substrates`) is streamed in small writes, loses nginx's buffering benefits, and holds backend sockets open for slow clients.
- `:60-69` `/uploads/` is proxied to the Node backend on every request; the `immutable` header is added by nginx but there is no `proxy_cache`, so each image view (and each `?size=` variant, see interaction) is served by Fastify. Upstream response headers are not hidden (`proxy_hide_header Cache-Control`), risking duplicate `Cache-Control`.
- `add_header` inside `location /assets/`, `/uploads/` and the `= /sw.js` blocks drops the server-level `X-Frame-Options` and `Referrer-Policy` (nginx does not inherit `add_header` once a location defines its own). Not a performance issue but a regression risk.
- `/favicons/*` and root `workbox-*.js` have no explicit cache headers (revalidate via ETag, fine).
- Correct and fine: `/assets/` `immutable, 1y`; `sw.js` and `index.html` `no-cache`; `try_files` SPA fallback (hash router, so rarely used); keepalive upstream; healthz.

Fix: enable `gzip_vary on; gzip_comp_level 5; gzip_proxied any;` and add `application/manifest+json`, `application/wasm`, `text/plain`; build a brotli-capable image (`nginx` + `ngx_brotli`, or precompress in the build stage with `vite-plugin-compression2` and use `gzip_static`/`brotli_static`); split SSE locations (`location ~ ^/api/v2/(sales|more-info)$ { proxy_buffering off; ... }`) and leave buffering on for the rest; add `proxy_cache_path` + `proxy_cache` (or mount the uploads volume read-only and serve with `alias` + `expires`) for `/uploads/`; repeat security headers via an `include snippets/security.conf`.

Impact: 15 to 25 percent smaller text transfer with brotli; less backend load for images; faster JSON delivery. Effort S/M. Dependencies: image pipeline agent (uploads caching, variants).

##### FE-10 Persistence layer cost (Medium, Confirmed)

Evidence: `src/stores/persistence.ts:66-67,112-126,128-138`: every mutation (including `streaming` toggles, `markSeen`, each watering record) resets a 250 ms timer; on flush each entry is `JSON.stringify`'d to compare with the last string, and, if changed, the whole collection is `JSON.parse`'d again (`:121`) and written as one IndexedDB value (structured clone). Examples: `sales_data` (all items) rewritten when one sale is marked seen; `watering_records_data` (every record of every plant) rewritten per watering; `plants_all` rewritten after each optimistic upsert (twice: optimistic and reconcile). `store.$hydrate` reads entries one by one.

Root cause: whole-collection snapshots with string diffing instead of per-entity or per-key writes.

Fix: store one IDB key per entity for large collections (watering per plant: `watering:<plantId>`; plants/sales keep list but exclude volatile flags), write only dirty keys (track dirty plant ids in `watering` store), skip `JSON.parse(JSON.stringify())` roundtrip (storage already clones; pass `toRaw` snapshot). Keep the envelope contract (`{data,timestamp,keepOnClear}`).

Impact: avoids multi-hundred KB serialization on hot paths, smoother optimistic UI on low-end phones. Effort M. Dependencies: none.

##### FE-11 Lists: full render, deep reactivity, per-keystroke filter+sort (Medium, Confirmed render / Suspected scale)

Evidence: `ItemsOverview.vue:95-141` renders every card with `v-for` in a CSS grid (no virtual scroll, no `content-visibility`). Each card is a `ProgressiveImage` (own component, watcher, two `new Image()` loads, `ion-img`) plus `ion-icon`s. Stores keep all arrays as deep reactive state (`stores/sales.ts:34`, `plants.ts:42`, `resource.ts`), `ItemsOverview.filteredItems` is a second deep-reactive copy in `data()` (`:250`), `SearchBar` emits with `:debounce="0"` (`SearchBar.vue:6`) so every keystroke runs `baseSearchFilter` + sort (`ItemsOverview.vue:294-312`, `Utils.baseSearchFilter`) and re-diffs the grid. Sales can reach hundreds to thousands of items across 9 shops (CLAUDE.md lists 4 mock shops, `git log` shows five more added).

Root cause: lists treated as small; no windowing; reactive proxying for immutable server snapshots.

Fix: (a) `shallowRef`/`markRaw` for `sales.items`, `plants.items` replaced wholesale (mutations are already replace-style except `markSeen`/`isNew`, which can become a `seenIds` set); (b) `content-visibility: auto; contain-intrinsic-size` on `.tag-card` (CSS only) or `ion-infinite-scroll`/chunked rendering (render first 60, grow on scroll); (c) debounce search 150 ms and compute `filteredItems` as a computed instead of mutated data; (d) in `ProgressiveImage`, use `loading="lazy"` and skip the low-res pass for off-screen cards (interaction with the image agent: 2 requests per card).

Impact: initial render and scroll cost drop on large catalogs; lower memory. Effort M. Dependencies: image agent for (d).

##### FE-12 PlantDetails re-entry refetch and duplicate substrate triggers (Low, Confirmed)

Evidence: `PlantDetails.vue:93-99` `ionViewWillEnter` passes `refetch = this.hasEntered` so every later entry does `GET /plants/:id` (force) regardless of cache age, e.g. returning from the image or edit modal flows or from navigation back. `loadPlantData` (`:...`, "fullSubstrate") and the `substrateRefId` watcher (`:111-118`) both call `getSubstrate`; non-forced `getSubstrate` uses the cached list (`substrates.ts:113-120`) so usually no extra request, but if the list lacks the id it issues `GET /substrates/:id` twice.

Root cause: re-entry refresh is unconditional; two code paths load the same dependent resource.

Fix: refetch only when `isStale` per plant (store `fetchedAtById`), use `coalesced(this, "one:"+id)` in `fetchOne` (both stores) so concurrent calls share one request.

Effort S.

##### FE-13 Watering store hydrate race and freshness (Low, Confirmed)

Evidence: `watering.ts:329-340`: 3 workers each see `Object.keys(this.byPlantId).length === 0` and each await `$hydrate()` concurrently (separate coalesce keys per plant), so IDB is read 3 times and `apply` (`:303-306`) assigns `state.byPlantId = data` which can overwrite a record list fetched meanwhile by a faster worker. `apply` also sets `loadedAt` of every plant to the single max timestamp, so records fetched days apart look equally fresh.

Fix: hydrate once through `coalesced(this, "hydrate", ...)` before starting workers; store per-plant timestamps inside the persisted entry. Effort S.

##### FE-14 Fonts (Low, Confirmed)

Evidence: `src/theme/fonts.ts` imports the full variable packages; dist contains 5 woff2 files (latin, latin-ext, vietnamese for Bricolage; latin, latin-ext for Figtree, about 100 KB total) all matched by workbox `globPatterns` (`vite.config.ts:19`) and precached on SW install even though `unicode-range` would download only latin in normal use. No `<link rel="preload" as="font">` in `index.html`; the CSS is in the entry bundle's stylesheet, but the text only appears after mount, so the font download starts after JS execution (FOUT at the end of an already long chain).

Fix: import only `@fontsource-variable/*/wght.css` latin subsets (`.../latin-wght.css`) or self-host the two latin files, preload them via a small Vite `transformIndexHtml` plugin (hashed names), `globIgnores` the extra subsets. Effort S. Saves about 40 KB precache and one waterfall step.

##### FE-15 Sales stream recomputation (Low, Confirmed)

Evidence: `stores/sales.ts:72-85` `visibleSales` builds `new Set(items.map)` + filter and `filteredSales` copies and sorts (`applySalesQuery`) on every `incoming.push` (`:158-160`); `SalesOverview.mappedSales` (`:146-158`) maps every sale with `formatPrice` (an `Intl.NumberFormat` per call, check `utils/formatPrice.ts`) and `ItemsOverview` re-sorts and re-renders. During a long stream with k events and n items this is O(k * n log n) plus DOM diffs. `addPricePoint` rewrites an array per sale.

Fix: buffer events (flush at most every 250 ms or per animation frame), keep a cached `Intl.NumberFormat`, do not render partial list when `presorted` with sort by price (or show a count only until complete). Effort S.

##### FE-16 Admin health loaded repeatedly (Low, Confirmed)

Evidence: `TabsPage.vue:86-94` loads `/sales/health` on every TabsPage mount for admins; `AdminDashboard.vue:114-116` and `ScraperHealth.vue:135-137` call `load()` again on mount; `adminHealth.load` (`:58-65`) has no `coalesced`/TTL. Also `SideMenu` uses the same data. Fix: `ensureLoaded` with `coalesced` + short TTL, explicit force on pull-to-refresh. Effort S.

##### FE-17 Luxon and dead dependencies (Low, Confirmed)

Evidence: `vendor-luxon` 70 KB raw is modulepreloaded; imported by `utils/utils.ts:1` (5 `DateTime` uses), `utils/relativeTime.ts:1`, `components/admin/SourceRow.vue:57`. `utils/utils.ts` is in the entry graph. `package.json` lists `@capacitor/app|haptics|keyboard|status-bar` and `terser` (no imports in `src`; Vite 8 uses its own minifier), plus `workbox-window` (only needed if imported; `virtual:pwa-register` pulls it, fine).

Fix: replace the few Luxon calls with `Intl`/`Date` helpers already present in `utils/localDate.ts`, or lazy-import Luxon where used; remove unused Capacitor plugins and `terser` unless native builds need them. Effort S. Saves about 20 KB gz on first load.

##### FE-18 Animations on layout/paint properties (Low, Confirmed)

Evidence: `Accordion.vue:163-166` animates `grid-template-rows` (layout every frame, content-size dependent); `StateBlock.vue:115,147-152` shimmer animates `background-position` on 6 skeleton cards (paint per frame, not compositor); `ProgressiveImage.vue:161-162` `filter: blur(10px)` on each loading card image (extra GPU layers for the whole grid at once); `ItemsOverview.vue:423-425` transitions `box-shadow` on cards. `WateringStatus.vue` water-fill uses transform/opacity (fine); reduced-motion is respected in most places.

Fix: shimmer via a transformed pseudo-element (`translateX`), skip blur on grids (use opacity), keep accordion but cap duration or use `interpolate-size`/height with `will-change` only while animating. Effort S.

##### FE-19 Service worker (Low, Confirmed)

Evidence: `vite.config.ts:17-40`: precache `**/*.{js,css,html,woff2,png,svg,ico}` includes all route chunks, `en` and `de` locale chunks, all font subsets (first install downloads about 1 MB gz); `registerType: "autoUpdate"` with `immediate: true` and `skipWaiting`/`clientsClaim` implied: an update activates and reloads the open tab, which can drop an unsaved form; uploads use `CacheFirst` with 200 entries, but `ProgressiveImage` requests `url?size=128` and `url`, so each photo takes two entries (100 images effective) and the low-res entries are rarely reused after the high-res arrives; no runtime caching for `/api/` GET (offline relies on the IDB store layer, acceptable, but there is no stale-while-revalidate to shorten first load after `isStale`).

Fix: exclude non-active locale chunk and extra font subsets from precache (runtime `StaleWhileRevalidate` for locale), switch to `registerType: "prompt"` with an update toast, give the uploads cache two caches or lower maxEntries weight for `?size=` variants. Effort S. Interaction: image agent (size variants).

---

#### Checked and found fine

- Route lazy loading: every view is `() => import(...)`; `TabsPage` and views are separate chunks (`router/index.ts:12-35`). Debug view is excluded from production by route array gating.
- Locale loading: `import.meta.glob("./locales/*.{ts,js}")` is lazy; only the active locale is fetched at boot (`main.ts:39-49`), dedupe via `ongoingLoads` in `LocalizationService`.
- Ionic imports are named from `@ionic/vue`; icons are named imports from `ionicons/icons` (central `theme/icons.ts`), tree-shaking works (no whole-icon-set in the bundle).
- Chart.js registration is selective (`LineChart.vue:24`, `PieChart.vue:30`); the issue is chunk placement only (FE-1).
- Store loading discipline: `resource.ts` `coalesced` dedupes concurrent loads, `ensureLoaded` returns early when fresh (24h prod / 6h dev TTL, `utils/utils.ts:21-23`), in-memory then IDB then network. Plants, substrates, components, fertilizer types, sales and care guide all follow it. SSE streams are closed on done/error (`apiUtils.ts:301-327`).
- Refresh-token logic dedupes concurrent refreshes (`session.ts:37,141-146`).
- Listener and observer cleanup: `OfflineBanner` (resize + connectivity), `SearchBar`, both charts and `Calendar` (`watchTheme`) all disconnect in `beforeUnmount`; timers (`WaterRound.lastRoundTimer`, `MoreInfo.doneTimer`, `OfflineBanner.timer`, `WateringStatus.settleTimer`) are cleared. No `setInterval` and no polling anywhere in `src`.
- `v-for` keys are stable ids (`ItemsOverview.vue:96`).
- `deep: true` watchers are limited to chart data (`LineChart.vue:77`, `PieChart.vue:92`, small arrays) and `FormComponent.fieldErrors`.
- Frontend stays on Options API as required (enforced by a test); no heavy work in templates beyond `t()` calls, which are cheap map lookups.
- nginx basics: hashed assets `immutable` 1y, `sw.js` and `index.html` `no-cache`, SPA fallback, healthcheck, upstream keepalive, SSE-friendly `proxy_read_timeout`.
- Docker: multi-stage build, pnpm cache mount, frozen lockfile, `.dockerignore` excludes `node_modules`, `dist`, `.env`, `coverage`.
- docker-compose: only the frontend publishes a port, backend `service_healthy` dependency.
- Build target `es2022`/`safari15` is reasonable; no sourcemaps are emitted in the production config; `cssCodeSplit` default (per-chunk CSS) is on.

#### Interactions with the image pipeline (not audited)

- `ProgressiveImage.vue:90-100` issues two requests per card (`?size=128` then full URL). On a grid of N cards that is 2N requests through nginx to Node (FE-9) and 2N SW cache entries (FE-19).
- `loading="lazy"` / IntersectionObserver gating is missing, so off-screen cards load images immediately (`ion-img` has its own IO, but the `new Image()` preloads in `processImage` bypass it).

#### Route and view API map

Auth guard on every `requiresAuth` navigation: `session.ensureAuthenticated()` -> IDB token; `POST /auth/refresh-token` only when no token (cold start with cookie). `Utils.closeAllOpenModals()` runs on every navigation (no network).

| Route | View | Endpoints (on enter / mount) | Endpoints (user actions) |
|-------|------|------------------------------|--------------------------|
| `/` | redirect to `/login` | none | none |
| `/login` | `Login.vue` | `POST /auth/refresh-token` (via `ensureAuthenticated`, when no token) | `POST /auth/login`, `POST /auth/register`, `POST /auth/login/guest` |
| `/tabs` (shell) | `TabsPage.vue` + `SideMenu` | IDB only (sales restore, calendar, layout, snap settings); admin: `GET /sales/health` | `POST /auth/logout` |
| `/tabs/plants` | `PlantOverview.vue` | `GET /plants` (if not fresh); `GET /watering/plant/:id` once per personal plant (N+1, 3 parallel) | `GET /substrates` (open add modal), `POST /plants`, `POST /images/plant/:id` + `GET /plants/:id`; pull to refresh: forced `GET /plants` |
| `/tabs/plants/water` (`/water`, `/tabs/water` redirect) | `WaterRound.vue` | `GET /plants`, `GET /watering/fertilizer-types`, `GET /watering/plant/:id` xN (blocking), `GET /recognition/status` | `POST /watering/batch`, `POST /watering/batch/delete`, `POST /recognition/match`, `POST /recognition/snapshots/:id/confirm`, `GET /watering/plant/:id` and `GET /plants/:id` (forced after snap), `PATCH/DELETE /watering/:recordId`, `DELETE /images/:id` |
| `/tabs/plants/details/:id/:public` | `PlantDetails.vue` | `GET /plants` (if not loaded), `GET /plants/:id` (if missing, and forced on every re-entry), `GET /substrates` (list), `GET /substrates/:id` (if not in list), `GET /watering/plant/:id`, `GET /watering/fertilizer-types`, care guide: `POST /auth/ticket` + SSE `GET /more-info?plantName&lang` (auto, 24h cache) | `PATCH /plants/:id`, `DELETE /plants/:id`, `POST/PATCH/DELETE /images/...`, `POST /watering/:plantId`, `PATCH/DELETE /watering/:recordId` |
| `/tabs/substrates` | `SubstrateOverview.vue` | `GET /substrates`, `GET /components` | `POST /substrates`, `POST /substrates/:id/components`, `POST /images/substrate/:id` |
| `/tabs/substrates/details/:id/:public` | `SubstrateDetails.vue` | `GET /substrates`, `GET /substrates/:id` (forced on refresh or when missing), `GET /components` | `PATCH /substrates/:id`, `PATCH /substrates/:id/components`, `DELETE /substrates/:id`, images |
| `/tabs/components` | `ComponentOverview.vue` | `GET /components`; fineness: `GET /components/fineness-levels` (when form opens) | `POST /components`, `POST /images/component/:id` |
| `/tabs/components/details/:id/:public` | `ComponentDetails.vue` | `GET /components`, `GET /components/:id` (missing or forced), `GET /substrates` | `PUT /components/:id`, `DELETE /components/:id`, images |
| `/tabs/sales` (`/sales` redirect) | `SalesOverview.vue` | `POST /auth/ticket` + SSE `GET /sales` (only if cache missing or stale; IDB restore first) | pull to refresh: forced stream |
| `/tabs/sales/details/:id` | `SalesDetails.vue` | same store `load` (no request when fresh); no per-sale endpoint | forced stream on refresh |
| `/tabs/admin` | `AdminDashboard.vue` | `GET /sales/health` (also loaded by shell) | `POST /sales/health/:key/check` |
| `/tabs/admin/scrapers` | `ScraperHealth.vue` | `GET /sales/health` | `POST /sales/health/:key/check` (sequential in "check all"), fallback `GET /sales/health` |
| `/profile` | `Profile.vue` | none (session store) | `PATCH /auth/me`, `DELETE /auth/me`, `POST /auth/logout` |
| `/tabs/debug` | `Debug.vue` (dev only) | none | `GET /plants` (forced), `GET /plants/:id`, image upload |
| `*` and `/tabs/*` | `NotFound.vue` | none | none |

#### Suggested order of work

1. FE-1 (S, immediate 68 KB gz win), FE-5 (S), FE-7 (S), FE-8/FE-9 (S).
2. FE-3 and FE-4 together with a visualizer pass (M).
3. FE-2 with a backend summary endpoint (M), then FE-6 and FE-11 (M), FE-10 (M).
4. Remaining Low items as cleanup.


---

## Appendix C: Image pipeline audit (IMG-n)

### Image pipeline performance audit (read-only)

Scope: backend upload/storage/serving, scraped sale images, API payloads, frontend rendering, PWA and nginx caching.
Paths are relative to the repo root unless stated. Frontend files are under `frontend/src`, backend under `backend/src`.

#### One-paragraph diagnosis

The pipeline has one stored variant (webp, max 1024 px wide) and one URL per image (`/uploads/<type>/<file>.webp`, served by `@fastify/static`). The frontend's "progressive" component assumes a resizing endpoint (`?size=128`) that the static route does not have, so the "low resolution" step is a full-size download under a second cache key. Every card then starts two eager `new Image()` downloads regardless of viewport, ignoring the lazy loading that `ion-img` is meant to provide. Nothing tells the browser the image dimensions or a dominant colour, nothing fades in, and the swap from placeholder to image goes through a blank `ion-img` frame. Together this produces pop-in, random appearance order, blur flashes and heavy bandwidth.

#### Frame by frame: what happens today (list card, plant or substrate or component or sale)

1. Card renders. `.tag-media` has `aspect-ratio: 4/3` (ItemsOverview.vue:444-450), so layout is stable. `ProgressiveImage` shows `PlantPlaceholder` (`showPlaceholder` is true because `currentSrc` is empty, ProgressiveImage.vue:63-65).
2. Same tick, `processImage` (ProgressiveImage.vue:78-110) creates `new Image()` with `url?size=128` and sets `src`. This fires immediately for EVERY card in the grid, visible or not (no IntersectionObserver gate, no pagination or virtualisation in `ItemsOverview` ul.grid at line 95).
3. For uploads, the server ignores `?size` (static plugin, app.ts:109-113), so this is the full 1024 px webp. For sales it is the shop's original URL with `size=128` appended (shops ignore it).
4. `lowResImg.onload` (line 97): `currentSrc = lowResUrl`. Now `showPlaceholder` flips false and `<ion-img v-else>` mounts. `ion-img` only sets its inner `<img src>` after its own IntersectionObserver callback, so for at least one frame the container shows neither placeholder nor image (blank), then the (cached) image appears abruptly. No fade, no `decoding="async"`.
5. Simultaneously `fetchHighRes(url)` starts a second `new Image()` for the URL without `?size`. Different URL means different HTTP cache key and a different Service Worker cache entry, so the same bytes are downloaded a second time.
6. While step 5 runs, the visible image has class `is-loading` (`filter: blur(10px)`), so a full-quality image is shown blurred, then un-blurs over 0.2 s when the duplicate download finishes (ProgressiveImage.vue:159-163). Visible as flash and "sharpening".
7. Large images are decoded on first paint on the main thread (no `img.decode()`), which can stall scrolling as cards enter.

Detail hero and banner (DetailHero.vue, DetailsBanner.vue): same component, same sequence, in a `min(40vh,360px)` box. Gallery (HorizontalGallery.vue:19-26): same, 168 px square boxes. Enlarged photo (ImageModal.vue:51-61): bare `ion-img` of the full file, no placeholder, no low-res step, opens blank then pops in. Small thumbs in watering round, picker and snap sheet (RoundList.vue:12, PlantPickerModal.vue:15, SnapMatchSheet.vue:34,65): plain `<img>` with `loading="lazy"` (the first two; SnapMatchSheet has none), fixed box but no placeholder behind it, no fade, full 1024 px file in a ~40 px box.

---

#### Findings

##### IMG-1 Low-res step is fake: `?size=` is not honoured on `/uploads/*`, causing double full-size downloads
- Severity: Critical. Status: Confirmed.
- Evidence: frontend ProgressiveImage.vue:90-96 appends `size=${lowResSize}`; backend app.ts:109-113 serves `/uploads/` with `@fastify/static` which ignores the query; the only resizing code is `LocalImageStorage.readAsWebp` (LocalImageStorage.ts:128-144) behind `GET /api/v1/images/:entityType/:entityId?size=` (imageRoutes.ts:~64, imageController.ts:~108), and no frontend code calls that route (grep for `/images/` shows only POST/PATCH/DELETE in ImageService.ts). Image URLs in all payloads are `/uploads/...` (SQLiteImageRepository.ts:16-19, SQLitePlantRepository.ts:162).
- Root cause: the client-side "progressive" design depends on a size-variant contract that was never implemented for the URL actually handed to clients. There is exactly one stored variant and no variant addressing scheme.
- Fix (end to end): generate variants at upload time and make them first-class. On `processUpload` produce e.g. 64/160 (list thumb, with 1x/2x), 480, 1024 widths as webp (plus optional AVIF), stored as `name.w160.webp` etc. Return from the API an `image` object `{ id, url (1024), variants: [{w, url}], width, height, placeholder }` for list and detail payloads (see IMG-3, IMG-4). The frontend then emits `<img srcset sizes>`. Backfill existing files with a one-off migration script (0003) using sharp. Remove the `?size=` convention and the dead `/images/:type/:id?size=` route (or keep it only as an authenticated fallback).
- Layers: backend images module (storage, use cases, repository, payload), DB (new columns or variants table), frontend ProgressiveImage.
- Impact: removes the duplicate download per image (about 2x bytes today), cuts list-card bytes by roughly 10-30x (1024 px to 480 px at 2x grid is still 4-8x smaller; 160 px thumbs far more).
- Effort: L. Dependencies: IMG-3, IMG-4, IMG-10 (cache keys).

##### IMG-2 Every card eagerly downloads two images via `new Image()`, defeating lazy loading and ordering
- Severity: Critical. Status: Confirmed.
- Evidence: ProgressiveImage.vue:92-93 and 117-119 create `Image` objects with `src` set synchronously in a `watch immediate` handler (lines 66-74); no viewport check. ItemsOverview.vue:95-99 renders all items in one grid, no virtualisation or windowing.
- Root cause: image fetching is driven by JS component state, not by the browser's native image pipeline. The browser cannot prioritise, defer or cancel it by viewport.
- Fix: render a real `<img>` (or `<picture>`) with `srcset`/`sizes`, `loading="lazy"`, `decoding="async"`, intrinsic `width`/`height`, and `fetchpriority="high"` + `loading="eager"` only for the detail hero (LCP) and the first row of a list. Drop the manual preloaders entirely. Fade in via the `load` event (class toggle, opacity transition) over a placeholder that stays mounted underneath. Keep `PlantPlaceholder` as the always-present background layer and only fade the photo in on top.
- Layers: frontend ProgressiveImage plus callers.
- Impact: only visible images load; first rows load first; no thundering herd of N or 2N concurrent requests (HTTP/1.1 nginx proxy has 6 connections per host, so order today is arbitrary); removes the main cause of "wrong order of appearance".
- Effort: M. Dependencies: pairs with IMG-1 for the biggest gain.

##### IMG-3 No intrinsic dimensions or aspect ratio in payloads or DOM (except list cards)
- Severity: High. Status: Confirmed.
- Evidence: `images` table has only id, image_url, entity_type, entity_id, upload_date (0001_baseline.ts:55-60, SQLiteImageRepository.ts:4-5); payload `ImageRecord`/`ImageRef` carries `{id,url,date}` only (Image.ts:26-32); no `width`/`height` attributes on any `<img>`/`ion-img` (RoundList.vue:12, PlantPickerModal.vue:15, SnapMatchSheet.vue:34,65, ImageModal.vue:51). List cards and hero reserve space only via fixed boxes (ItemsOverview.vue:444-450, DetailHero `.media` height), so CLS is avoided there by cropping with `object-fit: cover`, not by knowing the ratio. The enlarged modal and any natural-ratio display cannot reserve space.
- Root cause: metadata computed during sharp processing is thrown away (`toFile` result, which contains width/height, is ignored, LocalImageStorage.ts:128-134).
- Fix: store `width`, `height` (and see IMG-4 placeholder) as columns on `images`, from `toFile()` info; expose in all payloads; set `width`/`height` attributes and `aspect-ratio` in CSS. Backfill via the same script as IMG-1.
- Layers: DB migration, storage adapter, repository/mappers, API types, frontend.
- Impact: eliminates layout shift in the modal, gallery variants and any future masonry/natural layouts; lets the browser compute `sizes` correctly.
- Effort: M. Dependencies: IMG-1.

##### IMG-4 No placeholder for the photo itself (no blurhash/LQIP/dominant colour); placeholder disappears before the image is visible
- Severity: High. Status: Confirmed.
- Evidence: placeholder is a generic illustration seeded by id (PlantPlaceholder.vue), replaced via `v-else` (ProgressiveImage.vue:2-9) as soon as `currentSrc` is set, before `ion-img` has rendered an `<img>`; `ion-img` loads lazily via its own observer, so there is a blank frame. `.is-loading` blur applies to the real (already full) image, not to a low-fi preview (ProgressiveImage.vue:159-163). Thumbs (RoundList.vue:12) show nothing behind the image until it loads.
- Root cause: low-fidelity preview is expected to come from a network request rather than being embedded with the data.
- Fix: at upload compute a tiny placeholder (4x3 blurhash string, or a 16 px webp data URI of about 300 bytes, plus the dominant colour) and ship it in the list/detail payloads. Render it as CSS `background` (colour) plus an inline blurred layer on the container, keep it mounted, and cross-fade the real `<img>` over it on `load`. For sales (hotlinked) there is no placeholder available; keep the illustration until load, but fade it out only after the photo `load` event.
- Layers: backend processing + DB column + payload; frontend ProgressiveImage.
- Impact: removes the empty-frame flash and the "pop" appearance; perceived load becomes instant for cached lists.
- Effort: M. Dependencies: IMG-3 (same migration/backfill).

##### IMG-5 `ion-img` inserts a blank frame and is used where a native `<img>` is needed
- Severity: Medium. Status: Suspected (behaviour of the Ionic web component is from its documented implementation; not run).
- Evidence: ProgressiveImage.vue:5-11 and ImageModal.vue:51-61 use `ion-img`. It sets the inner `img src` only after an IntersectionObserver callback, emits `ionImgDidLoad`/`ionError`, and does not support `srcset`, `sizes`, `fetchpriority`, `decoding`, or `width/height`. With a non-empty `alt` (gallery, modal) browsers can show alt text for the interval before `src` is set.
- Root cause: component chosen for lazy loading convenience, but it blocks the native features needed here.
- Fix: replace with a native `<img>` inside the new component (see IMG-2); keep `ion-img` nowhere.
- Layers: frontend. Impact: removes blank frame and alt-text flash; enables srcset/priority. Effort: S (done together with IMG-2). Dependencies: IMG-2.

##### IMG-6 Blur filter transition on a full-size image, no decode control
- Severity: Medium. Status: Confirmed (code), jank magnitude Suspected.
- Evidence: ProgressiveImage.vue:159-163 `.is-loading { filter: blur(10px); transition: filter .2s }`; no `img.decode()`/`decoding="async"`; every list card transitions a blur on a 1024 px bitmap, forcing offscreen compositing layers.
- Root cause: blur-up was bolted onto the full-size image instead of a tiny preview (see IMG-4).
- Fix: remove blur on the real image; use opacity-only fade (compositor-friendly) on load, and `decoding="async"` (or `await img.decode()` before toggling the visible class for the hero). Respect `prefers-reduced-motion` (a `utils/motion.ts` exists).
- Layers: frontend. Impact: smoother scroll and no sharpening flash. Effort: S. Dependencies: IMG-2/IMG-4.

##### IMG-7 Stored image quality settings: `nearLossless` webp inflates files; no AVIF; no orientation handling
- Severity: High (orientation), Medium (size). Status: Confirmed (code); size delta Suspected (not measured on production-like data; seeded mock files are tiny, median 12 KB, max 442 KB).
- Evidence: LocalImageStorage.ts:128-134 `sharp(buffer).resize({width:1024,withoutEnlargement}).toFormat('webp').webp({quality:70, nearLossless:true})`. With `nearLossless` true libwebp uses its (much larger) near-lossless mode and `quality` no longer means lossy quality. There is no `.rotate()` so EXIF orientation is dropped while metadata is stripped (sharp default), producing sideways photos from phones; the recognition module does call `.rotate()` (MatchSnapshot.ts:33, OnnxEmbedder.ts:26, PixelEmbedder.ts:10), so embeddings and stored image can disagree. Allowed upload types are png/jpeg only (multipartUpload.ts:12), so HEIC from iPhones is rejected rather than transcoded.
- Root cause: the pipeline was tuned for correctness of "one file" with no variant strategy; orientation and mode flags were not reviewed.
- Fix: `.rotate()` first; lossy webp (quality about 75-80, `effort 4`) for display variants, optional AVIF (quality about 50) with `<picture>` fallback; accept HEIC/WebP/AVIF via sharp; cap source pixels (`limitInputPixels`) to bound memory. Keep an original only if needed (not currently needed).
- Layers: backend storage adapter. Impact: smaller files (typically 2-4x vs near-lossless) and correct orientation. Effort: S-M. Dependencies: IMG-1 (variant generation shares the code path).

##### IMG-8 Uploaded files served with revalidate-every-time headers in the app server (dev, serve.js, direct deployments); nginx fixes it only in the Docker path
- Severity: High. Status: Confirmed (static config); header specifics are Suspected until observed on the wire.
- Evidence: app.ts:109-113 registers `@fastify/static` with no `maxAge`, `immutable` or `cacheControl` options (plugin defaults: `Cache-Control: public, max-age=0`, ETag and Last-Modified on). nginx.conf:/uploads/ adds `expires 30d` plus `Cache-Control public, max-age=2592000, immutable`, so the Docker deployment is fine. `frontend/serve.js` (proxies `/uploads/`, lines 7, 46) and direct backend access (dev stack, `isolated dev` stack) get max-age=0, so every image view triggers a conditional request (304) and any image in an `<img>` created after navigation waits a round trip, causing late pop-in. Filenames are unique and never mutated (`Date.now()-name-hash.webp`, LocalImageStorage.ts:111-112), so `immutable` is safe at the source.
- Root cause: caching policy lives only in the reverse proxy, not at the origin.
- Fix: set `maxAge: '365d', immutable: true` on `fastifyStatic` (keep nginx `expires` as is, but drop its duplicate `add_header` so a single Cache-Control is emitted; nginx `expires` and `add_header Cache-Control` together currently emit two Cache-Control headers). Add `Vary: Accept` only if AVIF negotiation is added.
- Layers: backend app, nginx.conf, serve.js. Impact: warm loads become instant from memory/disk cache, no 304 chatter. Effort: S. Dependencies: none.

##### IMG-9 Authenticated image route is slow-path, uncached by validators, and marks private data `public`
- Severity: Medium. Status: Confirmed (code); currently unused by the client, so low runtime impact today.
- Evidence: imageController.ts:~108-123 and LocalImageStorage.ts:136-152: each request decodes the file with sharp and re-encodes to webp, no ETag/Last-Modified, `Cache-Control: public, max-age=86400` although the route requires auth and the entity may be private (`ImageAccessPolicy`). Also `/uploads/*` itself has no auth at all, so private plants' photos are reachable by anyone who knows the URL (names contain a 48-bit random hash, unguessable but not access-controlled).
- Root cause: two serving paths (public static vs authenticated resize) with different semantics.
- Fix: delete the resize route once variants exist (IMG-1); keep one serving path. If privacy matters, serve private-entity variants through an authenticated route with `private, max-age` and ETag, or use signed URLs. Otherwise document that URLs are capability URLs.
- Layers: backend. Impact: removes per-request CPU re-encode and a confusing second contract. Effort: S-M. Dependencies: IMG-1.

##### IMG-10 Service Worker runtime cache keyed by full URL; CacheFirst only for same-path uploads; sale photos never cached
- Severity: Medium. Status: Confirmed (config), effect on user Suspected.
- Evidence: vite.config.ts:25-36 `CacheFirst` for `url.pathname.startsWith('/uploads/')`, `maxEntries: 200`, only status 200. Because IMG-1 creates two URLs per image (`?size=128` and plain), each image consumes two of the 200 entries, so the cache holds about 100 distinct images and evicts early. Sale images are cross-origin hotlinks (SaleMapping.ts:34, scrapers), not covered (opaque responses have status 0, which `cacheableResponse: {statuses:[200]}` rejects), so they refetch from the shops on every cold session. `PUBLIC_BASE_URL` pointing at another origin would also bypass the pattern's CORS assumptions.
- Root cause: caching policy not aligned with an addressable-variant URL scheme.
- Fix: after IMG-1, key by immutable variant URLs and set `maxEntries` to match expected library size (about 500-1000 small thumbs), `purgeOnQuotaError: true`. For sales see IMG-11.
- Layers: frontend build config. Impact: fewer evictions, offline thumbs. Effort: S. Dependencies: IMG-1, IMG-11.

##### IMG-11 Sale (shop) images are hotlinked originals, often huge, with a bogus `size` query appended
- Severity: High. Status: Confirmed (hotlinking and no proxying); sizes Suspected (depends on shops).
- Evidence: scrapeHelpers.ts:63-103 stores the first src/srcset candidate and explicitly unwraps optimizer proxies "to the original image" (`/cdn-cgi/image/width=3840,...` becomes the original), `Sale.sale_image_url` is passed straight to the client (Sale.ts:23-44,62), no proxy or caching in backend. Frontend adds `&size=128` (ProgressiveImage.vue:90-91), which shops ignore (Shopify uses `width=`), so the card downloads the original twice (two cache keys). Cold list of shop items fans out to many third-party origins with no preconnect (index.html has none), no priority control, and no dimensions. Referrer policy `strict-origin-when-cross-origin` (nginx.conf) can trigger hotlink blocks on some shops, falling back to the placeholder after a failed request.
- Root cause: sale images are treated like local images; scraper picks the largest source on purpose and there is no image intermediary.
- Fix: scraper stores a sized candidate when the source supports it (Shopify `?width=`, srcset width selection nearest 480). Better, an image proxy/cache endpoint in the backend: fetch once per sale at scrape time, normalise to the same variant set as uploads (webp 160/480), store dominant colour/blurhash/dimensions in the sale row, serve with immutable caching. Remove the `size=` hack for external URLs. Add `referrerpolicy="no-referrer"` to hotlinked fallbacks if the proxy is skipped.
- Layers: backend sales scraping + storage, DB, frontend. Impact: largest bandwidth win on the Sales tab; consistent pop-in behaviour; works offline via SW. Effort: L. Dependencies: IMG-1/3/4 share the variant pipeline.

##### IMG-12 List payloads carry all images of every entity; list cards use only the newest
- Severity: Medium. Status: Confirmed.
- Evidence: plant list joins all images per plant and returns `images[]` plus `image_url` (SQLitePlantRepository.ts:26-80,153-187); substrates and components same pattern (SQLiteSubstrateRepository.ts:182-189, SQLiteComponentRepository.ts:105-110). Cards use only `imageUrl` (PlantMapping.ts:37, SubstrateMapping.ts:26, ComponentMapping.ts:24). Substrate and component `image_url` is "last row wins", plants use latest explicitly; consistent in practice because rows are ordered `upload_date, id`.
- Root cause: one DTO for list and detail; no cover-image concept.
- Fix: list endpoints return only a `cover` image object (id, thumb variants, dims, placeholder); detail endpoints return the full `images` array. Cover rule defined server side once.
- Layers: backend repositories/DTOs, frontend mappers. Impact: smaller list JSON, fewer join rows; and gives a natural home for IMG-3/4 metadata. Effort: M. Dependencies: IMG-3/4.

##### IMG-13 Small thumbs and modal: raw full-size files in tiny boxes, no placeholder, no fade
- Severity: Medium. Status: Confirmed.
- Evidence: RoundList.vue:11-14 and PlantPickerModal.vue:14-16 use `<img :src="imageUrl" loading="lazy">` (full 1024 px webp into a ~40 px circle; CSS at RoundList.vue:152-170); SnapMatchSheet.vue:34 and :65 have no `loading` attribute. ImageModal.vue:51-61 loads the full image with no placeholder, no spinner, and transform-based zoom on a bitmap that has not been decoded.
- Root cause: no shared image component; each view hand-rolls an `<img>`.
- Fix: one `AppImage` (or the reworked ProgressiveImage) with a `variant` prop (`thumb`, `card`, `hero`, `full`), used everywhere. The modal passes the already-loaded card variant as instant placeholder, then swaps to `full` on `load`.
- Layers: frontend. Impact: consistency, bytes, no pop-in in the watering round (the most image-heavy flow, since all due plants render at once). Effort: M. Dependencies: IMG-1, IMG-2.

##### IMG-14 Whole-list image concurrency and no list windowing
- Severity: Medium. Status: Suspected (depends on collection size).
- Evidence: ItemsOverview.vue:95-99 renders every item; sales arrive over SSE and append in batches (stores/sales.ts around :145-148 `incoming`), so new cards mount and immediately start downloads. Combined with IMG-2 this is the main source of "random order" appearance.
- Fix: after IMG-2 native lazy loading is enough for hundreds of items; add `content-visibility: auto` on `li` cards for large lists; only consider virtual scroll past about 500 items.
- Layers: frontend. Impact: lower memory and decode work. Effort: S. Dependencies: IMG-2.

##### IMG-15 Upload path memory and blocking behaviour
- Severity: Low. Status: Confirmed.
- Evidence: `attachFieldsToBody: true` buffers the whole 10 MB part (imageRoutes.ts:~47-52, multipartUpload.ts:38), `sharp(file.buffer)` and EXIF parse run inline in the request (LocalImageStorage.ts:121-134), then recognition embedding runs through the `onStored` listener. Fine for a single-user/low-volume app; no queue.
- Fix: when variants are added (IMG-1), generate them in one sharp pipeline (`.clone()` fan-out from one decode) and respond once the main 1024 variant exists, finishing smaller variants in the same request (cheap) or lazily. Add `sharp.limitInputPixels`.
- Layers: backend. Impact: bounded upload latency after adding variants. Effort: S. Dependencies: IMG-1.

##### IMG-16 Per-image decode on `Date.now()` filenames, orphan variants on replace/delete
- Severity: Low. Status: Suspected (future risk).
- Evidence: `storage.remove` deletes exactly one file by basename (LocalImageStorage.ts:154-164, ImageUseCases.ts:185-227).
- Fix: when variants exist, `remove` must delete all variants by prefix; the cleanup migration (0002_purge_orphan_images.ts) should cover them.
- Layers: backend. Effort: S. Dependencies: IMG-1.

#### Suggested end-to-end design (one coherent change)

1. Backend: one sharp pipeline per upload: `.rotate()`, strip metadata, widths 160/480/1024 (webp, lossy q about 78; optional AVIF), compute width/height, dominant colour and a tiny blur preview. Persist `width`, `height`, `placeholder` columns on `images`; variants addressed by deterministic name suffix so no extra table is needed.
2. API: replace `image_url` plus full `images[]` in list payloads with `cover`; detail payload carries `images[]` each with `{id, url, srcset, width, height, placeholder, date}`. Sales get the same shape through a proxied/cached copy.
3. Serving: static plugin with `maxAge 365d, immutable`; delete the `?size=` route; single Cache-Control header in nginx.
4. Frontend: one `AppImage` component: placeholder layer always mounted, native `<img>` with `srcset/sizes/width/height/decoding=async/loading`, opacity fade on `load`, `fetchpriority=high` for hero and first row; used by ItemsOverview, DetailHero, DetailsBanner, gallery, ImageModal, thumbs.
5. SW: CacheFirst for variant URLs, `maxEntries` sized to the library.

Recommended order: IMG-8 (S, immediate win) then IMG-2/5/6 (frontend only, kills double download and ordering problems even before backend variants exist: just stop the `?size` request) then IMG-7 + IMG-1/3/4/12/13 as the variant project, then IMG-11.

Quick win without any backend change: delete the `?size=` low-res preload from ProgressiveImage (stops the duplicate download), use a native lazy `<img>` with fade-in over the still-mounted placeholder.

#### Checked and found fine

- List and grid cards reserve space with `aspect-ratio: 4/3` (ItemsOverview.vue:444-450); gallery tiles (168 px) and hero (`min(40vh,360px)`) have fixed boxes; no cumulative layout shift from these.
- Stored files get unique, never reused filenames (timestamp + random hash), so `immutable` caching is safe; nginx `/uploads/` and `/assets/` caching is correct for the Docker deployment; `/sw.js` and `index.html` correctly `no-cache`.
- Uploaded photos are converted to webp and capped to 1024 px width with `withoutEnlargement`; EXIF capture date extraction is robust; PII filename anonymisation is solid.
- Upload size cap (10 MB) is enforced at nginx (12 MB) and multipart limits; MIME allow-list validated server side.
- Generated SVG letter tiles from scrapers are filtered out in `SaleMapping.realPhoto` so they never hit the image path.
- `UploadField` creates and revokes object URLs correctly (UploadField.vue:127-146).
- Failed image loads fall back to the placeholder (`failed` flag, ProgressiveImage.vue:5, 82-86), so no broken-image icons.
- `PlantPlaceholder` is inline SVG (no network), so it paints with the first frame; its tint is seeded by id, so list and detail match.
- `navigateFallbackDenylist` excludes `/uploads/` and `/api/` from SW navigation fallback; precache glob does not include user photos.
- Gallery order is newest first with a stable tie-break (HorizontalGallery.vue:~88-90); backend orders images `upload_date, id` consistently, and the plant cover is deterministically the newest.


---

## Appendix D: Backend and database audit (BE-n, DB-n)

### Backend and database performance audit (read-only)

Scope: `backend/` (Fastify 5, Kysely 0.29, better-sqlite3 12, Winston). Images internals and the sales list end to end are covered by other agents; only general observations are noted here. Paths are relative to `backend/` unless prefixed. Nothing was run; every "Confirmed" is traced in source.

Glossary: "list payload" = body of a collection GET; "read-after-write" = the extra SELECT done after INSERT/UPDATE to build the response.

#### 0. Executive summary

The backend is lean at the framework level (no per-request logging, in-memory session check instead of a DB lookup, one synchronous SQLite connection with WAL, explicit column lists, no SELECT *). The costs are structural and sit in the data shape and the API contract:

1. The plants list carries no watering summary, so the client issues one `GET /watering/plant/:id` per plant (HTTP N+1) to compute due state (BE-1, High).
2. List endpoints are unpaginated, return every image of every item, and the public tab returns every public plant and substrate of every user (BE-2, BE-3).
3. Indexes do not match the WHERE/ORDER BY patterns: `substrates` has no secondary index, `plants(user_id)` is not seekable, FK columns used by cascades are unindexed, and `ANALYZE`/`PRAGMA optimize` never runs (DB-1 to DB-4).
4. Sales scraping runs on demand per SSE request with no in-flight de-duplication and a 24 h cache (BE-4); HTML parsing and bcryptjs run on the main thread (BE-6, BE-7).
5. No compression, ETag or Cache-Control in the app itself; docker nginx compensates for gzip only, and probably produces conflicting Cache-Control for `/uploads` (BE-5, BE-9).
6. Logs have no rotation (BE-10); the compose stack has no memory limits for Chromium + ONNX + sharp (BE-12).

#### 1. Findings

Severity scale: Critical = outage or data loss; High = user-visible latency or load that grows with data; Medium = measurable waste or scalability limit; Low = hygiene.

##### BE (backend/API)

###### BE-1 Watering due state needs one HTTP request per plant
- Severity High | Status Confirmed
- Evidence: `src/modules/plants/infrastructure/SQLitePlantRepository.ts:27-48` (list select has no watering columns); `src/modules/watering/presentation/wateringRoutes.ts:19` (`GET /plant/:plantId` is the only read path); `frontend/src/stores/watering.ts:96-111` (`ensureRecordsFor`, 3 parallel workers, one request per plant), `:82-93`.
- Root cause: the watering state ("last watered", rhythm, due, overdue) is a derived read model that the API does not expose; the client reconstructs it from full per-plant history. 20 plants = 20 requests + 20 history payloads (unbounded, no ORDER BY, no LIMIT: `SQLiteWateringRepository.ts:43-49`) just to show one line each. Each request also pays auth (2 to 3 JWT verifies) and a join to `plants`.
- Fix (fits layers): add `lastWateredAt` (and `lastFertilizedAt`) to the plant list row via a correlated subquery or LEFT JOIN on `idx_watering_history` in `SQLitePlantRepository.plantRows()`, exposed through `Plant`/`PlantData`. Optionally add `GET /watering?plantIds=` (batch, grouped, capped to N most recent per plant) in `SQLiteWateringRepository` for the calendar/records screens. Keep `GET /watering/plant/:id` for the detail view and add `ORDER BY wr.date DESC` plus optional `limit`.
- Impact: removes N requests per plants-tab load and per refresh/after watering round (`refetchPlants`, `watering.ts:258-281`); the biggest single win for the plants tab.
- Effort M. Dependencies: frontend watering store/stat util change (frontend audit), DB-1.

###### BE-2 Plants and substrates lists: unbounded, all images per row, merged in JS
- Severity High (grows with users) | Status Confirmed
- Evidence: `SQLitePlantRepository.ts:55-73` (`findAllPublic` all public rows of all users; `findAllByUser`); `PlantUseCases.ts:73-86` (two queries then JS dedup); `SQLitePlantRepository.ts:32-34` and `152-190` (LEFT JOIN images fans out one row per image, grouped in JS); substrates `SQLiteSubstrateRepository.ts:21-45, 50-56`.
- Root cause: list and detail share one "fat" query; the list returns the whole image history although only the latest image is shown; public data is returned in full each time and filtered client-side; no cursor/limit.
- Fix: (a) one query `WHERE is_public = 1 OR user_id = ?` (two indexes, SQLite uses multi-index OR) instead of two + JS dedup; (b) list returns `image_url` (latest) and `imageCount` through a correlated subquery; `images[]` only in `GET /:id` (the frontend detail view already refetches by id, verify); (c) add `limit`/`cursor` (created_at, id) on the public scope, keep own scope unpaginated or generous; (d) in the repository replace JS grouping with `json_group_array` subselects or a second `WHERE entity_id IN (...)` images query.
- Impact: payload and row count drop roughly by the average images per plant; public tab stops scaling with the whole user base.
- Effort M (L if the public tab is paginated in UI). Dependencies: frontend contract (list item needs only latest image), DB-1, DB-2.

###### BE-3 Substrate list builds a components x images cartesian product
- Severity Medium | Status Confirmed
- Evidence: `SQLiteSubstrateRepository.ts:21-45` joins `substrate_components` and `images` in one query, then dedups with `Array.find` per row (`:173, :182`), O(rows x components).
- Root cause: two independent one-to-many relations joined in the same SELECT. A substrate with 7 components and 5 photos returns 35 rows; the whole list multiplies.
- Fix: load substrates, then components (`WHERE substrate_id IN (...)`) and images separately (or `json_group_array` subselects) and assemble with Maps.
- Impact: rows drop from c x i to c + i per substrate; removes quadratic `.find`.
- Effort S. Dependencies: none.

###### BE-4 Sales scraping is request-driven, not de-duplicated, 24 h cache, no refresh job
- Severity High | Status Confirmed (general note; end-to-end trace belongs to the sales agent)
- Evidence: `modules/sales/presentation/salesRoutes.ts:27-39` (cache created per router, `NodeCacheAdapter()` default TTL 86 400 s, `core/cache/NodeCacheAdapter.ts:19`); `BaseScraper.ts:78-137` (check cache, then fetch, then `cache.set`; no in-flight map); `application/FetchSalesOverview.ts:60-107` (every SSE request enqueues every source x page: 15 sources, 1 to 5 pages each, Chromium limit 2, axios limit 8); `HttpFetcher.ts:121-127` (about 2.5 s of fixed `waitForTimeout` per Chromium page).
- Root cause: scraping is a side effect of a user's stream opening; cache stampede protection and scheduling are absent. Two clients (or one client reconnecting/pull-to-refresh) on a cold cache run every scrape twice, double Chromium contexts, and `bypassCache` health rechecks bypass nothing shared. First user after TTL pays the full latency; after a restart the cache is empty (in-memory).
- Fix: a `SalesRefresher` application service owning the cache: single-flight `Map<key, Promise>` inside `BaseScraper.fetchPage`; stale-while-revalidate (serve cached items immediately, refresh in the background); scheduled refresh (setInterval or cron-like, e.g. every 1 to 3 h with jitter) started from `server.ts` and stopped on `onClose`; persist the last result (SQLite table or file) so restarts are warm and price history/NEW flags can be derived server side (see section 4).
- Impact: removes cold-start latency for users, halves-to-N-fold the outbound traffic and Chromium load under concurrency, enables server-side NEW/price history.
- Effort M to L. Dependencies: sales end-to-end audit, DB schema for persisted items.

###### BE-5 No compression, ETag or cache headers on API responses
- Severity Medium | Status Confirmed
- Evidence: `package.json` dependencies (no `@fastify/compress`, no `@fastify/etag`); `src/app.ts:62-114` (plugin list: cors, cookie, rate-limit, static); only image serving sets `Cache-Control` (`imageController.ts:36-38`). `frontend/nginx.conf:26-28` enables gzip for json in the docker stack only.
- Root cause: transport optimisations were left to the reverse proxy; the PM2/bare-node deployment path (`ecosystem.config.js`, `scripts/start.js`) and dev have none. Large lists (BE-2) are sent uncompressed and are re-sent in full on every refresh, because no validator exists.
- Fix: register `@fastify/compress` (threshold about 1 KB; keep SSE excluded: it already uses `hijack`, but verify `text/event-stream` is not compressed) and a lightweight ETag for GET JSON (`@fastify/etag` or a weak ETag computed in an `onSend` hook for `GET` lists) with `Cache-Control: private, no-cache`. Keep nginx gzip but then avoid double compression (nginx skips already encoded responses).
- Impact: payload -70 to -85 % for JSON lists on non-nginx deployments; 304 for unchanged lists (the PWA refreshes lists often).
- Effort S. Dependencies: none.

###### BE-6 CPU-heavy synchronous HTML parsing on the main thread
- Severity Medium | Status Suspected (parsing sites traced, not measured)
- Evidence: `node-html-parser` use in `modules/sales/infrastructure/scrapers/strategies/{Selector,JsonLd,Heuristic}Strategy.ts`, `scrapeHelpers.ts`; `moreInfo/infrastructure/PlantLinkSearchers.ts` (3 searchers per care guide request, HTML parse). Parsing a full shop page is tens of ms and fully synchronous; a cold sales load parses up to about 30 pages back to back.
- Root cause: parsing shares the event loop with API requests and SSE writes.
- Fix: BE-4's scheduled refresh already moves it off the user path; additionally run strategies in a `worker_threads` pool (or `piscina`) behind the existing `ExtractionStrategy` interface if refresh time shows event-loop lag (`perf_hooks.monitorEventLoopDelay` to verify).
- Impact: removes latency spikes during scrapes. Effort M. Dependencies: BE-4.

###### BE-7 bcryptjs (pure JS) cost 10 for hash/compare
- Severity Medium | Status Confirmed
- Evidence: `package.json` (`bcryptjs`), `AuthUseCases.ts:83, 99, 163`, cost `core/config/constants.ts:34`.
- Root cause: bcryptjs runs on the main thread (it yields between rounds but still consumes the loop, roughly 50 to 100 ms CPU per op); a login burst blocks all other requests. Rate limit (50 per IP per 15 min) bounds but does not remove it.
- Fix: native `bcrypt` (libuv threadpool) or `node:crypto.scrypt` with a hash-version prefix and rehash-on-login. Behind `UserRepository`/use case, no layer change.
- Impact: login/register no longer stall concurrent requests. Effort S. Dependencies: none.

###### BE-8 SpeciesResolver is rebuilt (and the species table reloaded) for every create/update
- Severity Low | Status Confirmed
- Evidence: `SQLitePlantRepository.ts:53` (factory) and `:88, :116` (`this.speciesFor(trx)` creates a new `SpeciesResolver`), `SpeciesResolver.ts:61-108` (index cache lives on the instance, loaded via `catalog.all()` then linear Levenshtein over all species).
- Root cause: per-call instantiation defeats the cache that exists in the class.
- Fix: look up exact match in SQL first (`species.name` is UNIQUE NOCASE, indexed) and run fuzzy matching only on miss; or hold a long-lived resolver and invalidate on `add`.
- Impact: one fewer full-table read per plant write; small. Effort S.

###### BE-9 Conflicting Cache-Control for uploads behind nginx
- Severity Medium | Status Suspected (header composition reasoned from config, not captured)
- Evidence: `src/app.ts:109-114` (`@fastify/static` defaults: `cacheControl` on, `maxAge` 0 so `Cache-Control: public, max-age=0`, ETag, Last-Modified); `frontend/nginx.conf:56-65` (`expires 30d` plus `add_header Cache-Control "...immutable"` are added in addition to the upstream header; nginx `add_header` does not replace proxied headers, `proxy_hide_header Cache-Control` is absent).
- Root cause: caching policy defined in two places. Browsers may honour the first `max-age=0` and revalidate every image, losing the 30 day policy.
- Fix: serve uploads with `maxAge: '30d', immutable: true` (filenames are `Date.now()-name-hash.webp`, `LocalImageStorage.ts:104-122`, so URLs are content-unique) in `fastifyStatic`, and add `proxy_hide_header Cache-Control;` in nginx `/uploads/`. Verify with `curl -I` against the compose stack.
- Impact: repeat views of plant images become zero-request. Effort S. Dependencies: image agent (URL immutability on PATCH).

###### BE-10 Winston file transports without rotation; every 4xx logged at warn
- Severity Medium | Status Confirmed
- Evidence: `src/core/logging/logger.ts:140-148` (`File` transports without `maxsize`/`maxFiles`/`tailable`), `core/middleware/errorHandler.ts:79-83` (all operational 4xx warn, including 401 and 404 probes), `docker-compose.yml` volume `plantcare-logs`. Local `logs/` is only 720 KB, but growth is unbounded; scrapers add warn/error lines per fallback.
- Root cause: logging config assumes external rotation.
- Fix: `maxsize` + `maxFiles` (+ `zippedArchive`) or log to stdout only in containers; downgrade expected 401/404 to debug or sample them.
- Impact: bounded disk, less synchronous-ish format work under scanning. Effort S.

###### BE-11 In-memory sessions and tickets: O(n) work for guests, tickets never swept, lost on restart
- Severity Low | Status Confirmed
- Evidence: `core/auth/sessions.ts:36-42` (`liveSessions` filters and reallocates the whole array on every `has/create/count`; guest user id 0 may hold up to `MAX_GUEST_SESSIONS = 1000`, `constants.ts:30`), `:48` (`shift()` loop), `:70-86` (tickets are removed only when presented; expired unused tickets stay in the Map). Because both access and refresh checks use the Map (`tokens.ts:83-91`, `AuthUseCases.ts:123`), every restart/deploy logs everyone out.
- Root cause: arrays instead of sid-keyed Maps; no sweeper; no persistence.
- Fix: `Map<number, Map<sid, expiresAt>>` with lazy expiry on access and a periodic `unref`'d sweep for tickets; optional persistence of sessions in a `sessions` table if restart logouts matter (they cause a refresh failure storm after deploy).
- Impact: negligible CPU today (guest requests allocate up to 1000-element arrays); mainly reliability. Effort S.

###### BE-12 Compose/Docker: no resource limits, unbounded browser/ONNX/sharp memory
- Severity Medium | Status Confirmed
- Evidence: `docker-compose.yml` backend service (only `shm_size: 512m`, no `mem_limit`/`cpus`/`pids_limit`); `Dockerfile` (single Node process runs API, Chromium via Playwright, ONNX session, sharp; `UV_THREADPOOL_SIZE` default 4 shared by fs, sharp, crypto, DNS). `multipart attachFieldsToBody` buffers each upload (max 10 MB, `uploadErrors.ts:18`) in RAM, then sharp.
- Root cause: one process hosts all heavy workloads without limits or priority.
- Fix: set `mem_limit` (e.g. 1.5 to 2 GB) and `NODE_OPTIONS=--max-old-space-size`; set `UV_THREADPOOL_SIZE=8`; close the Chromium browser after idle (currently a singleton kept open, `HttpFetcher.ts:23-47`); consider moving scraping into a separate container/worker once BE-4 lands.
- Impact: prevents OOM-kill taking the API down during scrapes. Effort S.

###### BE-13 Recognition: embedding of new images is best effort and unbounded per match
- Severity Low | Status Confirmed
- Evidence: `recognition/index.ts:41-45` (fire-and-forget `embedStored`); `OnnxEmbedder.ts:12, 64-65` (queue capped at 8, extra jobs rejected with `EmbedderBusyError`, logged by `EmbedImagesService.embedStored` at `EmbedImages.ts:19-22`, and only repaired by `backfill()` at next boot, `recognitionRoutes.ts:22-26`); `SQLiteEmbeddingRepository.ts:18-33` (all vectors of the user loaded and copied per match; fine at hundreds, linear after).
- Root cause: no retry/outbox for missed embeddings; per-request full scan of user vectors. Also `app.log` is a no-op logger here (Fastify `logger` not enabled), so the backfill warning is silently dropped (`recognitionRoutes.ts:25`).
- Fix: run `backfill()` periodically (or on a queue when a job is rejected); cache the user's vector matrix in memory keyed by user and invalidated on image add/delete if match volume grows.
- Impact: correctness of matches after bulk uploads; negligible perf today. Effort S.

###### BE-14 JWT verified two to three times per authenticated request
- Severity Low | Status Confirmed
- Evidence: `core/middleware/auth.ts:20-29` (`isValidAccessToken` then `readAccessSession`, each runs `jwt.verify`), `:114-125` (guest hook verifies a third time on unsafe methods before the route hook), `tokens.ts:73-91`.
- Root cause: validity and session-lookup implemented as two functions that both verify.
- Fix: verify once, keep the decoded payload on `request` (set by the global `onRequest` hook), reuse in route hooks and the guest rule.
- Impact: HS256 verify is about tens of microseconds: tiny, listed for hygiene. Effort S.

###### BE-15 Read-after-write and chatty use cases
- Severity Low | Status Confirmed
- Evidence: plant create (assert substrate + species load + insert + `findById` with joins, `PlantUseCases.ts:100-118`), update (`findById`, assert, update, `findById`, `:121-140`), substrate update (`findById`, update, deleteComponents, `findById`, `SubstrateUseCases.ts:122-143`), watering create/update (`WateringUseCases.ts:127-170`). Component/substrate component writes loop `await insert` per row in a transaction (`SQLiteSubstrateRepository.ts:111-120, 131-141`; `SQLiteWateringRepository.ts:121-131`).
- Root cause: use cases return the full read model by re-querying instead of building it from the write result; per-row inserts instead of a multi-row insert.
- Fix: return the re-read inside the same transaction, multi-row `insertInto(...).values([...])`. Per query cost is microseconds with better-sqlite3, so only matters for batches of 200 (`/watering/batch`).
- Impact: small. Effort S.

###### BE-16 Response serialization is generic JSON.stringify; no response schemas
- Severity Low | Status Confirmed
- Evidence: no `schema:` options on any route (e.g. `plantsRoutes.ts:22-26`); validation is zod inside use cases (`core/validation/index.ts`); controllers build objects with `Plant` class and return them (`plantsController.ts`). Custom JSON content-type parser (`app.ts:77-90`) replaces Fastify's secure parser.
- Root cause: schema-less routes forfeit `fast-json-stringify` (2 to 5x faster than `JSON.stringify` on large lists) and Fastify's built-in body parsing safeguards.
- Fix: add response schemas for the list endpoints (plants, substrates, components, watering) after BE-2 settles the shape; derive from zod with `zod-to-json-schema` or hand-write. Only worth it once lists are large.
- Impact: lower CPU on large lists and stricter output (drops accidental fields). Effort M.

###### BE-17 No global API rate limit; heavy endpoints limited only by queue size
- Severity Low | Status Confirmed
- Evidence: `core/middleware/rateLimit.ts:23-26` (`global: false`); limiters only on auth, tickets, AI stream (`authRoutes.ts:64-80`, `moreInfoRoutes.ts:33-37`). `POST /images/*` (sharp) and `POST /recognition/match` (sharp + ONNX) have none beyond `MAX_PENDING_EMBEDS = 8`. Store is the plugin's in-process LRU: fine for one instance.
- Fix: add per-user limiters (preHandler) on upload/match; keep the in-memory store (single instance by design).
- Impact: bounds CPU abuse. Effort S.

##### DB (database)

###### DB-1 Indexes do not match the list queries on `plants`
- Severity High (moderate data, but a full scan plus sort per list) | Status Confirmed
- Evidence: migration `0001_baseline.ts:101` creates only `idx_plants_list(is_public, user_id)`. Queries: `WHERE p.is_public = 1 ORDER BY p.created_at DESC` (`SQLitePlantRepository.ts:55-62`) needs a temp B-tree sort; `WHERE p.user_id = ?` (`:65-72`) cannot seek on an index whose first column is `is_public` (SQLite skip-scan needs `sqlite_stat1`, DB-4); `watering ownedPlantIds` (`SQLiteWateringRepository.ts:39-40`) and `createMany` (`:113-118`), recognition `vectorsForUser` (`SQLiteEmbeddingRepository.ts:24`) all filter `plants.user_id`. FK columns `plants.substrate_id` and `plants.species_id` are unindexed, so deleting a substrate (`ON DELETE SET NULL`) scans `plants`.
- Root cause: index designed for one query shape and never revisited.
- Fix (new migration `0006_*`): `CREATE INDEX idx_plants_user ON plants(user_id, created_at DESC)`; `CREATE INDEX idx_plants_public ON plants(created_at DESC) WHERE is_public = 1` (partial); `CREATE INDEX idx_plants_substrate ON plants(substrate_id) WHERE substrate_id IS NOT NULL`; drop `idx_plants_list` if unused after the change.
- Impact: list queries become index-ordered with no sort; cascades/joins stop scanning. Effort S. Dependencies: BE-2 (query shape).

###### DB-2 `substrates` and `substrate_components` have no secondary indexes
- Severity Medium | Status Confirmed
- Evidence: `0001_baseline.ts:35-42` (no index), queries `WHERE s.is_public = 1` / `WHERE s.user_id = ?` (`SQLiteSubstrateRepository.ts:51, 55`), `isSubstrateUsableBy` (`SQLitePlantRepository.ts:141-149`, OR across `is_public`/`user_id`); `substrate_components` PK is `(substrate_id, component_id)` so lookups by `component_id` (FK check when deleting a component, cascade `ON DELETE CASCADE`) scan.
- Fix: `CREATE INDEX idx_substrates_user ON substrates(user_id)`, `CREATE INDEX idx_substrates_public ON substrates(created_at) WHERE is_public = 1`, `CREATE INDEX idx_substrate_components_component ON substrate_components(component_id)`.
- Impact: avoids full scans on every substrate list and component delete. Effort S.

###### DB-3 `images` lookup index lacks sort columns; FK-less polymorphic table
- Severity Low | Status Confirmed
- Evidence: `idx_images_lookup(entity_type, entity_id)` (`0001_baseline.ts:102`) is used by all joins, but every query then sorts by `upload_date, id` (`SQLitePlantRepository.ts:59-60`, `SQLiteImageRepository.ts:34-35`). `images` has no FK to its entity (orphans needed migration `0002_purge_orphan_images.ts`); `DeleteProfileUseCase` (`AuthUseCases.ts:183-187`) cascades plants through the FK but never removes their image rows/files, so orphans reappear.
- Fix: `idx_images_lookup(entity_type, entity_id, upload_date, id)` (covering order); call image cleanup for the user's entities on profile delete. Also `users.id` deletion fails with a FK error if the user owns substrates (`substrates.user_id REFERENCES users(id)` without `ON DELETE`), `0001_baseline.ts:41`: a correctness bug found on the way (Confirmed by schema; not executed).
- Impact: removes per-lookup sort; avoids orphan growth. Effort S.

###### DB-4 No statistics: `ANALYZE` / `PRAGMA optimize` never runs
- Severity Medium | Status Confirmed
- Evidence: `core/database/db.ts:38-48` (pragmas set, no `optimize`); grep finds no `ANALYZE`/`optimize` in `src`.
- Root cause: without `sqlite_stat1` the planner guesses selectivity; skip-scan, join order and multi-index OR are not chosen reliably.
- Fix: run `PRAGMA optimize` on `closeDb()` and once at startup after migrations, and `PRAGMA optimize=0x10002` after migrations; cheap.
- Impact: better plans as data grows. Effort S.

###### DB-5 Connection pragmas: missing `busy_timeout`, `wal_autocheckpoint`/journal size
- Severity Low | Status Confirmed
- Evidence: `db.ts:38-48` sets WAL, FK, `synchronous = NORMAL`, `cache_size = -64000`, `temp_store = MEMORY`, `mmap_size = 128 MB`. No `busy_timeout`, no `journal_size_limit`. Another connection (the dev seed `ctx.sql`, `db:import` CLI, backups) would hit `SQLITE_BUSY` immediately.
- Fix: `busy_timeout = 5000`, `journal_size_limit = 64 MB`. 64 MB page cache and 128 MB mmap are generous for a DB measured in KB to MB; harmless but counted against the container memory (BE-12).
- Impact: robustness. Effort S.

###### DB-6 Static lookup tables queried per request
- Severity Low | Status Confirmed
- Evidence: `findFertilizerTypes` (`SQLiteWateringRepository.ts:59-62`), `findFinenessLevels` (`SQLiteComponentRepository.ts:51-54`), role lookup per registration (`SQLiteUserRepository.ts:32-39`), `users.role` join per login.
- Fix: memoize in the repository (these tables are seed-only; invalidate never) and send `Cache-Control: private, max-age=3600` on the two GETs.
- Impact: tiny; one fewer request per app start for the client. Effort S.

###### DB-7 Watering history unbounded and unordered
- Severity Medium | Status Confirmed
- Evidence: `SQLiteWateringRepository.ts:43-49` (`findByPlant` no ORDER BY, no LIMIT; join with `plants` may defeat `idx_watering_history` order). Over years a daily-watered plant has thousands of rows, and BE-1 multiplies it by the number of plants.
- Fix: `ORDER BY wr.date DESC, wr.id DESC`, optional `from`/`limit`, keep `idx_watering_history`; for due-state use the aggregate in BE-1 so history is fetched only on the detail/calendar screen (and by range).
- Impact: bounds payload; deterministic order. Effort S. Dependencies: BE-1.

###### DB-8 JSON columns and SELECT *
- Severity none | Status Confirmed fine
- `scrape_source_health.issues` is JSON text parsed per row (`SQLiteSourceHealthRepository.ts:16-25`), at most about 20 rows: fine. No `SELECT *` anywhere (explicit columns in Kysely and the raw `COLUMNS` string).

#### 2. Endpoint table

Auth key: none = public; opt = optional bearer (guest or anon sees public only); user = bearer JWT plus in-memory session; admin = user + admin role; ticket = one-time SSE ticket in `?ticket=`. Guests are blocked on all unsafe methods by the global hook (`auth.ts:114-126`). "Q" = SQL statements per request (sync better-sqlite3, one connection); read-after-write SELECT included.

Prefix `/api/<version>` (default v2).

| Method | Path | Auth | Queries (Q) | Response shape / size concerns |
|---|---|---|---|---|
| GET | /health | none | 1 (`SELECT 1`) | tiny |
| GET | /health/ready | none | 1 | tiny |
| POST | /auth/register | none, IP + account limiter | 3 (find, role select(s), insert) + bcryptjs | tiny; CPU (BE-7) |
| POST | /auth/login | none, IP + account limiter | 1 (users JOIN roles) + bcryptjs | tiny |
| POST | /auth/login/guest | none, IP limiter | 1 | tiny |
| POST | /auth/refresh-token | refresh cookie | 0 | tiny |
| POST | /auth/ticket | user, ticket limiter | 0 | tiny; ticket Map not swept (BE-11) |
| POST | /auth/logout | cookie | 0 | 204 |
| PATCH | /auth/me | user | 2 (username check, update) + bcryptjs | null |
| PATCH | /auth/:id | admin | 2 | null |
| DELETE | /auth/me | user | 1 + FK cascades (plants, watering) | 204; leaves image rows/files, fails if substrates exist (DB-3) |
| GET | /plants | opt | 2 authed, 1 anon (public + own, JS dedup) | all public plants of all users + own, each with all images; unbounded (BE-2) |
| GET | /plants/:id | opt | 1 (joined rows per image) | one plant with images |
| POST | /plants | user | 4 to 5 (substrate check, species table read, species insert on miss, insert, read-back) | one plant |
| PATCH | /plants/:id | user | 4 to 5 (read, substrate check, species read, update, read-back) | one plant |
| DELETE | /plants/:id | user | 1 delete + 2 image cleanup (select, delete) + file unlinks | 204 |
| GET | /watering/fertilizer-types | user | 1 | 2 rows, static (DB-6) |
| GET | /watering/plant/:plantId | user | 1 (join plants, ft) | all records of one plant, no ORDER/LIMIT; called once per plant (BE-1, DB-7) |
| POST | /watering/batch | user | 2 + N inserts in one transaction (N up to 200) | ids |
| POST | /watering/batch/delete | user | 3 (select, delete in transaction) | 204 |
| GET | /watering/:id | user | 1 | one record |
| POST | /watering/:plantId | user | 2 (insert-select, read-back) | one record |
| PATCH | /watering/:id | user | 2 | one record |
| DELETE | /watering/:id | user | 1 | 204 |
| GET | /substrates | user | 2 (public + own, JS dedup) | substrates x components x images cartesian rows (BE-3); unbounded public scope |
| GET | /substrates/:id | user | 1 | one substrate |
| POST | /substrates | user | 2 | one substrate |
| PATCH | /substrates/:id | user | 3 to 4 | one substrate |
| POST | /substrates/:id/components | user | 3 + N inserts (transaction) | one substrate |
| PATCH | /substrates/:id/components | user | 3 + N inserts (transaction) | one substrate |
| DELETE | /substrates/:id | user | 1 + 2 image cleanup; plants.substrate_id scan (DB-1) | 204 |
| GET | /components | user | 1 | all components with all images; unbounded but small, admin-curated |
| GET | /components/fineness-levels | user | 1 | 3 rows, static (DB-6) |
| GET | /components/:id | user | 1 | one component |
| POST | /components | admin | 2 | one component |
| PUT | /components/:id | admin | 2 | one component |
| DELETE | /components/:id | admin | 1 + 2 image cleanup; substrate_components scan (DB-2) | 204 |
| POST | /images/:entityType/:entityId | user | 2 to 3 + file + sharp + embedding job | `{path,date}` (image agent) |
| GET | /images/:entityType?entityId= | user | 2 | list of image records |
| GET | /images/:entityType/:entityId | user | 2 | one image, `size` param, `Cache-Control: public, max-age=86400` (image agent) |
| PATCH | /images/:id | user | 3 | one image record |
| DELETE | /images/:id | user | 3 | 204 |
| DELETE | /images/:entityType/:entityId | user | 3 | 204 |
| GET | /uploads/* | none (static) | 0 | file; Cache-Control conflict behind nginx (BE-9) |
| GET | /sales | ticket (SSE) | 0 per cache hit; 2 health writes per page-1 miss | streamed batches of <= 16 KB; scraping on demand (BE-4) |
| GET | /sales/health | admin | 1 | about 15 rows |
| POST | /sales/health/:key/check | admin | 2 (health upsert and read) + live scrape | one health row |
| GET | /more-info | ticket (SSE, loads user from DB) | 1 + health writes | streamed AI text + 3 link searches, per-user limiter 20 per 15 min |
| GET | /recognition/status | user | 0 | tiny |
| POST | /recognition/match | user | 1 (all user vectors) + sharp + ONNX | candidates (5) |
| POST | /recognition/snapshots/:id/confirm | user | 3 to 4 + file copy | created record |

#### 3. SQLite and bootstrap review

Checked and fine:
- better-sqlite3 single synchronous connection, WAL, `foreign_keys = ON`, `synchronous = NORMAL` (`db.ts:34-48`). Kysely `SqliteDialect` serializes queries over it; transactions are short and contain only DB work (no network awaits inside a transaction).
- Graceful shutdown closes the DB (WAL checkpoint), Chromium and Fastify (`server.ts:34-53`).
- No `SELECT *`; explicit column lists everywhere; ownership checks pushed into SQL (`WHERE user_id = ?`, `INSERT ... SELECT ... WHERE EXISTS`, `SQLiteWateringRepository.ts:65-72`).
- Auth is cheap per request: HS256 verify + in-memory `Map` session check, no DB or session-table hit (except SSE `loadUserFromDb`, one indexed lookup). Role is carried in the token.
- No Fastify request logger (default `logger: false`), so no per-request log serialization; Winston is only used for events/errors. `AsyncLocalStorage` per request is a small constant.
- Rate-limit store is in-process (correct for a single instance); CORS callback is O(origins); body limit 100 KB for JSON and 10 MB for uploads; trustProxy limited to one hop.
- CORS/cookie/static plugins registered once at root; route plugins are encapsulated; `@fastify/multipart` is registered only inside images and recognition.
- Migrations are idempotent and run once at boot before listen; migration `0002` does file IO but only at first run.
- No cron/background interval in the API except: `TempSnapshotStore` sweep (60 s, `unref`'d), SSE heartbeats (20 s per open stream, cleared on end/abort), node-cache check periods (1 h). Scrape health writes are single synchronous upserts. No leaks found there.
- `Dockerfile`: multi-stage, prod-only deps, non-root `node` user, healthcheck against `/health/ready`, model pinned by checksum, headless shell only. `NODE_ENV=production` set; `headlessBrowser` forced on in production (`env.ts:79`); Winston level is `info` in production and console `warn` (`logger.ts:127-155`), the dev `debug` level and verbose dev format do not leak into the image. Dev-only behavior is limited to the dev server (`src/tools/devServer.ts`) and the `localhost` CORS allowance (`app.ts:95-97`, gated by `!isProduction`); error stacks and request bodies are only added when `isDev`.
- `ecosystem.config.js`: single instance (required, because sessions, rate limit and caches are in-process).
- Dev setting that can leak: `headless_browser` env name is lower case (`env.ts:79`) and only read outside production; harmless.

#### 4. Precompute candidates (heavy per-request computation)

| Derived value | Today | Proposal |
|---|---|---|
| Watering due / last watered / fertilized | computed in the client from full per-plant history (BE-1) | SQL aggregate in the plants list read model; rhythm fields can stay client-side |
| NEW flag on sales | not derivable on the server: `sale_scraped_at` is `new Date()` per request (`domain/Sale.ts:65`), nothing is persisted | persist items with `first_seen_at` in a table when BE-4 refresher runs; NEW = first_seen within N days |
| Price history | not stored on the server (client keeps it, per seed docs "price history charts") | `sale_price_history(sale_id, price, seen_at)` appended by the refresher when the price changes |
| Plant recognition vectors | loaded and copied per match | in-memory matrix per user, invalidated on image change (BE-13) |
| Scraper health list | fine (about 15 rows) | none |

#### 5. Dependency and sequencing

1. DB-1, DB-2, DB-3 (indexes), DB-4, DB-5: one migration plus a startup `PRAGMA optimize`. No contract change. Do first.
2. BE-5 (compress + ETag), BE-9, BE-10, BE-12: config only. Quick wins.
3. BE-1 + DB-7 + BE-2 + BE-3: plants/watering read model change; needs a coordinated frontend change (list item gets `lastWateredAt`, latest image only).
4. BE-4 (+ BE-6): sales refresher with persistence; unlocks server-side NEW and price history.
5. BE-7, BE-11, BE-14, BE-8, BE-13, BE-15, BE-16, BE-17: hygiene.
