# Wave 1 audit: PlantCare Tracker

**What it is:** a plant-care app. Express 5 + better-sqlite3 REST/SSE API (auth, plants, watering, substrates, components, images, scraped plant sales, AI care guides) and an Ionic + Vue 3 Options-API client with a two-tier cache.
**Scope:** `backend/` (TypeScript, 10.3k LOC incl. tests), `frontend/` (TypeScript + Vue, 17.2k LOC), root scripts, CI. 234 source files, 293 commits, 3 contributors. **Date:** 2026-10-07. **Phase:** 0 (audit only, no source changed).
**Coverage:** backend read in full except the four scraper strategies and the shop config table (`scrapers/index.ts`), which were sampled. Frontend: core read in full (`BaseService`, `ApiUtils`, `UserService`, router, `StorageService`, `PlantService`, `SalesServices`, `MoreInfoService`, `MoreInfo`, `PlantDetails`, `WateringRecords` script, `TabsPage`, `Debug`); the remaining 40+ components and views were sampled by lint, grep and size. All 18 documentation files were read and are treated as claims, never as evidence.
**Tools run:** `inventory.py`; `run_scanners.py` (only its built-in secret and dependency baseline ran); `pnpm audit` (both packages, full and `--prod`); ESLint (typescript-eslint 8, eslint-plugin-vue 10) with throwaway flat configs kept outside the repo; Prettier 3 `--check`; Vitest coverage (backend); behavioural probes that drive the real routers against a throwaway SQLite file (no mocks); `npm view` for version facts. **Skipped:** semgrep, bandit (not installed), frontend coverage (no provider installed), Cypress (no tests exist), a browser run of the UI, git-history secret scan.
**Evidence convention:** `file:line` always cites code that was opened. "Probe" means observed at HTTP level against the real code. "Suspected" means code reading only.

---

## 1. Executive summary

**Overall health:** the codebase is better structured than most hobby projects of its size. It has a four-layer backend, typed errors, one error envelope, parameterized SQL everywhere, SQL-level ownership scoping on watering/plants mutations, a good SSE lifecycle helper, and a frontend optimistic-mutation layer with item-scoped rollback and tests. The risk sits at the seams the tests do not cross. The backend suite mocks the database module and hand-builds its own Express app, so it cannot see authorization gaps, constraint errors, body-parser behavior or the real payloads the frontend sends. Probes against the real stack found six High issues, including a guest account any visitor can delete, private plants readable by anonymous users, an unauthorized image API, and guest login and logout returning 500 for the exact request the UI sends. The documentation has drifted far from the code (it still describes MySQL, join tables and a ticket-protected sales stream). The frontend state layer works but is a set of static singletons with a DOM event bus and three import cycles, which is the main obstacle to Pinia.

**Top risks:**
- Any visitor can delete or re-password the shared guest account (`POST /auth/login/guest` then `DELETE /auth/me`) (→ SEC-01).
- `GET /plants/:id` returns private plants to unauthenticated callers; `GET /substrates/:id` returns private substrates to any user (→ SEC-02).
- The images API has no ownership or entity checks; any registered user can overwrite or delete anyone's photos (→ SEC-03).
- The UI sends the JSON body `null` on guest login and logout; Express rejects it with 500, so guest login is unusable through the UI and logout never invalidates the server session (→ BUG-01).
- The seeded guest has `id = 0`; two falsy checks make guest refresh and SSE tickets fail with 403 (→ BUG-02).
- Backend runtime dependencies carry 17 high and 1 critical advisory (axios, multer, sharp, path-to-regexp, ip-address, express transitive) (→ DEP-01).
- The test net is too weak to refactor under: 64.4% line coverage, 0% on images storage and routes, OpenAI client, SSE core, HttpFetcher, and the suite's own 70% gate fails (→ QUAL-03).

| Metric | Value |
|---|---|
| Languages | TypeScript 58%, Vue 35%, JavaScript 5% (scripts), CSS/HTML/SQL 2% |
| Size | 234 source files, 27.9k LOC (frontend 17.2k, backend 10.3k) |
| Dependencies | backend 19 runtime + 15 dev; frontend 14 runtime + 15 dev (pnpm, lockfiles committed) |
| Tests | backend ~3.6k test LOC, coverage 64.4% lines / 68.0% functions / 58.7% branches (threshold 70/70/60 fails); frontend 6 test files, 113 tests, 4 view-reactivity tests and no other component tests, no coverage tooling |
| Lint / format | none enforced; frontend `.eslintrc.cjs` is unusable under installed ESLint 10; no Prettier config |
| CI | 2 jobs: typecheck + tests (backend), tests + build (frontend); no lint, no coverage |
| Findings | Critical 0 · High 6 · Medium 15 · Low 9 (30 total) |

---

## 2. Ranked findings

| ID | Sev | Type | Location | Issue | Fix (short) |
|---|---|---|---|---|---|
| SEC-01 | High | Security | `backend/src/modules/auth/presentation/authRoutes.ts:176-206` | PATCH/DELETE `/auth/me` lack the guest guard; guest login is public, so anyone can delete the guest user | Guest read-only guard once per authenticated scope; protect the guest row |
| SEC-02 | High | Security | `plants/application/PlantUseCases.ts:67-75`, `substrate/application/SubstrateUseCases.ts:101-109` | Single-resource GETs skip the public/own rule | One `canView` predicate; 404 when not visible |
| SEC-03 | High | Security | `images/presentation/imageRoutes.ts:73-119`, `images/application/ImageUseCases.ts:53-198` | No ownership or entity-existence checks on image upload, list, replace, delete | Ownership policy per entity type in every image use case |
| BUG-01 | High | Bug | `frontend/src/services/UserService.ts:52,64` + `backend/server.ts:71` | Frontend sends body `null`; strict JSON parser answers 500 on guest login and logout | Stop sending `null`; make the server tolerant; test through HTTP |
| BUG-02 | High | Bug | `auth/application/AuthUseCases.ts:102`, `core/middleware/auth.ts:220`, `database/database-v3-sqlite.sql:108` | Guest seeded with `id = 0`; `!userId` treats it as "not found" | Compare to `null`; stop seeding id 0 |
| DEP-01 | High | Dependency | `backend/package.json` | 1 critical + 17 high prod advisories (axios <1.20, multer <2.3, sharp <0.35.5, path-to-regexp, ip-address, form-data, proxy-addr) | Bump express, axios, multer, sharp; re-run audit |
| SEC-04 | Medium | Security | `sales/presentation/salesRoutes.ts:28` | Sales SSE has no auth; each request can start Chromium and 9 outbound scrapes | Require ticket (docs already claim it); rate-limit |
| SEC-05 | Medium | Security | `core/middleware/auth.ts:157-165`; `AuthUseCases.ts:97-121` | Access token survives logout while another session lives; invalid token answers 403; no refresh rotation; in-memory sessions | Bind access token to a session id; 401 for bad tokens; persist sessions |
| SEC-06 | Medium | Security | `moreInfo/presentation/moreInfoRoutes.ts:34`, `OpenAIClient.ts:53,75` | No per-user limit on the paid OpenAI call; open registration; cache key includes attacker-chosen `lang` | Per-user limiter, allowlist `lang`, daily budget guard |
| SEC-07 | Medium | Security | `frontend/src/components/plants/MoreInfo.vue:66`, `services/MoreInfoService.ts:123-177` | AI text becomes HTML without escaping, rendered with `v-html` | Escape before markdown conversion or sanitize with DOMPurify |
| BUG-03 | Medium | Bug | `core/middleware/errorHandler.ts:108-133` | Non-AppError failures all become 500: malformed JSON, body >100 kb, FK/UNIQUE violations, non-image upload, CORS rejection | Map `http-errors` status; translate SQLite constraint codes to 400/404/409 |
| BUG-04 | Medium | Bug | `database/database-v3-sqlite.sql:69-75`, `PlantUseCases.ts:112-119` | No FK from `images` to entities; deleting a plant leaves rows and files forever | Cleanup port on entity delete + one-off purge |
| BUG-05 | Medium | Bug | `frontend/src/utils/apiUtils.ts:226-243`, `services/UserService.ts:95-153` | Refresh flow: no single-flight (N failing requests start N refreshes), 3 retries on 403, dead `logout()` call, forced page reload | Single-flight refresh; 401 vs 403 split; one teardown path |
| BUG-06 | Medium | Bug | `frontend/src/services/base/BaseService.ts:186-198,318-338`, `MoreInfoService.ts:179-210` | Cache read-modify-write ignores L1/TTL and is unserialized; MoreInfo writes a different L2 shape | Move to Pinia stores with serialized actions (§5.3) |
| BUG-07 | Medium | Bug | `backend/scripts/migrate-sqlite.js:143-176` | Importer inserts into tables the schema seeds first (roles, users, lookups); likely aborts on UNIQUE (suspected) | Rename, truncate seeds or use `INSERT OR REPLACE`, add a fixture test |
| QUAL-01 | Medium | Quality | `backend/server.ts:17-21,129`, `tests/integration/app.test.ts:45-57` | No app factory; `server.ts` has import-time side effects; tests re-wire the app by hand and omit images and moreInfo | `createApp(deps)` + thin `main.ts` |
| QUAL-02 | Medium | Quality | `core/database/db.ts:163`, 6 dynamic `SET` builders, 3 row collapsers | Untyped casts, hand-built UPDATEs, async facade over a sync driver, schema bootstrap read from `process.cwd()` | Typed query layer + versioned migrations (§5.1) |
| QUAL-03 | Medium | Quality | `backend/tests/**` | DB module is mocked by call order; coverage 64%; 0% on images, OpenAI, SSE core, HttpFetcher; own 70% gate fails | Contract suite on real SQLite before any refactor |
| QUAL-04 | Medium | Quality | `frontend/src/services/**` | Static singleton services with global mutable state, 10 DOM listeners, 3 import cycles | Pinia, one domain at a time (§5.3) |
| QUAL-08 | Medium | Quality | repo root, CI | No lint or format; legacy ESLint config dead; CI skips lint and coverage; `.env.example` and `coverage/` mishandled by `.gitignore` | Tooling phase (§5.4) |
| DOC-01 | Medium | Docs | `backend/docs/*`, `frontend/docs/*`, READMEs | 16 documented claims contradict the code (table in §4.5) | Docs pass with each PR, final pass last |
| SEC-08 | Low | Security | `backend/server.ts:58-73`, `ecosystem.config.js:15-17`, `HttpFetcher.ts:29-33` | No helmet; PM2 default env is `development` (stack traces, request bodies logged); Chromium `--no-sandbox` | helmet; default `production`; sandbox only in containers |
| SEC-09 | Low | Security | `AuthUseCases.ts:27-30`, substrate/component schemas | Password min 1 char, username unbounded (10 000 chars accepted), names unbounded | Length limits; password >= 8, <= 72 bytes |
| SEC-10 | Low | Security | `frontend/src/router/index.ts:69-72`, `views/Debug.vue:339` | 509-line debug view routable in production, hard-coded demo credentials | Register route only in dev builds |
| BUG-08 | Low | Bug | `images/presentation/imageController.ts:47-48`, `ImageUseCases.ts:32-36`, `frontend/serve.js:109` | Absolute image URLs stored with the request `Host`; the shipped frontend proxy rewrites `Host` to `localhost:5000` (suspected) | Store relative paths; configure `PUBLIC_BASE_URL` |
| BUG-09 | Low | Bug | `OpenAIClient.ts:108-110`, `BaseScraper.ts:149`, `SQLitePlantRepository.ts:216-219,245-257` | OpenAI failure ends as `done: completed` with no content; empty scrape pages are never cached; image order has no `ORDER BY`; species upsert + plant insert not transactional | Surface error event; cache empties; order images; wrap in transaction |
| DEP-02 | Low | Dependency | `frontend/package.json` | 6 prod-path advisories are transitive build tooling (nanoid, postcss, source-map-js); `cypress` installed with no tests; npm-style `overrides` ignored by pnpm | Bump toolchain; drop or use Cypress |
| QUAL-05 | Low | Quality | 21 backend files import `express`; `sales/presentation/SseManager.ts` dead; `PlantLinkSearchers.ts:41-56` vs `HttpFetcher.ts` | Express types leak into `core`; duplicate SSE manager; duplicate fetch helpers; `asyncHandler` redundant on Express 5 | Isolate HTTP adapter; delete dead code |
| QUAL-06 | Low | Quality | 21 `process.env` reads in 9 files | No typed config module; `.env.example` is untracked so Quick Start fails | `loadConfig()` once; track `.env.example` |
| QUAL-07 | Low | Quality | `frontend/src/components/**` | 11 prop mutations, 24 unused component registrations, `t()` re-declared in 29 components, 94 `any`, 43 `console.*`, two `<script setup>` files | Frontend cleanup phase |

Order: severity, then likelihood, then blast radius. Cross-cutting items with a shared root cause are clustered (for example SEC-03 covers upload, list, replace, delete and the public static mount).

---

## 3. Detailed findings (High)

### [SEC-01] Guest account writable by anyone: High · `authRoutes.ts:176-206`
- **What:** `PATCH /auth/me` and `DELETE /auth/me` use `authenticateToken` but not `checkGuestPermission` (not imported at `authRoutes.ts:32`). `POST /auth/login/guest` is public (`:124`).
- **Impact:** any visitor obtains a guest token and deletes the shared `guest` user or changes its password. Guest login then answers 404 until the database is reseeded; `initSchema` seeds only a fresh file (`db.ts:119-126`). The docs promise the opposite: "every mutating route ... answers 403 for guest tokens" (`api-reference.md:45`).
- **Evidence (probe):**
  ```
  guest PATCH /auth/me (change guest password): 200 {"data":null}
  guest DELETE /auth/me: 204
  guest login afterwards: 404 {"error":{"type":"NotFoundError","message":"Guest user not found"...
  ```
- **Fix:** register the read-only guard once per authenticated router scope (default deny) with an explicit allowlist (`/auth/logout`, `/auth/ticket`); additionally make `SQLiteUserRepository.update/delete` refuse the `guest` role. In Fastify this is an encapsulated plugin hook (§5.2).

### [SEC-02] Single-resource GETs bypass the visibility rule: High · `PlantUseCases.ts:67-75`, `SubstrateUseCases.ts:101-109`
- **What:** `GetPlantUseCase.execute(id)` takes no user and checks neither `is_public` nor ownership. The list use cases apply the rule (`PlantUseCases.ts:48-64`). `GET /plants/:id` also runs with optional auth (`plantsRoutes.ts:25`).
- **Impact:** ids are sequential integers. An unauthenticated caller reads any private plant (name, species, owner id, images). Any authenticated user reads any private substrate.
- **Evidence (probe):** anonymous `GET /plants/1` for a private plant returns `200 {"data":{"plant_name":"secret",...}}` while `GET /plants` omits it. Another user's `GET /substrates/1` returns 200.
- **Fix:** thread `userId | null` into both use cases and apply one domain predicate `canView(entity, userId)`; answer 404 (not 403) when not visible to avoid an existence oracle.

### [SEC-03] Images API has no authorization or entity validation: High · `imageRoutes.ts:73-119`
- **What:** routes require a valid token only. `UploadImageUseCase` (`ImageUseCases.ts:53-75`) writes `(entity_type, entity_id)` without checking the entity exists or who owns it; `UpdateImageUseCase`, `DeleteImageUseCase`, `DeleteEntityImagesUseCase` (`:129-198`) act on any image id. `images` has no foreign key (`database-v3-sqlite.sql:69-75`). `/uploads` is served statically with no auth (`server.ts:77`).
- **Impact:** with open registration, any user can add, replace, list or delete photos of any plant or substrate, and add photos to the admin-only component catalogue. Private plants' photos are reachable by URL. Names are `Date.now()` plus 4 chars of `Math.random()` (`LocalImageStorage.ts:104,126`), so URLs are weakly unguessable.
- **Evidence (probe):** user B uploads to user A's private plant: 201; lists: 200 with A's image; deletes: 204; uploads to nonexistent component 999: 201.
- **Fix:** an `ImageOwnershipPolicy` resolved per entity type (plant and substrate: owner; component: admin) called by every image use case before any storage side effect; reject unknown entities with 404. Decide separately whether `/uploads` stays public (cheap, relies on unguessable names: switch to `crypto.randomUUID()`) or moves behind the authorized route (decision D6).

### [BUG-01] Guest login and logout return 500 for the UI's request: High · `UserService.ts:52,64`, `server.ts:71`
- **What:** `ApiUtils.post(url, null)` serializes `null` to the body `null` with `Content-Type: application/json` (`apiUtils.ts:216-219`). `express.json()` is strict and accepts only objects and arrays, so the body parser throws before the route runs. `errorHandler` maps the parser error to 500 (BUG-03). The existing integration tests post no body, so they never see it.
- **Impact:** guest login fails through the UI. Logout fails server-side (the UI swallows the error and clears local state), so the refresh token stays valid: after the failed logout, `POST /auth/refresh-token` with the old cookie still returned 200 in the probe. This defeats the session lifecycle fix in commit `af24270`.
- **Evidence (probe):**
  ```
  guest login, JSON body "null": 500 {"error":{"type":"InternalServerError",...
  logout with body "null": 500
  refresh after that logout still works?: 200
  ```
  Confirmed at HTTP level with the exact payload; not exercised through a browser in this audit.
- **Fix:** frontend: pass `undefined` instead of `null` (or add `ApiUtils.postEmpty`). Backend: accept an empty or `null` JSON body on bodyless endpoints and answer malformed JSON with 400 (BUG-03). Cover with a contract test that sends what `ApiUtils` sends.

### [BUG-02] Guest `id = 0` is treated as missing: High · `AuthUseCases.ts:102`, `auth.ts:220`
- **What:** the schema seeds the guest as `INSERT OR IGNORE INTO users (id, ...) VALUES (0, 'guest', ...)` (`database-v3-sqlite.sql:108-109`). `RefreshTokenUseCase` does `if (!userId) throw new ForbiddenError(...)` and `makeAuthenticateSSE` does `if (!userId) return next(new ForbiddenError(...))`. `findUser` and `validateAndBurn` return `0` for the guest.
- **Impact:** on any database created from the shipped schema, guest refresh answers 403 (the frontend then logs the guest out, `apiUtils.ts:241`, `UserService.ts:141-147`) and the guest cannot use `/more-info` because its ticket is rejected. `GET /plants` also treats user 0 as anonymous (`userId ? ... : []`, harmless here).
- **Evidence (probe):** `seed guest row: [{"id":0,...}]`, `guest refresh-token: 403`, `guest ticket: 200`, `guest GET /more-info with its ticket: 403`.
- **Production check needed:** a database imported from MySQL via `migrate-sqlite.js` may hold a different guest id. Decision D4 asks for it. Fix the code regardless: compare with `null`, never test ids for truthiness.
- **Fix:** `findUser`/`validateAndBurn` return `number | null` and callers test `=== null`; add a migration that moves the guest to a normal id.

### [DEP-01] Vulnerable runtime dependencies (backend): High · `backend/package.json`
`pnpm audit --prod`: critical 1, high 17, moderate 25, low 2.

| Package | Installed range | Advisory class | Reachability here | Action |
|---|---|---|---|---|
| axios | ^1.17.0 (<1.20 affected) | 8 high (DoS, ReDoS, prototype-pollution gadgets), 14 moderate | outbound calls to fixed shop and API hosts; medium | `>=1.20.0` |
| multer | ^2.1.1 (<2.3.0) | 3 high DoS (multipart, deeply nested fields), 1 low | `/images` upload, authenticated; high | `>=2.3.0` (or removed by Fastify, §5.2) |
| sharp | ^0.34.5 (<0.35.5) | 3 high (libvips, libheif, librsvg CVEs) | decodes user-uploaded files; high | `>=0.35.5`, re-test image pipeline |
| express transitive: path-to-regexp, qs, body-parser | express 5.2.1 | 1 high + moderates | route matching; medium | bump express to latest 5.x |
| express transitive: proxy-addr | <2.0.8 | advisory rated critical (IP spoofing via IPv4-mapped IPv6 trust) | `trust proxy` is the hop count `1` (`server.ts:54`), which does not use subnet matching, so likely not exploitable here (suspected) | treated as Medium for this app; bump anyway |
| express-rate-limit transitive: ip-address | <=10.3.0 | 1 high + moderates | IP keying for the auth limiters; medium | bump express-rate-limit |
| form-data (via axios) | <4.0.6 | 1 high CRLF injection | not used for uploads; low | resolved by axios bump |

Frontend: `pnpm audit --prod` shows 5 high + 1 moderate, all transitive build tooling (nanoid, postcss, source-map-js, `@vue/server-renderer`); none runs in the shipped bundle, since the app has no SSR (suspected for `@vue/server-renderer`, not traced) (DEP-02).

---

## 4. Medium and Low findings: evidence and fixes

### 4.1 Security posture by class
| Class | Status | Notes |
|---|---|---|
| SQL injection | OK | Every query is parameterized. The 6 dynamic `SET` builders interpolate only hard-coded column names (`SQLitePlantRepository.ts:262-297`, `SQLiteUserRepository.ts:60-66`, `SQLiteImageRepository.ts:63-77`). |
| Authentication | At risk | SEC-05, BUG-02. bcryptjs cost 10 is acceptable. Tickets use `crypto.randomBytes(32)`, single use, 60 s. JWT secrets are required at boot, no defaults (`auth.ts:30-44`). `jwt.verify` does not pin `algorithms` (`auth.ts:157`, `AuthUseCases.ts:105`); only HMAC algorithms are accepted with a string secret, so Low. |
| Authorization | At risk | SEC-01, SEC-02, SEC-03. Watering, plant and substrate mutations are correctly scoped in SQL (`WHERE ... user_id = ?`). |
| Input validation | Partial | Zod at use-case boundaries, but no length limits (SEC-09) and constraint errors escape as 500 (BUG-03). |
| XSS | At risk | SEC-07. No other `v-html` or `innerHTML` sinks; Vue interpolation elsewhere. |
| CSRF | OK | Refresh cookie is `HttpOnly; SameSite=Strict`, scoped to `/api/v2/auth`. API calls use the `Authorization` header. `authenticateToken` also accepts an `accessToken` cookie (`auth.ts:147-150`) that the server never sets; remove that dead path. |
| SSRF / path traversal | OK | Outbound URLs are fixed per shop; user input is only URL-encoded into query strings. `resolveLocalPath` uses `path.basename` (`LocalImageStorage.ts:177-182`). |
| File upload | Partial | 10 MB cap and MIME allowlist, but the MIME comes from the client header; non-image bytes labelled `image/png` reach Sharp and answer 500 (probe). |
| Secrets | OK | `.env` is gitignored and untracked; scanner "secret" hits are test fixtures. Git history was not scanned. |
| Transport / headers | At risk | No `helmet` (SEC-08). CORS uses an allowlist, but a rejected origin raises `new Error("Not allowed by CORS")` that becomes 500 (`server.ts:60-66`). |
| Denial of service | At risk | SEC-04, SEC-06; JSON limit is the Express default of 100 kb and answers 500 when exceeded (probe), contrary to `roadmap.md:41`. |

### 4.2 Medium and Low details
- **SEC-04** `salesRoutes.ts:28` registers `router.get('/', getSalesData)` with no `makeAuthenticateSSE`. `FetchSalesOverview.ts:104-110` fans out every source and page per request. Results are cached 24 h per page, but a page that returns zero items is never cached (`BaseScraper.ts:149`), and concurrent cold requests all scrape (no in-flight dedupe). The limiter caps Chromium at 2 and Axios at 8 process-wide, so anonymous callers can saturate the scraper and get the host IP rate-limited by the shops. `authentication.md:73-80`, `api-reference.md:451` and `authentication.md:151` all claim ticket protection. Fix: add `makeAuthenticateSSE()` (frontend already fetches a ticket, `apiUtils.ts:329`), share in-flight scrapes per source, cache empty results briefly.
- **SEC-05** `authenticateToken` verifies the signature, then accepts the token if the user has any session (`auth.ts:161-165`). Logging out one device does not revoke that device's access token while another session exists (probe: `access token of logged-out session still works while another session lives: 200`). Invalid or expired tokens answer 403 (`auth.ts:158`), which collides with authorization failures, so the client must treat every 403 as "try refresh" (`apiUtils.ts:230-231`). Refresh tokens are not rotated and live in a `Map` lost on restart (`auth.ts:50-77`). Sessions are matched by token string, so two logins in the same second produce identical JWTs. Fix: put a session id (`sid`) in both tokens and check it; 401 for invalid tokens; persist sessions in SQLite (single process, no Redis needed).
- **SEC-06** `/more-info` has a ticket but no limiter (`moreInfoRoutes.ts:34`). Registration is open. Each distinct `(lang, plantName)` pair misses the 12 h cache and costs an OpenAI call (`OpenAIClient.ts:53,75`, `max_tokens: 1000`). `lang` accepts any 35 characters and is interpolated into the system prompt (`OpenAIClient.ts:72,78`), so it doubles as a prompt-injection field. Fix: per-user limiter and daily budget, validate `lang` against a BCP-47 allowlist, normalize before keying the cache.
- **SEC-07** `MoreInfoService.parseMarkdown` builds HTML from model output with regexes and no escaping (`:123-177`); `MoreInfo.vue:66` renders it with `v-html`. `DOMParser` in `formatStreamingHtml` (`:170-193`) only adds classes, it does not sanitize. Cross-user poisoning is not possible today because the cache key contains the attacker-chosen `lang`, so the realistic impact is self-XSS plus defense in depth, but the bearer token lives in IndexedDB (`tokenUtils.ts`), so any script execution exfiltrates it. Fix: HTML-escape the buffer first, then apply the inline rules, or add DOMPurify (D8).
- **BUG-03** `errorHandler.ts:108-133` treats every non-`AppError` as an unknown programming error. Probe results, all 500 today: malformed JSON body; JSON body over 100 kb (log line "request entity too large"); duplicate component on `POST /substrates/:id/components` (UNIQUE) although `api-reference.md:350` says it "fails" without a code; unknown `componentId`; `PATCH /plants/:id` with unknown `substrateId` (FK); `PATCH /auth/me` renaming to an existing username (UNIQUE); non-image upload; CORS rejection. Each should be 400, 404, 409 or 413. Fix: honor `err.status` from `http-errors`; map `SQLITE_CONSTRAINT_UNIQUE` to 409 and `SQLITE_CONSTRAINT_FOREIGNKEY` to 400/404 inside repositories (typed `ConflictError`), and pre-check existence in use cases.
- **BUG-04** deleting a plant leaves every `images` row and file (probe: `image rows left after plant deleted: 2`). `DeletePlantUseCase` (`PlantUseCases.ts:112-119`) never touches images; neither do substrates or components. Frontend `deletePlant` does not call `ImageService.deleteAllImages` either (`PlantService.ts:286-299`). Fix: an `ImageCleanup` port called by the three Delete use cases; a one-off migration purging existing orphans.
- **BUG-05** every 401/403 triggers `UserService.refreshToken()` with no shared in-flight promise (`apiUtils.ts:172-192`). Failed refresh replies 403 "Invalid refresh token"; `isAuthError` only matches messages containing "expired" or "401" (`UserService.ts:137-139`), so it retries 3 times, 1 s apart, and rethrows. The `logout()` call after the failed attempts is unreachable: `handleRequest` rethrows the `RefreshError` first (`BaseService.ts:172-173`). Teardown happens in `ApiUtils.handleNoAuth`: `handleLocalLogout` clears token and storage and reloads the page (`UserService.ts:82`), and one toast is shown. Several requests failing at once each start their own refresh (verified in `apiRequest.test.ts`). Any legitimate 403 therefore costs a wasted refresh round trip; with the seeded guest id (BUG-02) the refresh fails and a guest who hits one forbidden mutation is logged out and the page reloads. Also `atob` on a base64url JWT payload (`UserService.ts:19`) mis-decodes non-ASCII usernames.
- **BUG-06** `BaseService.readList` reads only L2 and ignores TTL and L1 (`:186-198`); `runOptimisticUpsert` then writes `[optimisticItem]` as the whole list when L2 is empty (`:318-338`), so a create on a cold cache replaces the list with one item and stamps it fresh (suspected; needs a test). Concurrent mutations do read-modify-write without a lock. `getFromDictionaryCache` rewrites the whole dictionary with a new timestamp, so entries never expire individually (`:138-141`). `MoreInfoService.updateDictionaryCache` and `invalidateInfoCache` store `{ records, timestamp }` under the key that `getCachedData` reads as `{ data, timestamp }` (`MoreInfoService.ts:189,205`, `BaseService.ts:79-86`); `invalidateInfoCache` has no callers and `MORE_INFO_UPDATED` no listeners.
- **BUG-07** `migrate-sqlite.js` runs `db.exec(loadSchema())`, which executes the schema's seed `INSERT OR IGNORE` rows (`database-v3-sqlite.sql:103-118`: roles 1 to 3, guest user, lookups), then plain `INSERT INTO roles/users/fineness_levels/fertilizer_types ... SELECT` from the dump (`:145-172`) inside one transaction with no catch. Any dump that has the same role ids or a `guest` user hits UNIQUE and aborts. The README says the script "creates data/plantcare.db from the schema"; it actually prompts for a MySQL dump path (`:78`). Treat as suspected until run against a real dump.
- **BUG-08** image URLs are stored absolute using `req.protocol://req.get('host')` (`imageController.ts:47-48`, `ImageUseCases.ts:32-36`). `frontend/serve.js:109` overwrites `Host` with the backend address, so uploads through the project's own proxy would store `http://localhost:5000/uploads/...`. Nginx setups that forward `Host` are fine. Moving the origin later requires rewriting every row. Fix: store the relative path, build the origin from `PUBLIC_BASE_URL` on read (the response contract stays absolute).
- **BUG-09** `OpenAIClient.ts:108-110` logs and returns on failure, so the stream ends with `done {status: "completed"}` and no guide; the client cannot show an error. `BaseScraper.ts:149` skips caching empty results. `SQLitePlantRepository.ts:216-219` joins images without `ORDER BY`, yet `:332-333` picks "the latest" as the last row. `create`/`update` call `upsertSpecies` and the plant insert as separate writes (`:245-257`).
- **SEC-08** `ecosystem.config.js:15-17` defaults `NODE_ENV: "development"`; `deployment.md` starts PM2 without the ecosystem file. In development mode the error handler returns stack traces and logs request bodies (`errorHandler.ts:100-102,117`). No `helmet`. Chromium launches with `--no-sandbox` (`HttpFetcher.ts:29-33`).
- **SEC-09** `CredentialsSchema` is `z.string().min(1)` for both fields (`AuthUseCases.ts:27-30`). Probe: a 1-character password registers and logs in; a 10 000-character username and a 90 000-character password are accepted (bcryptjs silently truncates at 72 bytes). Substrate and component names have no `.max`. Existing users keep working if limits apply only on register and password change.
- **SEC-10** `router/index.ts:69-72` registers `/tabs/debug` for every build; only the tab button is hidden outside dev (`TabsPage.vue:22,94`). `Debug.vue:339` holds demo credentials and the view calls real services.
- **DEP-02** `cypress` is a devDependency and `cypress.config.ts` exists, but there is no `cypress/` directory; CI exports `CYPRESS_INSTALL_BINARY=0`. `frontend/package.json` has both an npm-style `overrides` block (ignored by pnpm) and `pnpm.overrides`. `src/config.json` is committed with a placeholder production URL, so deployment means editing a tracked file; use Vite env variables.
- **QUAL-01** `server.ts` loads dotenv, opens the database, builds the app and calls `listen` at import time, so nothing can `import` it. `buildTestApp` (`app.test.ts:45-57`) and `buildApp` (`salesHealth.test.ts`) re-wire routers by hand and omit `images`, `moreInfo`, CORS and the real error order. Wiring drift is invisible.
- **QUAL-02** `db.ts:163` casts `stmt.all()` to `T[]`; repositories are `async` over a synchronous driver (`:147-151`); the schema file is read from `process.cwd()/database/...` (`:112`), so the server must start in `backend/`; `ensureSchemaExtensions` is a one-off migration mechanism (`:86-102`); `SQLitePlantRepository.ts:144-181` holds fuzzy species matching (business logic in infrastructure) with a module-level cache.
- **QUAL-03** see §4.4. In addition, `tsconfig.json:32` does not include `tests/`, so `pnpm run typecheck` never checks them; checking them finds 15 type errors.
- **QUAL-04** `BaseService` holds `static l1Cache` and `ongoingRequests` for every service (`:8-13`), the opposite of the "no global mutable state on the client" rule. Cycles: `apiUtils.ts:5` imports `UserService`, which imports `ApiUtils` (`UserService.ts:2`); `UserService.ts:4` imports `router`, which imports `UserService` (`router/index.ts:5`); `PlantService.ts:35-38` imports `WateringService`, `UserService`, `SubstrateService`, which in turn call back. Eight files register ten `document.addEventListener` listeners (`Calendar.vue`, `MenuCalendar.vue` x2, `WateringRecords.vue`, `PlantDetails.vue`, `PlantOverview.vue`, `SubstrateDetails.vue`, `SubstrateOverview.vue`, `TabsPage.vue` x2).
- **QUAL-05** `core/middleware/*` and `core/sse/*` import Express types (21 files import `express` in total); `modules/sales/presentation/SseManager.ts` has no importers and 0% coverage (the live one is `core/sse/SseManager.ts`); `PlantLinkSearchers.ts:41-56` re-implements `fetchJson`/`fetchHtml` that `HttpFetcher.ts` already provides with retry; `asyncHandler.ts:12-16` admits Express 5 forwards rejections, so `express-async-handler` is dead weight; `AuthUseCases.ts:23` (application layer) imports the session and ticket stores from `core/middleware/auth`, the one inward-pointing dependency violation, and ties auth tests to module-level singletons (hence `pool: 'forks'` in `vitest.config.ts`).
- **QUAL-06** `process.env` is read in `server.ts` (4), `apiVersion.ts` (2), `uploads.ts` (2), `db.ts` (2), `logger.ts` (1), `auth.ts` (5), `errorHandler.ts` (1), `OpenAIClient.ts` (2), `HttpFetcher.ts` (2). `backend/.gitignore:4-5` ignores `.env.*`, which also ignores `.env.example`; the README's `cp .env.example .env` cannot work from a clone.
- **QUAL-07** lint over `src/**/*.{ts,vue}` with the proposed config: 186 findings in 55 files (§5.4). `Login.vue:147` and `Debug.vue:226` import `ApiUtils` directly, bypassing the service layer. Real defects among them: `vue/no-mutating-props` at `FormComponent.vue:24-54,248`, `ImageEditingModal.vue:2`, `ImageUploadModal.vue:2`, `ComponentSelection.vue:37`. The two `<script setup>` files (`App.vue`, `TabsPage.vue`) break the Options-API rule. `t(key, ...)` is declared again in 29 components although `main.ts:441` already installs a global `$t`.
- **QUAL-08** `frontend/.eslintrc.cjs` and `.eslintignore` are not read by ESLint 10 (it requires `eslint.config.*` and warns that `.eslintignore` is unsupported); `ci.yml:16-20` records the same. `backend/coverage/` is not gitignored (running `test:coverage` creates untracked output). `vitest.config.ts:35-40` enforces 70/70/60/70 but CI never runs coverage, so the gate silently fails today.

### 4.3 Dependency health (frontend and backend, outside DEP-01/02)
| Package | Current | Issue | Action |
|---|---|---|---|
| `eslint` (frontend) | ^10.4.1, latest 10.12 | config format unsupported (QUAL-08) | flat config |
| `typescript` | ^6.0.3 / ~6.0.3 | typescript-eslint 8.x peer range must be checked on the pinned minor | verify in W1-01 |
| `express` + `express-async-handler` | 5.2.1 / 1.2.0 | handler redundant | remove with Fastify (or earlier) |
| `winston` | ^3.19 | fine; Fastify uses Pino natively | keep for now (D9) |
| `node-cache` | ^5.1.2 | unmaintained (last release 2020) but stable; used behind `CacheService` | keep behind port |
| `playwright` | ^1.60 | 150 to 300 MB idle browser for 5 of 9 sources | keep; roadmap |
| `@ionic/storage` | ^4 | IndexedDB wrapper, async | wrap in Pinia plugin |
| `vue-router` | ^5.1.0 with a pnpm peer override to `5` | the `peerDependencyRules` override in `frontend/package.json` suggests `@ionic/vue-router` 8.x declares an older range and the override hides the mismatch | track Ionic release |

### 4.4 Testing and CI
- **Backend:** 18 test files. Integration tests mock `core/database/db` and sequence results with `mockReturnValueOnce` (8 sites in `tests/`), so they assert call order, not SQL validity. That is why SEC-01 to SEC-03 and BUG-01 to BUG-04 are invisible: no test runs a real query, a real constraint, the real body parser, or a guest token against `/auth/me`.
- **Coverage (`vitest run --coverage`, today):** 64.4% lines, 68.0% functions, 58.7% branches, 63.5% statements. Zero: `LocalImageStorage`, `imageController`, `imageRoutes`, `OpenAIClient`, `moreInfoRoutes`, `HttpFetcher`, `core/sse/SseManager`, the dead `sales/presentation/SseManager`. Low: `SQLiteImageRepository` 8.7%, `SQLiteSubstrateRepository` 52%, `SQLitePlantRepository` 67%, `core/sse` 4%, `PlantLinkSearchers` 60%. High: the use cases that report (auth, images, plants, substrate, watering, sales: 93% to 99%) and the scraper strategies (91% to 98%).
- **Frontend:** 6 test files, 113 tests: mappers, `ApiUtils`, `Utils`, `BaseService`, source-health mapper, 4 view-reactivity tests. No test for `PlantService`, `WateringService`, `SubstrateService`, `ComponentService`, `UserService` (refresh flow), `SalesService` (SSE), `MoreInfoService.parseMarkdown`, router guards beyond `resolveAccess`, or any form component.
- **CI:** no lint, no format check, no coverage, no audit, no e2e. A deploy path (`frontend/scripts/deploy.mjs`, `scripts/update-project.js`) exists outside CI.

### 4.5 Documentation drift (DOC-01)
Documentation was in scope by request. In every row the code wins.

| # | Claim | Reality (evidence) |
|---|---|---|
| 1 | `backend/docs/database.md`: InnoDB, utf8mb4, `VARCHAR`, `DECIMAL`, `plant_images`/`substrate_images`/`component_images` join tables, 12 indexes in `database-v2.sql`, `SHOW INDEX` | SQLite, one `images` table keyed by `entity_type`/`entity_id`, 3 indexes (`database-v3-sqlite.sql:123-125`), undocumented `species` table, integer epoch columns |
| 2 | `setup.md`: required `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`; Node >= 18 | only `DB_PATH` is read (`db.ts:45`); CI and root README use Node 22; no `engines` field |
| 3 | Root `readme.md`: `cp .env.example .env`; migrate script "creates data/plantcare.db from the schema" | `.env.example` untracked (`backend/.gitignore:5`); the script imports a MySQL dump interactively (`migrate-sqlite.js:78`); the server creates the schema on first start |
| 4 | `api-reference.md:160-174,230-243`: dates as ISO/`"2024-06-01 10:00:00"` strings | integer epoch seconds (`SQLitePlantRepository.ts:341`, `SQLiteWateringRepository.ts:130`); `frontend/docs/api-reference.md` has it right |
| 5 | `api-reference.md:451`, `authentication.md:73,151`: sales stream authenticates with a ticket | no auth on the route (`salesRoutes.ts:28`) |
| 6 | `api-reference.md:85`: refresh cookie `Path=/api/v2/auth/refresh-token` | `/api/v2/auth` (`authRoutes.ts:86`), as `authentication.md:49` says |
| 7 | `api-reference.md:45`, `authentication.md:99`: every mutating route is 403 for guests | `PATCH`/`DELETE /auth/me` are not (SEC-01) |
| 8 | `deployment.md:72-98`, `backend/docs/index.md:89`: `/health`, `/health/ready` | `/api/v2/health`, `/api/v2/health/ready` (`server.ts:94,117`); `uptime` is a string, not a number |
| 9 | `backend/docs/index.md:71`: success envelope `{ "success": true, "data": ... }`; `backend/readme.md`: German "V2 setup" note telling the reader to `pnpm add zod ...` and `@types/bcryptjs` | `{ "data": ... }` only; every listed package is already in `package.json` (`@types/bcryptjs` is not used, `bcryptjs` ships its own types) |
| 10 | `roadmap.md:41`: "no request body size limit"; Redis swap "only `server.ts` needs to change" | Express default 100 kb applies (probe); sessions and tickets are module-level `Map`s in `auth.ts`, caches are built inside module routers (`salesRoutes.ts:20`, `moreInfoRoutes.ts:28`) |
| 11 | `overview.md`, `migration.md`: `database-v2.sql`, `migration_v2_indexes.sql`, "same schema as V1", V1 rollback steps | files do not exist; V1 text is history, no consumers remain |
| 12 | `testing.md`: structure and counts | misses `BaseScraper`, `scraperStrategies`, `shopSearchers`, `salesHealth`, `SourceHealthTracker` tests; documents a 70% gate that fails today |
| 13 | `deployment.md:15`: `NODE_ENV=production` removes stack traces | PM2 ecosystem defaults to `development` (`ecosystem.config.js:16`) |
| 14 | `frontend/docs/architecture.md:121`, `api-reference.md`: sales `message` event carries a single `APISale` | the server sends arrays, batched by size (`core/sse/SseManager.ts:99-120`); the backend API reference shows an array |
| 15 | `frontend/docs/services.md`: service list | omits `AdminService`, `CalendarService`; `index.md` compatibility table describes V1 history |
| 16 | `frontend/readme.md`: dev port 8100, "customizable reminders" | Vite default 5173 (root README is right); no reminder feature exists |

---

## 5. Required analyses

### 5.1 DB access layer recommendation

**Facts about this codebase that decide it**
- 7 SQLite repositories with about 45 `query`/`execute` call sites (plus one inline query in `auth.ts:231`) and 3 explicit transactions (`SQLiteImageRepository.deleteByEntity`, `addComponents`, `upsertComponents`).
- Shapes: 6 conditional `UPDATE ... SET` builders; 3 JOIN readers whose rows are collapsed in TypeScript (`groupRows` in plants, substrates, components); one `INSERT ... SELECT ... WHERE EXISTS` for ownership-safe inserts (`SQLiteWateringRepository.ts:63-79`); `INSERT OR REPLACE`; `strftime('%s','now')` defaults; a legacy `REPLACE(img.image_url, '\\', '/')` (`SQLitePlantRepository.ts:214`).
- Types: `SqlParam` unions and `as T[]` casts (`db.ts:163`). Per-repo `*Row` interfaces already exist, so rows are typed by hand and unchecked.
- Tests mock `core/database/db`. Replacing that module with anything else breaks every repository test regardless of library.
- `scripts/migrate-sqlite.js` is a one-off MySQL-dump importer on raw better-sqlite3 with a regex sanitizer. No query library helps it; it stays raw.
- Schema bootstrap is `initSchema` (runs only when `users` is absent) plus `ensureSchemaExtensions` (idempotent `CREATE TABLE IF NOT EXISTS`). There is no migration history.
- better-sqlite3 is synchronous; the current `transaction(fn)` is synchronous.

**Comparison**

| Criterion | A. Raw better-sqlite3, hardened | B. Kysely 0.29 (+ better-sqlite3) | C. Drizzle ORM 0.45 (+ better-sqlite3) |
|---|---|---|---|
| Compile-time checked queries | No (typed row helper only) | Yes, against a hand-written or generated `Database` interface | Yes, against TS schema |
| Fits existing hand-tuned SQL | Native | Good: builder mirrors SQL, `sql` tag for `strftime`, `INSERT OR REPLACE`; `INSERT ... SELECT` supported | Good for CRUD; joins and `INSERT ... SELECT` are expressible but less SQL-shaped |
| Dynamic `SET` builders (6) | Needs a small typed helper | Native (`updateTable().set(partial)`) | Native |
| Row collapsing (3x `groupRows`) | Stays | Stays, or replace with `jsonArrayFrom` helpers | Relational queries can replace it |
| Migrations | Hand-rolled (needs building) | Built-in `Migrator`, TS files, history table | `drizzle-kit` generates SQL from schema; extra CLI and schema-as-code |
| Sync transactions | Yes | No: async facade (`SqliteDialect` serializes one connection). Closures contain only DB work today, so safe | Yes (better-sqlite3 driver supports sync) |
| Test strategy | `:memory:` DB from the same SQL | `:memory:` + `Migrator` | `:memory:` + migrations |
| API stability | n/a | 0.x but long-lived, small surface | `latest` is 0.45.3; `1.0.0-rc.5` is out on the `rc` tag and a 1.0 line is expected to bring breaking changes, so adopting 0.45 now likely means a second migration soon |
| Added deps | 0 | 1 runtime (`kysely`) | 1 runtime + 1 dev (`drizzle-kit`) |
| Effort | ~1 day | 3 to 4 days (7 repos, migrator, tests) | 5 to 7 days (schema, relations, kit workflow, learning curve) |
| Lock-in / reversibility | none | low: SQL stays visible | medium: schema DSL becomes source of truth |

**Recommendation: B, Kysely, with a baseline migration and the `sql` escape hatch. Marked as my decision (D1): this is the repository owner's call, not taken by the audit.**
Reasoning: the pain is not SQL strings, it is (1) unchecked casts, (2) hand-built `SET`, (3) no migration history, (4) mock-by-call-order tests. Kysely fixes 1 to 3 without replacing SQL knowledge with a DSL, and the schema stays as plain DDL. Drizzle's schema-first model brings a larger rewrite and an imminent 1.0 break for no gain at 12 tables. Option A is a legitimate cheap choice if compile-time checking is not wanted: it delivers the test and migration wins at a third of the cost.
Order of operations that makes any choice safe:
1. Land real-SQLite contract tests first (W1-02); they do not depend on the library.
2. Replace the db module mock in repository tests with `:memory:` databases.
3. Swap repositories to Kysely behind unchanged ports (W1-08); the same contract and repository suites must pass untouched.
4. Replace `initSchema`/`ensureSchemaExtensions`/`database-v3-sqlite.sql` with `0001_baseline` (= today's DDL + `scrape_source_health`) and a `schema_migrations` history; later phases add `0002+` (image cleanup, URL normalization, sessions).
5. Keep `migrate-sqlite.js` raw, rename it `import-mysql-dump.js`, fix BUG-07, and cover it with a tiny dump fixture test.

### 5.2 Express 5 to Fastify 5 migration plan

**Is it worth it?** Functionally Express 5 is fine. The case for Fastify is structural: encapsulated scopes make default-deny guest and auth rules the natural shape (the fix for SEC-01), route schemas give validation, response shaping and an OpenAPI source from one definition, `fastify.inject` removes sockets from tests, and the built-in lifecycle replaces `express-async-handler`, `cookie-parser`, `multer`, and hand-written shutdown. Performance is not a reason at this scale. The cost is rewriting 21 presentation/core files and re-proving 45 routes. Recommendation: proceed, but only after contract fixes (W1-05/06), the safety net (W1-02) and the DB layer (W1-08) so the migration is a pure transport swap. Staying on Express 5 with Zod middleware is a valid fallback that saves about 4 PRs (D7).

**Versions verified on 2026-10-07:** fastify 5.12.5, @fastify/cookie 11.1.2, @fastify/cors 11.3.0, @fastify/helmet 13.1.1, @fastify/rate-limit 11.2.0, @fastify/multipart 10.1.2, @fastify/static 10.1.5, fastify-plugin 6.0.0, fastify-type-provider-zod 7.0.0 (peer `zod >=4.1.5`; repo has zod ^4.4.3).

**Concern map**

| Express concern today | Fastify equivalent | Notes and gotchas |
|---|---|---|
| `express.Router()` per module, composition root inside each `createXRouter()` (`plantsRoutes.ts`) | One encapsulated plugin per module registered with `prefix`; services via `fastify.decorate` from a `buildApp(deps)` root | Repos and services injected from `buildApp`, not constructed in routes (fixes QUAL-01) |
| `globalErrorHandler` + `notFoundHandler` + `AppError` hierarchy (`errorHandler.ts`) | One `setErrorHandler` + `setNotFoundHandler` emitting `{ error: { type, message, statusCode, fields? } }` | Map Fastify codes: validation to `ValidationError` with the same `fields` map, `FST_ERR_CTP_BODY_TOO_LARGE` to 413, `FST_ERR_CTP_INVALID_JSON_BODY` to 400. Keep 404 text `Route GET /x not found` |
| `{ data }` wrapper in every controller | Handlers return `{ data }`; response schema per route; no `onSend` magic | Response schema also strips unlisted fields; nullable columns must be modeled or serialization throws |
| 204 for DELETE, `Location` on POST | `reply.code(204).send()`, `reply.header('Location', ...)` | Same |
| `express.json()` (100 kb default, strict) | Fastify JSON parser, `bodyLimit` set explicitly to 100 kb | Fastify 400s an empty body that declares `application/json` (`FST_ERR_CTP_EMPTY_JSON_BODY`); the UI sends that on bodyless POSTs. Register a lenient parser that maps empty to `undefined` (and see BUG-01) |
| `cookie-parser`, `res.cookie`, `res.clearCookie` (`authRoutes.ts:113-170`) | `@fastify/cookie` (`setCookie`, `clearCookie`, `request.cookies`) | `maxAge` is seconds in `@fastify/cookie`, milliseconds in Express: convert constants in `AUTH` once. Keep `SameSite=Strict`, `HttpOnly`, path `/api/v2/auth`, and the legacy-path clearing on logout |
| JWT (`jsonwebtoken`), in-memory `sessionStore`, `ticketStore` | Keep `jsonwebtoken` and the stores behind an `auth` plugin; `onRequest`/`preHandler` hooks populate `request.user` | Do not adopt `@fastify/jwt` in this phase: it changes decorators and error shapes and adds no parity value. Revisit with persistent sessions (SEC-05) |
| `checkGuestPermission` per route | One `preHandler` hook on the authenticated scope: deny non-GET/HEAD for role guest, allowlist `/auth/logout`, `/auth/ticket`, `/auth/refresh-token` | Default deny; adding a route cannot forget it (SEC-01) |
| `isAdmin`, `optionalAuthenticateToken` | Scoped hooks (`requireAdmin`, `optionalAuth`) | Same logic, composed per scope |
| `makeAuthenticateSSE({ loadUserFromDb })` | `preHandler` hook reading `request.query.ticket` | Burn-on-read semantics unchanged |
| `express-rate-limit` per-IP and per-account (`authRoutes.ts:37-57`) | `@fastify/rate-limit` per route via `config.rateLimit` | The plugin runs in `onRequest` by default, before the body is parsed, so the per-account key (body `username`) needs `hook: 'preHandler'`. Set `trustProxy: 1` on the instance (`server.ts:54`) |
| `cors` with allowlist callback (`server.ts:58-69`) | `@fastify/cors` with an origin function, `credentials: true` | A rejected origin should not throw; it omits CORS headers (removes the 500 in BUG-03) |
| none | `@fastify/helmet` | SEC-08 |
| Multer memory storage, 10 MB limit, MIME filter, `translateMulterError` (`imageRoutes.ts`, `uploadErrors.ts`) | `@fastify/multipart`: `request.file({ limits: { fileSize } })`, `toBuffer()` | Map `FST_REQ_FILE_TOO_LARGE` and invalid type to the existing 400 contract. Validate bytes with `sharp(buffer).metadata()` instead of trusting the header (fixes the 500 on non-images). Drops the multer advisories |
| Sharp + EXIF (`LocalImageStorage.ts`) | unchanged | Framework-free adapter behind `ImageStorage` |
| `express.static` on `/uploads` (`server.ts:77`) | `@fastify/static` `{ root, prefix: '/uploads/', decorateReply: false }` | Keep cache headers; deny dotfiles. Pending D6 on auth |
| SSE: `SseManager` writes to `res`, `createSseEndpoint` lifecycle (`core/sse/*`) | Same classes typed against `http.ServerResponse`; handler calls `reply.hijack()` first and writes to `reply.raw` | Hijacked replies skip Fastify's header flush: pass `reply.getHeaders()` (CORS, `X-Request-Id`) into `writeHead`. Abort detection via `request.raw.on('close')`. `prepare` still runs before the stream opens so validation errors stay JSON 400 |
| `requestIdMiddleware` + `AsyncLocalStorage` + Winston (`requestId.ts`, `logger.ts`) | `genReqId` honoring a validated `X-Request-Id`, `onRequest` hook sets the ALS store and `X-Request-Id` header | Keep Winston for this phase; moving to Pino is a separate follow-up (D9). Validate the inbound id (length, charset); today any client string is reflected |
| `process.env` scattered (21 reads) | `loadConfig(env)` Zod-validated, passed into `buildApp({ config, ... })` | Read once in `main.ts`; tests build their own config |
| `/api/v2/health`, `/health/ready` inline in `server.ts` | `health` plugin | Same bodies |
| `server.listen`, SIGTERM handler with 10 s force-exit (`server.ts:129-170`) | `app.close()` with `onClose` hooks for `closeBrowser()` and `closeDb()`; thin `main.ts` | Keep the forced exit timer |
| Trailing slash and case behavior | Set the router option so `/plants/` and `/plants` keep matching one route | Verify the option name on the pinned Fastify minor (`ignoreTrailingSlash` moved under router options in 5.x) |

**Schema validation: Zod via `fastify-type-provider-zod` (recommended), not TypeBox.** Justification:
1. 12 Zod schemas already live in the use cases (`CreatePlantSchema`, `CreateWateringSchema`, `ComponentsSchema`, ...) and `parseOrThrow` already produces the `fields` map the frontend consumes. Reusing them means no second schema language and no Ajv-error-to-`fields` translation layer.
2. One schema per route feeds validation, handler types, response serialization and OpenAPI (via `@fastify/swagger`).
3. TypeBox's advantage (JSON Schema native, Ajv speed) does not matter at this load; its cost is rewriting every schema and re-deriving error messages. Parity risk is lower with Zod.
Use route schemas for params, query, body and response; keep `parseOrThrow` in use cases until route schemas cover every input, then delete the duplicate parse (separate commit).

**Parity proof (how the HTTP contract tests prove nothing changed)**
- Contract tests talk only to a `TestClient` interface: `request({ method, url, headers?, json?, multipart?, cookies? }) -> { status, headers, setCookies, body, text }`. They never import Express, Fastify, supertest or `inject` directly.
- `tests/contract/harness.ts` exports `createContractApp(overrides)` returning `{ client, db, clock, close }`. Today it builds `createApp(deps)` and wraps `supertest(app)`; the Fastify phase changes only this file to wrap `app.inject()`. The `*.contract.test.ts` files stay byte-identical across the migration PRs (CI check: `git diff --stat main -- 'tests/contract/**/*.contract.test.ts'` must be empty in those PRs).
- Real everything except the network: temp or `:memory:` SQLite built from the baseline migration, real bcrypt with a low test cost via config, a fake clock for ticket TTL, injected fake `SalesSource[]`, `PlantGuideStreamer` and `PlantLinkSearcher[]` for the SSE routes, real Sharp on generated PNGs for images.
- The suite pins: status code, `Content-Type`, `Location`, `Set-Cookie` attributes (names, path, `HttpOnly`, `SameSite`, `Max-Age`), the full error envelope for each error type, `X-Request-Id`, 404 body, `204` with empty body, SSE frame sequences including `: heartbeat`, `event: done`, `event: error`, and the guest-403 matrix over every mutating route.
- Pre-migration contract changes (§5.5 W1-05, W1-06) land first, so the suite pins the corrected behavior and the Fastify PRs contain no contract change.
- First Fastify PR includes a spike proving `inject` captures a hijacked SSE response; if it does not, SSE contract tests use `listen({ port: 0 })` for that file only, still behind the harness.

**Rollout:** route module by route module as stacked PRs (D7): PR A foundation (`buildApp`, error handler, config, auth plugin, cookie, CORS, helmet, rate limit, health) mounting the remaining Express routers through `@fastify/express` as a temporary bridge; PR B auth + plants; PR C watering + substrates + components; PR D images + static + SSE modules, bridge, Express, `cookie-parser`, `cors`, `express-rate-limit`, `express-async-handler`, `multer`, `supertest` and `@types/express` removed in the same PR. No dual-stack remains at the end of PR D.

### 5.3 Pinia design

**What exists today**
- L1: `BaseService.l1Cache` (static `Map`, 500 entries, FIFO eviction, TTL from `config.json` `expire_h`: 6 h dev, 24 h prod). L2: `@ionic/storage` through `StorageService`, entries `{ data, timestamp, keepOnClear }`. In-flight request coalescing via `ongoingRequests`.
- Writes: `saveAndNotify` updates L1 and L2 and dispatches a `CustomEvent` on `document`. Views register in `mounted`, unregister in `beforeUnmount`, and on each event re-read the cache through service getters.
- Optimistic mutations (`optimisticListUpsert/Remove` and dictionary variants): temporary negative id, paint, request, reconcile in place, item-scoped rollback. Used by plants and watering; substrates, components and profile are pessimistic.
- Data domains: plants, substrates, components (+ fineness levels), watering (dictionary keyed by plant id + fertilizer types), sales (SSE, price history, "new" flags), more-info (SSE, dictionary keyed by plant name), admin source health (SSE-free, REST), calendar settings (local only), session (token in L2).

**Decision: stores replace the cache services; they do not wrap them.** `BaseService` and the `CustomEvent` bus are deleted at the end. Pinia state is the L1 (reactive, so components bind to it directly and no events are needed). `StorageService` stays as the L2 driver and `ToastService`/`LocalizationService` stay as plain services. Wrapping `BaseService` inside stores would keep two sources of truth and the static singleton (QUAL-04).

**Layering**
```
Views / components (Options API)
   mapState / mapActions / mapStores / mapWritableState
Stores (Options-style defineStore)        state, getters, actions, optimistic helper
Resource modules  src/api/*.ts            stateless request functions + mappers
ApiUtils / TokenUtils                     transport; talks to the session store only through an injected auth bridge
StorageService (@ionic/storage)           L2 driver behind the persistence plugin
```
`apiUtils.ts` stops importing `UserService`: the session store registers `{ getToken, refresh, onAuthFailure }` with `ApiUtils` at bootstrap. That removes the `apiUtils` to `UserService` cycle. The router guard reads the session store (`useSessionStore(pinia)`), removing the `UserService` to `router` cycle (teardown navigates through an injected callback).

**Store boundaries**

| Store | State | Persisted (L2) | Notes |
|---|---|---|---|
| `session` | token, decoded `{ id, username, role }`, refresh in-flight promise | token only, own key | Getters `isAdmin`, `isGuest`, `isAuthenticated`; actions `login`, `guestLogin`, `logout`, `refresh` (single-flight, fixes BUG-05) |
| `plants` | `items`, `status`, `fetchedAt`, `error` | yes, TTL | Getters `personalPlants`, `publicPlants`, `byId`; optimistic add/edit/delete |
| `substrates` | same shape | yes | Pessimistic add-with-components (two requests) stays an action |
| `components` | items + `finenessLevels` | yes | Admin mutations |
| `watering` | `byPlantId: Record<number, Record[]>`, `fertilizerTypes` | yes | Depends on `plants` (reads name for the optimistic row); `plants.delete` calls `useWateringStore().dropPlant(id)` explicitly. Dependency direction is one way |
| `sales` | items, `streaming`, `progress`, `priceHistory`, `newCount` | items and history (`keepOnClear`) | SSE lifecycle lives in the store; `markSeen` is an action |
| `moreInfo` | `byKey: Record<'lang:name', Entry>`, per-key `streaming` | yes | Markdown to HTML conversion moves to a pure `src/utils/markdown.ts` (escapes first, SEC-07) |
| `adminHealth` | rows, `needingAttention` getter | no | Replaces `AdminEvents` |
| `calendar` | categories, dates, `firstDayOfWeek`, `deleteAfterThirty` | yes, `keepOnClear` | Local settings, no network |

Cross-store calls happen only inside actions and only in one direction (`watering` to `plants`, `plants` to `substrates` for the optimistic name lookup). `ImageService` stays stateless; image mutations call `refreshOne(id)` on the owning store.

**Resource slice and staleness.** Every collection store keeps `{ items, status: 'idle' | 'loading' | 'ready' | 'error', fetchedAt }`. `ensureLoaded({ force })` returns the in-flight promise (kept in a closure `Map`, not reactive state) so concurrent callers coalesce; `isStale` compares `fetchedAt` with the configured TTL.

**L2 persistence: explicit plugin, not `pinia-plugin-persistedstate` (4.7.1).** That plugin targets synchronous `Storage`-shaped backends; `@ionic/storage` is async. A ~60-line `l2Persistence` plugin reads store options (`persist: { key, ttl, keepOnClear, pick }`), exposes `store.$hydrate()` (async), and writes on `$subscribe({ detached: true })` with a trailing debounce. Hydration is explicit: `session` and `plants` are awaited before `app.mount` (replacing the `await Promise.all` in `main.ts`), the rest hydrate on first `ensureLoaded`. On logout one plugin hook runs `$reset()` on every store and calls `storageService.clear()`, which fixes the cross-account leak class that `clearMemoryCache` patches today. Read-modify-write races (BUG-06) disappear because actions mutate in-memory state synchronously and persistence is a debounced snapshot.

**Optimistic helper.** `src/stores/optimistic.ts` exposes `optimisticUpsert(store, key, item, request, reconcile)` and `optimisticRemove(...)` that snapshot the single item, patch via `$patch`, await the request, reconcile or restore that item only. The semantics and tests of `baseService.test.ts` carry over one-to-one; the UI repaints through reactivity instead of events.

**Components stay Options API.** Example:
```ts
import { defineComponent } from "vue";
import { mapState, mapActions } from "pinia";
import { usePlantsStore } from "@/stores/plants";

export default defineComponent({
  name: "PlantOverview",
  computed: {
    ...mapState(usePlantsStore, { plants: "personalPlants", isLoading: "isLoading" }),
  },
  async mounted() {
    await this.ensureLoaded();
  },
  methods: {
    ...mapActions(usePlantsStore, ["ensureLoaded", "addPlant"]),
  },
});
```
Stores use the Options syntax (`defineStore("plants", { state, getters, actions })`) so the mental model matches the components. Staleness refresh on re-entry uses `ionViewWillEnter` (Ionic keeps pages mounted), not `mounted`.

**Migration order (one store domain per PR):** infra + `session` (plugin, auth bridge, router guard, cycle removal) → `plants` (+ optimistic helper) → `watering` → `substrates` + `components` → `sales` + `moreInfo` + `adminHealth` + `calendar` → delete `BaseService`, `CustomEvent` enums and the `StorageKeys` strays. While a domain is unmigrated its service keeps using `BaseService`; migrated stores never share the static map. `@pinia/testing` 2.0.1 provides `createTestingPinia` for component tests; service-level tests become store tests with mocked resource modules.

### 5.4 ESLint flat config and Prettier

**Frontend `eslint.config.js`** (package is `"type": "module"`):
```js
import pluginVue from "eslint-plugin-vue";
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfigWithVueTs(
  { ignores: ["dist/**", "coverage/**", "src/locales/**"] },
  pluginVue.configs["flat/essential"],
  vueTsConfigs.recommended,
  {
    rules: {
      "vue/component-api-style": ["error", ["options", "composition"]],
      "vue/no-v-html": "warn",
      "vue/require-explicit-emits": "error",
      "vue/no-deprecated-slot-attribute": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["src/views/**/*.vue", "src/components/**/*.vue"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["@/utils/apiUtils", "@/utils/tokenUtils"] }],
    },
  },
  prettier,
);
```
`vue/component-api-style` with `["options", "composition"]` forbids `<script setup>` while still allowing the existing `setup() { return { icon } }` icon-exposing idiom (verified: it flags exactly `App.vue:8` and `TabsPage.vue:55`). `vue/no-deprecated-slot-attribute` stays off because Ionic uses `slot="..."`, as the old config did. The `essential` set is used on purpose: `flat/recommended` adds 589 stylistic warnings (attribute order, hyphenation, line breaks) that overlap Prettier. The restricted-imports rule enforces "components do not talk to the transport"; it already flags `Login.vue:147` and `Debug.vue:226`, which import `ApiUtils` directly.

**Backend `eslint.config.mjs`** (package is CommonJS, so the ESM config needs `.mjs`):
```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettier from "eslint-config-prettier/flat";

const HTTP_AND_DB = ["express", "better-sqlite3"];

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "scripts/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-imports": ["error", { patterns: HTTP_AND_DB }],
    },
  },
  {
    files: ["server.ts", "src/modules/*/presentation/**", "src/core/middleware/**", "src/core/sse/**"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["src/modules/*/infrastructure/**", "src/core/database/**"],
    rules: { "no-restricted-imports": ["error", { patterns: ["express"] }] },
  },
  {
    files: ["src/modules/*/domain/**", "src/modules/*/application/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [...HTTP_AND_DB, "**/infrastructure/**", "**/presentation/**", "**/core/middleware/**", "**/core/database/**"],
      }],
    },
  },
  { files: ["tests/**"], rules: { "@typescript-eslint/no-explicit-any": "off", "no-restricted-imports": "off" } },
  prettier,
);
```
Two prerequisites found while measuring. First, `tsconfig.json` includes only `src/**/*` and `server.ts` (`tsconfig.json:32`), so tests are neither type-checked by `pnpm run typecheck` nor lintable with type information. Checking them with a throwaway tsconfig reports 15 type errors: 11 in `plants.test.ts`, whose fixtures give `plant_created_at` as a string (`plants.test.ts:27`) while `PlantData` declares a number (`Plant.ts:33`), 3 unused declarations (`beforeEach` in two files, `makeUserRow`), and 1 `number` where `boolean` is expected (`substrate.test.ts:63`). W1-01 adds `tests/**` and `vitest.config.ts` to `tsconfig.json`, moves the emit config to `tsconfig.build.json` (used by `build`), and fixes the 15 errors. Second, the layer rule already finds one real violation: `AuthUseCases.ts:23` (application layer) imports the token and session stores from `core/middleware/auth`, a module that also imports Express types. The stores and token helpers move to `core/auth/` in W1-07.

Add `eslint-plugin-import-x` (4.17.1) `import-x/no-cycle` to both packages: the frontend has 3 real cycles today and the rule keeps them gone. New dev dependencies per package: `eslint-config-prettier`, `prettier`, `eslint-plugin-import-x`; backend also `eslint`, `typescript-eslint`, `@eslint/js`, `globals`. A one-line justification for each goes in the PR description.

**Prettier** (`.prettierrc.json` per package): backend `{ "singleQuote": true, "printWidth": 100 }`, frontend `{ "printWidth": 100 }`. Backend source uses single quotes 305 to 78 over double; frontend uses double quotes 430 to 9, so these settings minimize churn. Scripts per package: `lint`, `lint:fix`, `format`, `format:check`. Add `.editorconfig`, and a `.git-blame-ignore-revs` entry for the format commit.

**Measured violation volume** (throwaway configs, 2026-10-07)
- Prettier `--check`: backend 87 of 100 files differ with `singleQuote`; frontend 109 of 112 differ with defaults. Almost every file changes whatever the style, so the first pass is a whole-repo formatting commit.
- ESLint frontend, proposed config above (110 `.ts`/`.vue` files, locales ignored): 186 findings in 55 files, 91 errors and 95 warnings, 9 autofixable. By rule: 94 `no-explicit-any` (warn), 24 `vue/no-unused-components`, 16 `no-unused-vars`, 11 `prefer-const`, 11 `vue/no-mutating-props`, 9 `vue/require-explicit-emits`, 9 `no-unused-expressions`, 4 `vue/multi-word-component-names`, 2 `vue/component-api-style`, 2 `no-empty-object-type`, 2 `no-restricted-imports`, 1 `vue/no-reserved-component-names`, 1 `vue/no-v-html` (warn, `MoreInfo.vue:66`). For comparison the old rule intent (essential + recommended TypeScript, `any` off, slot rule on) yields 233, of which 61 are the Ionic `slot` attribute.
- ESLint backend (proposed config; type-aware rules only cover `src` and `server.ts` until tests join the tsconfig): 20 findings in 12 files, 1 autofixable. By rule: 6 `no-unsafe-function-type` (1 in `AppError.ts:21`, 5 in tests), 4 `no-explicit-any` (2 in `FetchSalesOverview.ts:29-30`, 2 in tests), 3 `no-unused-vars` (tests), 3 `no-misused-promises` (`server.ts:135,169,170`), 1 `no-floating-promises` (`HttpFetcher.ts:131`), 1 `no-namespace` (`auth.ts:128`), 1 unused `eslint-disable` directive (`FetchSalesOverview.ts:25`), 1 layer violation (`AuthUseCases.ts:23`).

**How the first pass lands (W1-01):**
1. Commit 1, config only: configs, scripts, devDependencies, `.editorconfig`, `.gitignore` fixes, removal of `.eslintrc.cjs`/`.eslintignore`. No source touched.
2. Commit 2, formatting only: `prettier --write` on both packages. Proof it is behavior-neutral: compile every `.ts` file before and after with esbuild (minified) and compare hashes, and compare the production bundle asset hashes of `vite build` before and after. Add the commit to `.git-blame-ignore-revs`.
3. Commit 3, `eslint --fix` autofixes only (9 in the frontend, 1 in the backend).
4. Commit 4, behavior-neutral manual fixes: unused imports, variables and components, unused expressions, `require-explicit-emits` declarations, `no-namespace`, `await`/`void` for the 4 promise findings.
5. Commit 5, baseline the rest with `eslint --suppress-all` (writes `eslint-suppressions.json`): `no-mutating-props` (11), `no-restricted-imports` (2), `no-explicit-any` (94, promoted to error in W1-19), and anything that needs a behavior change. Later phases burn the file down and `--prune-suppressions` shrinks it; CI fails on new violations from day one.
6. CI: add `pnpm run lint` and `pnpm run format:check` steps to both jobs in `.github/workflows/ci.yml` and update the comment block at its top.

### 5.5 Workplan

Sizes: S under a day, M one to three days, L more. Every PR runs the gate (backend `typecheck` + `test`; frontend `vue-tsc --noEmit` + `vitest run` + `build`; lint from W1-01 on) and updates the docs it touches. Branches are `refactor/w1-<nn>-<slug>`, stacked on the previous one.

| # | Branch slug | Scope | Size | Risk | Test strategy |
|---|---|---|---|---|---|
| 01 | `tooling` | §5.4: Prettier, ESLint flat, suppressions baseline, CI lint + format, `tsconfig` split so tests are type-checked (15 errors fixed), `.gitignore` (`.env.example`, `coverage/`), `engines`, real `.env.example` | M | Low behavior, high diff size (~200 files); conflicts with open work | Gate; esbuild/bundle hash equality for the format commit |
| 02 | `backend-safety-net` | Extract `createApp(deps)` and `main.ts` (move only); `tests/contract/` harness on real SQLite; characterization tests for every route including images (0%), moreInfo and sales SSE, guest matrix, cookies; repository tests on `:memory:`; probe findings pinned as `known defect` cases | L | Low (tests + one move commit) | Suite must pass on unchanged behavior; coverage gate raised to what is reached |
| 03 | `frontend-safety-net` | Add `@vitest/coverage-v8`; characterization tests for `UserService` (login, refresh, logout, guards), `PlantService`, `WateringService`, `SubstrateService`, `SalesService` SSE, `MoreInfoService.parseMarkdown`, router guards, 3 form components | M | Low | Tests only; no source change |
| 04 | `dependency-security` | Backend: express, axios, multer, sharp, express-rate-limit bumps. Frontend: toolchain bumps, drop unused Cypress or add one smoke test | S-M | Medium: sharp 0.34 to 0.35 | Contract + image characterization tests from 02 |
| 05 | `contract-authz-session` | Contract change A, deliberate: SEC-01 default-deny guest scope, SEC-02 visibility, SEC-03 image authorization, SEC-04 sales ticket, SEC-05 session ids + 401 for invalid tokens, BUG-01, BUG-02, SEC-06 limits; frontend adapts in the same PR (BUG-05 single-flight refresh, no `null` bodies, 401 handling) | L | High: changes behavior; each change listed in the PR and `api-reference.md` | Known-defect tests flip; new cases per change; frontend tests from 03 |
| 06 | `contract-errors-validation` | Contract change B: BUG-03 error mapping (400/413/409/404 instead of 500), SEC-09 limits, malformed ids, SEC-07 escaping, BUG-09 stream error event; frontend toast mapping | M | Medium | Contract suite updated |
| 07 | `backend-cleanup` | `loadConfig`, DI container, delete dead `SseManager`, `asyncHandler`, duplicate fetch helpers; `ServerResponse` typing in `core/sse`; HTTP types isolated in `src/http/`; species matching to the application layer; unify scraper fetching | M | Low-Medium | Contract + unit unchanged |
| 08 | `db-kysely` | Kysely repositories behind unchanged ports; `0001_baseline` migration + history table replace `initSchema`/`ensureSchemaExtensions`; `import-mysql-dump.js` fixed (BUG-07) with fixture test | L | Medium | Same contract and repository suites, untouched |
| 09 | `data-integrity` | BUG-04 image cleanup port + purge migration, BUG-08 relative image paths + `PUBLIC_BASE_URL` (response URLs stay absolute), guest id migration, BUG-09 ordering and transactions | M | Medium (data migrations) | Migration tests on seeded `:memory:` DBs; contract |
| 10 | `fastify-foundation` | `buildApp`, error handler, config, auth/cookie/CORS/helmet/rate-limit plugins, health, `@fastify/express` bridge | M | Medium | Contract suite unchanged except `harness.ts` |
| 11 | `fastify-auth-plants` | auth + plants modules | M | Medium | same |
| 12 | `fastify-watering-substrates-components` | those three modules | M | Low-Medium | same |
| 13 | `fastify-images-sse` | images, static, sales + moreInfo SSE; remove Express, bridge, multer, cookie-parser, cors, express-rate-limit, express-async-handler, supertest | L | High: multipart + hijacked SSE | same, plus SSE spike result |
| 14 | `pinia-session` | Pinia, `l2Persistence`, auth bridge, `session` store, router guard, cycle removal | M | Medium | Store tests + 03 net |
| 15 | `pinia-plants` | `plants` store + optimistic helper; plant views | M | Medium | Port `baseService.test.ts` cases to helper tests |
| 16 | `pinia-watering` | `watering` store, calendar views | M | Medium | Store + component tests |
| 17 | `pinia-substrates-components` | both stores and their views | M | Medium | same |
| 18 | `pinia-sales-moreinfo-admin-calendar` | remaining stores; delete `BaseService`, events | M | Medium | same |
| 19 | `frontend-cleanup` | prop mutations, unused components, `t()` dedupe via `$t`, `any` burn-down and rule to error, `<script setup>` to Options, Debug route dev-only, `console` cleanup, `config.json` to env vars, empty suppression file | M | Low-Medium | Gate; component tests |
| 20 | `docs-pass` | README, all `docs/`, delete V1 history, `wave1-summary.md` | M | Low | Link check, doc claims vs probes |

Wave 2 (UX audit) starts only after 20 is merged.

### 5.6 Open decisions

Each needs your answer; my recommendation follows.

| # | Decision | Recommendation |
|---|---|---|
| D1 | DB layer: raw hardened, Kysely, or Drizzle (**my decision**, §5.1) | Kysely with baseline migration; raw hardened if you want the cheapest path |
| D2 | Approve the contract changes in W1-05/06: default-deny guest scope incl. `/auth/me`; 404 for non-visible plants and substrates; image authorization (403 non-owner, 404 unknown entity); 401 for invalid tokens (403 stays for permission); 400/413/409 instead of 500; password >= 8 and <= 72 bytes, username 3 to 64 trimmed, limits only on register and password change | Approve all; each is listed in the PR and in `api-reference.md` |
| D3 | Sales stream: require a ticket (as documented) or keep public with a rate limit | Require the ticket (frontend already sends one) and share in-flight scrapes |
| D4 | Production guest id: what does `SELECT id FROM users WHERE username = 'guest'` return? (read-only check on your DB; I will not touch `.env` or any database) | If `0`, include the guest id migration in W1-09; the code fix ships in W1-05 either way |
| D5 | Guest rule beyond HTTP verbs: block guests from `POST /auth/ticket`? (they need it for `/more-info`) | Allow ticket for guests; keep `/more-info` available but rate-limited |
| D6 | `/uploads` public by URL or behind authorization | Keep public (needed for `<img>`), switch names to `crypto.randomUUID()`, and enforce authorization on every API route |
| D7 | Fastify rollout: 4 stacked PRs with `@fastify/express` as a temporary bridge, one big PR, or skip Fastify and stay on Express 5 + Zod middleware | 4 stacked PRs |
| D8 | AI HTML safety: escape in the converter only, or also add DOMPurify | Escape first (no dependency); add DOMPurify only if you later allow raw HTML |
| D9 | Logging: keep Winston through the Fastify phase and consider Pino later, or switch during the migration | Keep Winston; Pino as a separate optional follow-up |
| D10 | Validation library: Zod via `fastify-type-provider-zod` or TypeBox | Zod |
| D11 | Prettier style: backend single quotes, frontend double quotes, width 100, with a blame-ignore entry | As stated |
| D12 | ESLint strictness: `no-explicit-any` error in backend now, warn in frontend until W1-19; baseline through suppressions | As stated |
| D13 | Pinia: Options-syntax stores and a custom L2 plugin (not `pinia-plugin-persistedstate`) | As stated |
| D14 | `App.vue` and `TabsPage.vue` use `<script setup>`; convert to Options API and enforce with `vue/component-api-style` | Convert in W1-19 (or earlier in the Pinia PR that touches each) |
| D15 | Debug view: delete, or register only in dev builds | Register only in dev builds |
| D16 | Image URLs: store relative paths and build the origin from `PUBLIC_BASE_URL` | Yes (W1-09); response contract unchanged |
| D17 | Orphan images: purge existing orphans in the migration | Yes, after listing counts in the PR |
| D18 | Docs: delete `migration.md` and the V1 history text; consolidate `backend/readme.md` into `docs/index.md` | Delete (no external consumers) |
| D19 | Node: set `engines.node >= 22` and add `.nvmrc` | Yes |
| D20 | Coverage policy: enforce the 70/70/60/70 gate in CI once W1-02 reaches it, and add a frontend threshold after W1-03 | Yes |
| D21 | Dependency bumps as their own PR (W1-04) before contract changes | Yes |
| D22 | Stack mechanics: I open each PR with `gh pr create` against the previous branch and name the base in the description; you merge. May I push branches and open PRs without asking each time? | Yes, per the brief |

---

## 6. Feature roadmap

**What this is:** a household plant tracker with community-visible plants, watering history, substrate recipes, deal tracking across nine shops and AI care guides. Items grounded in code evidence only.

| Feature | Value | Effort | Ease (this codebase) | Prereqs / notes |
|---|---|---|---|---|
| Pagination and server-side search for plants and sales | High | M | Moderate: list endpoints return everything; row-collapsing queries need keyset pagination | W1-08 (Kysely) |
| Persistent sessions with rotation (SQLite `sessions` table) | High | M | Easy once DB layer exists: `sessionStore` is already an interface | W1-08, SEC-05 |
| OpenAPI document from route schemas | Medium | S | Easy after Fastify + Zod provider | W1-13 |
| Scraper failure alerting (notify admin) | Medium | S | Easy: `SourceHealthTracker` and admin view exist | none |
| Watering reminders (push or email) | High | L | Hard: needs a scheduler, notification channel and user settings; frontend README already promises it | Pinia `calendar` store; persistent sessions |
| Object-storage image adapter (S3/R2) | Medium | M | Easy: `ImageStorage` port exists | BUG-08 relative paths |
| Offline mutation queue | Medium | L | Hard before Pinia, Moderate after | Pinia migration |
| Browser E2E smoke suite on a throwaway DB | Medium | M | Moderate: `createApp(deps)` makes a test server cheap | W1-02 |

**Quick wins:** scraper alerting, OpenAPI export, E2E smoke suite.
**Now:** everything in §5.5 (security and correctness first). **Next:** pagination, persistent sessions, reminders groundwork. **Later:** offline queue, object storage, reminders delivery.

---

## 7. Scope and limitations

- **Reviewed in depth:** backend core, auth, plants, watering, substrates, components, images, SSE, error handling, DB layer, migration script, CI, deployment scripts; frontend `BaseService`, `ApiUtils`, `UserService`, router, `StorageService`, `PlantService`, `SalesServices`, `MoreInfoService`, `MoreInfo`, `PlantDetails`, `WateringRecords` (script), `TabsPage`, `Debug`.
- **Sampled, not line-read:** scraper strategies and `scrapers/index.ts` shop config, `SubstrateService`, `ComponentService`, `WateringService`, `CalendarService`, `LocalizationService`, `ToastService`, most components and views, locales.
- **Not run:** a browser session (BUG-01 is confirmed at HTTP level with the exact payload but not through the UI), the importer against a real MySQL dump (BUG-07 suspected), the production database (D4), git-history secret scan, semgrep, bandit.
- **Probes** (real routers, real SQLite file in the scratchpad, Express `5.2.x`) are reproducible and will become the first characterization tests in W1-02. They were not committed in this phase because Phase 0 changes no code.
- **Documentation:** in scope by request; every doc claim was checked against code and the code wins (§4.5).
- **Assumptions:** production runs `NODE_ENV=production` behind nginx forwarding `Host`; the frontend ships as static files plus the optional `serve.js` proxy.
- Findings marked suspected need verification as stated.
