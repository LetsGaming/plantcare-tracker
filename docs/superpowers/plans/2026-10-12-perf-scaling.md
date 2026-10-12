# PlantCare Tracker performance project: subagent-driven workplan (branch `perf/scaling`)

Inputs: `docs/performance-audit.md` (first audit: SALES, IMG, FE, BE, DB), `docs/performance-audit-deep.md` (second audit: NAV, DSAL, DPLA, DSUB, STA, REN, DBE; fix plan in its section 5, appendices A to H hold the per-finding detail), `CLAUDE.md`, `frontend/docs/design-system.md`. Baseline: `main` at `f11430d`.

User decisions (binding): all waves A to D; server-side Sales model but `GET /sales` stays an SSE stream that replays rows from the database (no scraping in the request, ticket plus EventSource contract kept); breaking API changes in the same release are accepted; one branch `perf/scaling`, commits per task, one final PR.

---

## 1. Context

**Problem.** Every tab entry pays client work proportional to list size (Sales N=300: one 0.7 s long task at 4x CPU; N=2,000: 25 to 37 s). The dominant multiplier is the persistence plugin's deep synchronous `$subscribe` (`frontend/src/stores/persistence.ts:128-138`), which re-walks each persisted store on every mutation (watering warm-up 35.8 s at 197 plants x 120 records; mark-all-seen 41 s at 1,000 items). Further multipliers: no paging contract at any layer, Ionic keeps all tab pages mounted, no read models (plant list issues one watering request per plant), Sales scraping inside the request, `isNew` inside every item, unbounded price history, per-item `Intl` construction, two image loaders per card, no image variants, in-memory sessions. Three correctness bugs surfaced: DSUB-9 (component removal never sent), DB-3/DBE-12 (user delete FK failure), STA-11 (post-logout repopulation).

**Outcome.** One PR: action-boundary persistence; keyset-paged summary list endpoints with ETag and compression; server-side Sales model (persisted items and price points, single-flight scheduled refresher, SSE replay from DB); image variants with a native lazy image component; recognition and session fixes; Wave D infrastructure.

**Success targets** (harness: 4x CPU, Fast 4G, 390x844 DPR 3, median of 5):

| Area | Baseline | Target | Phase |
|---|---|---|---|
| Persistence cost per mutation (sales N=1,000) | 23 ms | no traversal (unit test proves 0 property reads before flush) | A |
| Sales stream / mark-all-seen, 1,000 items | 3.4 s to 41 s | under 0.3 s desktop; no long task over 200 ms at 4x | A |
| Plants cold fill 197 x 120 | about 36 s main thread | under 500 ms (A); zero `/watering/plant` requests on list entry (C) | A, C |
| EXPLAIN on list queries | `SCAN p` + temp B-tree | `SEARCH ... USING INDEX`, no temp B-tree | A |
| List endpoint first page | `/plants` 6.8 ms, 110 KB at 197 plants | single-digit ms at 100k plants; under 20 KB gzip; loop block under 5 ms at 20k | B |
| Substrate list S=1,000 C=30 I=10 | 452 ms/query | under 10 ms per page | B |
| Plants view requests | 1 + P (197) | 2 or fewer | B, C |
| Server restart | logs everyone out | sessions survive | B |
| `GET /sales` | scrapes inside request | independent of shop latency (10 s mock delay, replay under 100 ms) | B |
| Tab entry, any tab, any N | 0.7 s (N=300), 25 to 37 s (N=2,000) | under 50 ms blocked at 4x | C |
| First list mount | O(N) | under 100 ms at 4x with a 30-item page | C |
| DOM nodes all tabs N=2,000 | 36k | under 12k | C |
| Heap across 20 tab switches | grows | under 10 percent growth | C |
| Image requests per card | 2, both full size | 1 sized variant; CLS 0 | C |

---

## 2. Execution model

### 2.1 Branch, commits, PR
- Branch `perf/scaling` from `main` (`f11430d`). No direct commits to main, no stacked PRs, one final PR.
- First commit `docs: add performance audits and scaling plan` (two audit files plus this plan copied to `docs/superpowers/plans/2026-10-12-perf-scaling.md`).
- Conventional Commits without scope, lowercase imperative (feat, fix, refactor, chore, docs, test). Never mention Claude, Anthropic or AI; no attribution trailers (user rule overrides any harness reminder).
- Path-scoped commits only: `git add -- <paths>`, `git commit -m "..." -- <paths>`. Never `git add -A`. On `index.lock` wait and retry up to 3 times. No amend, no force push.

### 2.2 SDD ledger
Lives in `.superpowers/sdd/2026-10-12-perf-scaling/` (gitignored via `.superpowers/sdd/.gitignore`), same format as earlier ledgers. Files: `plan-path`, `progress.md`, `task-<ID>-brief.md`, `task-<ID>-report.md`, `review-<base>..<head>.diff`, `phase<X>-gate-report.md`, `harness-<label>.md`.

`progress.md`: header (plan path, spec paths, branch, base commit, baseline test counts), `## Pre-flight scan` per phase (table: pair/task, produces vs consumes, finding; e.g. `toImageDto` from B-2 consumed by B-5, B-7, B-8), `## Rulings` (`Ruling: <decision> - <reason> - <cost>`). Line forms: `Task <ID>: dispatched (<model>, group <G>)`, `implemented <sha> (<base>..<head>); review pending`, `review Needs fixes: <n> Critical, <n> Important (...). Fix round <k>/5 dispatched.`, `minor (deferred): ...`, `complete (commits <base>..<head>, review clean | fix round <k>/5 addressed)`, `Carry into <ID>: ...`, `Phase <X> gate: pass|fail (...)`, `Harness <label>: <metric>=<value> (file scripts/perf/results/<file>)`. Deferred minors are triaged in Z-4.

### 2.3 Roles and models
| Role | Agent | Model | Used for |
|---|---|---|---|
| Controller | main session | Opus | dispatch, ledger, rulings, pre-flight scans, gate triage |
| Implementer (default) | general-purpose | Sonnet | S/M tasks with a fully specified design |
| Implementer (hard) | general-purpose | Opus | A-1, A-3, B-1, B-9, B-10, B-11, B-12, C-3, C-5, C-7 |
| Reviewer (default) | independent general-purpose, fresh context | Sonnet | every S/M task |
| Reviewer (hard) | independent general-purpose or `ruflo-core:reviewer` | Opus | hard tasks, every migration task, Z-4 whole-branch review |
| Gate runner | general-purpose | Sonnet | runs gates, reports, does not fix |
| Gate fixer | general-purpose | Sonnet (Opus for cross-task failures) | fixes from failure log and owning brief |
| Harness runner | general-purpose | Sonnet | P0-6, phase harness runs, Z-3 (follows browser-hygiene) |

Implementers write code and tests but NEVER run tests or any gate (no lint, typecheck, vue-tsc, check-keys, coverage, build); they may run `pnpm exec prettier --write <touched files>` and `pnpm install` only when the task adds a dependency (ruling recorded in P0-1). Reviewers read diffs and files, never run tests.

### 2.4 Parallelism rules
Parallel only inside a declared group and only with disjoint allowlists. Every brief lists "Allowed files" and "Read-only references"; touching others is a review Critical unless the controller records a ruling.

Single owner of shared files per phase:
- `migrations/index.ts`, `core/database/schema.ts`, `tests/integration/migrations.test.ts`: A-6 (0006), then B-2 (0007 to 0009).
- `core/config/env.ts`, `constants.ts`, `app.ts`, `backend/package.json` + lockfile: B-1 (Phase B); D-4 then D-5 (Phase D).
- `tests/contract/harness.ts`: B-11. `support.ts`, `integration/repositories.test.ts`, `routes.contract.test.ts`, `platform.contract.test.ts`: B-15.
- `frontend/src/locales/en.ts`, `de.ts`: C-0 (others report missing keys; controller adds them in `chore: add missing locale keys` before the gate).
- `frontend/src/types/*.d.ts`, `mapping/*`, `tests/helpers.ts`, `tests/mapping.test.ts`: C-3 in Phase C (A-3 owns `saleTypes.d.ts` and `SaleMapping.ts` in Phase A; C-7 takes them after C-3).
- `frontend/vite.config.ts`, `frontend/index.html`: C-11, then D-3.
Always serialize lockfile changes and migrations.

### 2.5 Task lifecycle
1. Controller writes the brief (task block, relevant KD, cross-cutting block 4.1, allowlist, carry notes).
2. Implementer implements, writes listed tests, formats touched files, commits per 2.1, writes the report.
3. Controller records `implemented`, saves the review diff, dispatches the reviewer (template 4.2).
4. Verdict: Approved / Approved with minors (record minors as deferred; promote only correctness risks) / Needs fixes (fresh implementer gets Critical and Important findings). Max 5 fix rounds; after 2 on the same issue escalate to Opus or record a ruling; after 5 stop and ask the user.

### 2.6 Review rubric
1 spec compliance; 2 allowlist, no unrelated reformatting; 3 correctness (empty lists, guests read-only and no `mine`, ownership in SQL, public vs private, logout in flight, locale switch, timezone for watering days, cursor tampering, concurrency); 4 performance intent (no O(N) per mutation, no deep watchers, no per-item Intl/Luxon, bounded SQL with LIMIT, no scraping in request path, yields in long loops); 5 tests (fail on old behaviour, specific assertions, no timing-threshold flakiness, fake timers restored, shared helpers); 6 conventions (Options API, tokens, icons from `theme/icons.ts`, both locales, no em dashes, no needless comments, English, cross-platform scripts, commit format); 7 migrations (forward-only, registered and listed in `migrations.test.ts`, safe on existing data, partial indexes queried with literals); 8 security (limit caps, malformed cursor 400, no private data in public scope, no secrets in logs). Verdict format: `Approved` | `Approved with minors` | `Needs fixes`, findings tagged Critical/Important/Minor with file:line and concrete fix.

### 2.7 Phase gate procedure
Runs only when every task of the phase is `complete`. Gate runner executes from repo root.
Backend: `pnpm --dir backend run lint`, `format:check`, `typecheck`, `test:coverage`, `build`.
Frontend: `pnpm --dir frontend run lint`, `format:check`, `pnpm --dir frontend exec vue-tsc --noEmit`, `run check-keys`, `exec vitest run --coverage`, `run build`.
Plus the phase's harness checks (section 5). Report `phase<X>-gate-report.md`: exit codes, failing tests with first error lines, coverage vs thresholds (backend 70/70/60/70; frontend lines 55, statements 54, functions 45, branches 42). Controller maps each failure to its owning task and dispatches gate fixers (parallel only across disjoint files), reruns the complete gate; max 3 iterations then ask the user. Flaky tests are fixed in the gate (usual causes: pending persistence timers, slow imports). Coverage drops are fixed with tests, never by lowering thresholds.

---

## 3. Key designs (quote the relevant KD in each brief)

### KD-1 Action-boundary persistence (replaces the deep `$subscribe`)
`PersistEntry<S>` keeps `key, keepOnClear, pick, apply, allowExpired, timestamp` and adds `dirtyOn?: readonly string[]` (actions whose completion can change the entry; omitted = any) and `version?: (state) => unknown` (change token compared with `Object.is`; unchanged = skip write; copy-on-write lists return the list reference, settings a primitive).
Store properties: `$hydrate(keys?)`, `$cancelPersist()`, `$persist(keys?)` (explicit mark for writers outside an action), `$flushPersist()`.
Change detection: `store.$onAction(({name, after, onError}) => { after(() => mark(name)); onError(() => mark(name)); }, true)` (detached); `store.$patch` wrapped so that after the original patch every entry is marked unless suppressed. No `$subscribe`, no watcher of any depth.
`mark(name)` no-ops while suppressed; otherwise adds matching entries to a `dirty` set and restarts the trailing 250 ms debounce.
Flush, per dirty entry: (1) compute `ts`; null keeps it dirty and skips (a loading store never overwrites a good snapshot); (2) entry without timestamp and hydration not yet attempted: skip (defaults never clobber stored settings); (3) version token unchanged: drop from dirty, skip; (4) else write `rawSnapshot(pick(state))` in the existing envelope `{ data, keepOnClear, timestamp }`. No `JSON.stringify`, no `JSON.parse`, no `last`-string map.
`rawSnapshot`: recursive `toRaw` over arrays and plain objects; in dev throws on Map/Set; runs once per flush.
`$hydrate(keys?)`: coalesced (one in-flight promise per store and key set), applies values while writes are suppressed, records each entry's token and clears its dirty flag, marks hydration attempted for requested entries.
`$reset`: cancels timer, clears dirty, suppresses writes during original reset, recomputes tokens. `$cancelPersist`: clears timer and dirty set.
Unload: module-level set of flushers; one `pagehide` and one `visibilitychange`-to-hidden listener flush every store immediately.
Enforcement: conventions test rejects store-state assignments outside `src/stores` (regexes `use\w+Store\(\)\.\w+\s*=[^=]` and `this\.\w+Store\.\w+\s*=[^=]`).
Test adaptation: demo store in `persistence.test.ts` gains actions (`setItems`, `setStatus`); `helpers.ts` `storageModule().set` runs `structuredClone(value)` so a leftover proxy fails like IndexedDB would.

### KD-2 Keyset pagination contract
Backend `backend/src/core/pagination/`:
- `listQuery.ts`: `parseListQuery(query, { sorts, defaultSort, scopes?, defaultScope })` returns `{ limit, cursor, q, sort, scope }`; limit default 30 max 100 (`LIST.DEFAULT_LIMIT`, `LIST.MAX_LIMIT` in `core/config/constants.ts`); `q` trimmed max 100 chars; `sort`: `created` = `created_at DESC, id DESC`, `name` = `name COLLATE NOCASE ASC, id ASC`; `scope`: `mine | public`; invalid input raises `ValidationError` (400).
- `cursor.ts`: opaque base64url of `{ s: sortKey, v: lastValue, id: lastId }`; malformed cursors and cursors for a different sort are rejected.
- `keyset.ts`: `applyKeyset(qb, { column, idColumn, direction, cursor })` using row-value comparison `(col, id) < (?, ?)` DESC / `>` ASC; always `ORDER BY col dir, id dir LIMIT limit + 1`; `toPage(rows, ...)` returns `{ items, nextCursor }`.
- `envelope.ts`: body `{ data: { items, next_cursor: string | null, total?: number } }`; `total` only on first page via one `COUNT(*)` with the same filter.
Query rules: partial indexes (`WHERE is_public = 1`) need the literal: write scope as ``sql`p.is_public = 1` `` never as a bound parameter; an EXPLAIN test covers every list query. `q` uses `LIKE '%' || ? || '%' ESCAPE '\'` after escaping `%`, `_`, `\`, against name only (`mine` may also search species name).
HTTP caching: `@fastify/compress` (br, gzip, threshold 1 KB, never on `text/event-stream`), `@fastify/etag` (weak), list and detail send `Cache-Control: private, no-cache`; uploads `maxAge` 365 d `immutable`.
Frontend helper `frontend/src/stores/paged.ts`: `pagedState()` (`items` shallow array of frozen elements replaced copy-on-write, `nextCursor`, `total`, `query {q, sort}`, `status`, `fetchedAt`, `etag`), `loadFirst`, `loadMore`, `loadAll` (loops pages of 100), `setQuery` (resets, coalesces, request sequence number drops stale responses). Owned data (plants `mine`, substrates `mine`, components catalogue) uses `loadAll` and client search over a precomputed `searchText`; foreign data (plants `public`, substrates `public`) is paged server-side with `q`/`sort` debounced 250 ms at the input. Persistence stores owned lists in full and only the first default-query page of a public scope.
`ItemsOverview` contract: props `items` (frozen view models), `hasMore`, `loadingMore`, `serverSearch`, `active`, plus existing; events `load-more`, `query-change {q, sort}` in server mode. Renders a growing client window (40 cards, plus 40 per `ion-infinite-scroll`); at window end with `hasMore` emits `load-more`. Each card is `OverviewCard.vue` with one frozen view model. `li` gets `content-visibility: auto; contain-intrinsic-size: auto 260px`, `.tag-card` `contain: content`. Client mode: `filteredItems` is a `computed`; server mode: just `items`. The grid lives in its own child component so outlet re-renders never reach it.

### KD-3 Plant list read model, windowed watering, write responses
`GET /plants?scope=mine|public&limit&cursor&q&sort&tz_offset`: item `{ plant_id, plant_name, user_id, is_public, created_at, species_name, substrate: {substrate_id, substrate_name} | null, cover: ImageDTO | null, image_count, watering: WateringSummary | null }`. Default scope `mine` for users, `public` for guests; guest `mine` = empty page.
`WateringSummary = { last_watered_at, last_fertilized_at, avg_interval_days }` (epoch ms or null; `avg_interval_days` null with fewer than two distinct local days), only for `mine`, via correlated scalar subqueries on `idx_watering_history`: `MAX(date)`, `MAX(date) WHERE used_fertilizer = 1`, `MIN(date)`, `COUNT(DISTINCT date(date,'unixepoch',:tz))`; `:tz` from `tz_offset` (validated -840..840 minutes) as `'<n> minutes'`; average = `calendarDays(firstDay,lastDay)/(dayCount-1)`, mirroring `frontend/src/utils/wateringStats.ts averageIntervalDays`. Shared SQL in `backend/src/modules/watering/infrastructure/wateringSummary.ts`.
Cover: newest image via scalar subquery (`ORDER BY upload_date DESC, id DESC LIMIT 1`), then one `IN (...)` load; `image_count` scalar COUNT. Detail `GET /plants/:id`: summary plus `images: ImageDTO[]` oldest first.
History `GET /watering/plant/:plantId?before=<cursor>&limit=50` returns `{ items: [{ id, plant_id, date, used_fertilizer, fertilizer_type_id }], next_cursor }`, `date DESC, id DESC`, `plant_name`/`owner_id` dropped, date epoch ms.
Writes return what changed: `POST /watering/batch` -> `{ records, summaries }`; `/batch/delete` -> `{ summaries }`; single add/edit/delete -> `{ record?, summary }`; writes accept `tz_offset`; inserts use `RETURNING`; ownership via `EXISTS`.
Client: `wateringStatus(summary, now)` O(1); watering store holds records only for an opened plant (newest window plus "show older"); patches plant summaries from write responses; never refetches histories on the write path.

### KD-4 Sales server model (SSE replay from the database)
Migration `0008_sales`: `sales_items(sale_id TEXT PK, source_key, seller, name, link, image_url, old_price REAL, new_price REAL NOT NULL, discount_pct INTEGER, first_seen_at, last_seen_at, scraped_at (epoch ms), active INTEGER NOT NULL DEFAULT 1)` with indexes `idx_sales_active_first_seen(first_seen_at DESC, sale_id) WHERE active = 1`, `idx_sales_source(source_key, active)`, `idx_sales_inactive_seen(last_seen_at) WHERE active = 0`; `sales_price_points(sale_id REFERENCES sales_items ON DELETE CASCADE, observed_at, price, PRIMARY KEY (sale_id, observed_at)) WITHOUT ROWID`; `sales_source_state(source_key PK, last_attempt_at, last_success_at, consecutive_failures, next_due_at)`.
`SQLiteSalesRepository.applySourceSnapshot(sourceKey, seller, sales, runAt)` in one transaction: upsert (preserve `first_seen_at`; `active=1`, `last_seen_at=runAt`, `scraped_at` = page fetch time); insert a price point only when price differs from the latest, trim to `SALES_PRICE_POINTS_MAX` (30); deactivate this source's active items missing from the snapshot (an empty snapshot never deactivates). Also `pageActive({limit,cursor})` (keyset over `(first_seen_at DESC, sale_id)` with KD-2 helpers), `findById`, `history(id)` (max 30 ascending), `summary(since)` -> `{ total, new_since, refreshed_at, latest_first_seen_at }`, `pruneRetention(now)` (items inactive over 30 days, price points older than 180 days), source state get/set.
`modules/sales/application/SalesRefresher.ts`: single-flight per source (`Map<key, Promise>`); limiters (2 Chromium, 8 plain HTTP) move to `limiter.ts`; each run fetches pages 1..maxPages in order with `{ bypassCache: true }`, stops at first empty page (SALES-5), builds `Sale` stamped with real fetch time, writes one snapshot. Failure (all pages failed): `consecutive_failures++`, `next_due_at = now + min(interval, 5 min * 2^failures)` (negative cache, DBE-10), items stay active (stale-while-revalidate). Success: `next_due_at = now + interval` plus or minus 10 percent jitter. `start()` runs a staggered warm-up for stale sources then per-source unref'd `setTimeout` chains; `stop()` clears them. Hooked in `salesRoutes` via `onListen`/`onClose` so `app.inject` tests never start it; `SalesRouterDeps` gains `autoRefresh?` and `onRefresher?`. Config (B-1 adds to `env.ts`): `SALES_REFRESH_ENABLED` (true), `SALES_REFRESH_INTERVAL_MIN` (120), `SALES_REFRESH_WARM_DELAY_MS` (5000), `SALES_RETENTION_DAYS` (30), `SALES_PRICE_POINTS_MAX` (30).
Read path: `GET /sales` stays SSE with existing ticket and EventSource contract: loop `pageActive({limit: 100, cursor})` and `sse.sendUnique(items, 'sale_id')`, yield with `setImmediate` between chunks, stop on abort; `done { total }` unchanged from `SseManager`; nothing scraped in the request. DTO: `sale_id, sale_name, sale_seller, sale_link, sale_image_url, sale_old_price, sale_new_price, sale_discount_pct, sale_first_seen_at, sale_scraped_at` (epoch ms). Also `GET /sales/summary?since=<ms>` (bearer, guests allowed), `GET /sales/:id` (item plus `history: [{price, observed_at}]`); admin recheck `POST /sales/health/:key/check` unchanged.
Client: stream chunks go to a non-reactive buffer, committed once on `done` (frozen items in a `markRaw` array); an empty store commits at most every 250 ms so the first screen fills. NEW: `isNew(id) = firstSeenAt > seen.watermark && !seen.ids.has(id)`; persisted `sales_seen = { watermark, ids }` (keepOnClear); first install `watermark = now - 7 days` (`NEW_WINDOW_DAYS`); `markSeen` adds one id; `markAllSeen` sets watermark to `latest_first_seen_at` and clears ids; ids at or below watermark or no longer in the list are pruned at commit. Badge from persisted `sales_summary = { total, newCount, refreshedAt }`; `TabsPage` hydrates only `sales_summary` and `sales_seen`, then fetches `/sales/summary` after first paint. `ensureFresh()` only from `SalesOverview` `ionViewDidEnter`: replays when no local list or server `refreshed_at` is newer. `sales_data` written only when fingerprint (`count + max(scraped_at)`) changes. `sales_price_history` removed (old key deleted once); `SalesDetails` loads history lazily from `/sales/:id`, never opens a stream.

### KD-5 Image variants and the image component
Migration `0007_image_variants`: `images` adds `width, height, placeholder (dominant colour #rrggbb), variants INTEGER NOT NULL DEFAULT 0` (1 = 160, 480, 1024 webp exist).
Upload: `sharp(input, { limitInputPixels: UPLOAD_MAX_PIXELS })` (40 Mpx), `.rotate()`, strip metadata; one decode `clone()`d per width (160, 480, 1024), webp q78 without `nearLossless`; files `<base>-160.webp`, `<base>-480.webp`, `<base>.webp` (1024 keeps the stored `image_url`); dimensions from the 1024 variant; placeholder from `stats().dominant`; semaphore of 2 concurrent uploads, `sharp.concurrency(2)`, `sharp.cache(false)`. No AVIF (Q3).
`ImageDTO = { id, url, srcset | null, width, height, placeholder, date }` via `modules/images/presentation/imageDto.ts`; `srcset` only when `variants = 1`.
Remove `GET /images/:entityType/:entityId?size=` and `readAsWebp`; `ImageCleanupService` deletes all variant files.
Backfill `backend/src/tools/backfillImageVariants.ts` (`pnpm run images:backfill [--dry-run] [--batch 50]`): resumable (`WHERE variants = 0 ORDER BY id LIMIT ?`), idempotent (files first, then row update); a paced background pass after listen when `IMAGE_BACKFILL_ON_START` is set, yielding with `setImmediate` between images.
`ProgressiveImage.vue` rewrite (name kept): props `image` (ImageView) or `src` (third-party sale images), `sizes`, `priority`, `kind`, `seed`, `alt`; container reserves aspect ratio from width/height (or 4:3); placeholder layer (dominant colour plus baked art in one element) stays mounted; one native `<img loading="lazy" decoding="async" srcset sizes width height>`; `priority` = `loading="eager" fetchpriority="high"`; opacity fade on `load` guarded by `prefers-reduced-motion`; `@error` keeps placeholder; no `new Image()` preloaders, no `ion-img`. `PlantPlaceholder.vue` renders one element whose background is a data-URI SVG cached per (kind, variant, tint, theme) at module level.

### KD-6 Recognition
`vectorsForUser` starts from `plants WHERE user_id = ?` joining images and embeddings. Remove boot-time `purgeOrphans` (first verify migration 0002 handled pre-FK data). Backfill is the queue: batches of 50 with `setImmediate` yields, resumable via `LEFT JOIN ... IS NULL`, short-circuits on `EXISTS`, reruns 5 s after an upload so work dropped by a full in-memory queue is picked up; queue length in recognition health. One sharp decode with `clone()` produces tensor and snapshot webp; `limitInputPixels` on every sharp call. Per-user vector cache (LRU of 20 users) invalidated when an image is stored or deleted.

### KD-7 Sessions, hashing, proxy
Migration `0009_sessions`: `sessions(sid TEXT PK, user_id REFERENCES users ON DELETE CASCADE, expires_at, created_at)`, indexes `(user_id, created_at)`, `(expires_at)`. `sessionStore` keeps its synchronous interface (`create, has, count, end, deleteAll`) backed by prepared better-sqlite3 statements. Tickets stay in memory with lazy prune on `create` and exported `sweepTickets()`. `core/auth/passwords.ts`: `hashPassword` via `crypto.scrypt` (N 16384, r 8, p 1, 64-byte key) stored `scrypt$N$r$p$salt$hash`; `verifyPassword` accepts scrypt and legacy `$2` bcrypt hashes and reports `needsRehash`; login rehashes legacy hashes. `trustProxy` reads `TRUST_PROXY_HOPS` (default 1).

### KD-8 Infrastructure (Wave D)
nginx: `/uploads/` from the data volume mounted read-only (`alias`, `expires 1y`, `public, immutable`, `sendfile`, `open_file_cache`); `/api/` buffered, `proxy_buffering off` only on SSE locations (`/api/v*/sales` exactly, `/api/v*/more-info/`); `gzip_vary on`, `gzip_comp_level 5`, `gzip_static` with precompressed `.gz`/`.br`; `workbox-*.js` immutable; http2 documented for whoever terminates TLS. Compose: memory limits, `UV_THREADPOOL_SIZE=8`, `NODE_OPTIONS=--max-old-space-size`, json-file log rotation. Backend: log rotation, 401s at debug, maintenance scheduler, heavy startup after listen, bounded prepared-statement cache, event-loop delay histogram on `/health`.

---

## 4. Phases and tasks

Notation: **Fnd** findings, **Files**, **Steps**, **Tests** (written by the implementer, run at the phase gate), **Dep** blocked by, **Grp** parallel group, **Eff** S/M/L (+ model note when Opus). Paths: backend paths relative to `backend/src` unless prefixed `tests/` (then `backend/tests/`), frontend paths relative to `frontend/src`.

### Phase 0: branch, ledger, perf harness, baselines

**P0-1 Branch, plan, ledger (controller).** Files: create `docs/superpowers/plans/2026-10-12-perf-scaling.md`; add both audit docs; root `.gitignore` add `scripts/perf/results/`; ledger files. Steps: `git switch -c perf/scaling`; commit `docs: add performance audits and scaling plan`; write ledger header with baseline test counts from one baseline run (the only test run before Phase A, recorded as a ruling); record rulings (parallel policy, prettier/install permissions, no attribution lines, model allocation, UI broken between B-G and C-G). Blocks everything. S.

**P0-2 Harness core.** Create `scripts/perf/lib/session.mjs` (reads `data/agent-<id>/dev-session.json` via `scripts/dev/lib/session.mjs sessionPaths`), `scripts/perf/lib/browser.mjs` (Playwright from `backend/node_modules` via `createRequire`, `channel: 'msedge'` falling back to Chromium, fresh context 390x844 DPR3 mobile touch, CDP `Emulation.setCPUThrottlingRate {rate:4}` and `Network.emulateNetworkConditions` Fast 4G constants in one place, init script with buffered `longtask` PerformanceObserver), `scripts/perf/build-dist.mjs` (runs `vite build --outDir dist-perf` with the session's `VITE_API_URL` via `process.execPath`), `scripts/perf/serve-dist.mjs` (Node http: gzip+br via zlib, hashed assets immutable, `index.html`/`sw.js` no-cache, SPA fallback, proxies `/api` and `/uploads` to the session backend), `scripts/perf/README.md`. Every script supports `--help`; no shell syntax. Dep P0-1; blocks P0-3/4/5. M. Risk: browser availability (fallback documented). Acceptance: build+serve gives a working login page against a dev-up backend.

**P0-3 Amplification and plan checks (Grp P0-w1).** Create `scripts/perf/amplify.mjs --id --plants 180 --records-per-plant 120 --substrates 90 --components 40 --public-plants 0 --user grower` (plants/substrates via API with `scripts/dev/seed/context.mjs createContext().call`, names prefixed `perf-`; watering records and extra image rows via `ctx.sql`; `--public-plants 100000` bulk-inserts public plants for `collector`; `--reset` deletes `perf-` rows), `scripts/perf/explain.mjs`, `scripts/perf/explain-expectations.json` (requires `USING INDEX <name>`, forbids `USE TEMP B-TREE`, PASS/FAIL per query). Acceptance: grower sees 197 plants and about 21.7k records (audit dataset). M.

**P0-4 API timing (Grp P0-w1).** Create `scripts/perf/apitime.mjs`: log in, time each endpoint 7 times (median, p95), record raw/gzip/br bytes, `--endpoints` templates, JSON to `scripts/perf/results/` and markdown to stdout. S.

**P0-5 Sales injection and navigation benchmark (Grp P0-w1).** Create `scripts/perf/inject-sales.mjs` (`--n --points 12 --mode idb` writes `sales_data` and `sales_price_history` envelopes into Ionic Storage IndexedDB `_ionicstorage`/`_ionickv`; `--mode db` exits 2 until B-14), `scripts/perf/navbench.mjs` (`--runs 5 --scenario tabs|sales-entry|plants-cold|mark-all-seen|search --label`; logs in through the login form since prod builds have no `devToken`; scenarios use tab-bar taps; records per step long-task count, blocked time (duration minus 50 ms), longest task, DOM node count, `JSHeapUsedSize`, requests by path, image requests per card; medians as JSON; `--compare <baseline> --targets` prints deltas and PASS/FAIL), `scripts/perf/lib/metrics.mjs`. L. Acceptance: `sales-entry` at N=300 reproduces about 0.7 s blocked.

**P0-6 Baselines (harness runner, browser-hygiene).** `node scripts/dev-up.mjs --id perfbase`; amplify; build and serve dist; run `sales-entry` N=300 and N=2000 (cap 60 s), `plants-cold`, `mark-all-seen` (N=1000), `tabs`, `apitime`, `explain`; commit `scripts/perf/baselines/main-f11430d.json` as `chore: add performance baselines`; numbers to the ledger; dev-down; close browser. Dep P0-3/4/5. Only the A-G comparison needs this; Phase A implementation does not wait. M.

**Phase 0 gate:** `node --check` on every harness script; P0-6 succeeded.

### Phase A: remove the multipliers (no list contract change)

Groups: A-w1 {A-1, A-4, A-6, A-7}; A-w2 {A-2a, A-2b, A-3, A-5}; A-w3 {A-8}; then A-G.

**A-1 Action-boundary persistence plugin.** Fnd NAV-4, DSAL-1, STA-1, DPLA-1, STA-2, DSAL-11, DSUB-7, DPLA-6, STA-5, DSAL-10, SALES-8, FE-10. Files: modify `stores/persistence.ts`, `stores/pinia.ts`, `tests/persistence.test.ts`, `tests/helpers.ts`, `tests/conventions.test.ts`; read-only every store. Steps: implement KD-1 exactly, keeping the envelope and the semantics of `$hydrate()` with no arguments. Tests: (1) traversal regression: 1,000 objects with enumerable getters that count reads; 100 `status`-only actions give 0 reads before flush and at most 1,000 during it (old plugin: 100,000); (2) `dirtyOn` isolation; (3) `version` skip; (4) `$patch` outside an action persisted; (5) direct assignment outside an action not persisted until `$persist()`; (6) concurrent `$hydrate` reads each key once; (7) `$hydrate(['k'])` reads only `k`; (8) timestamp-less entry not written before hydration attempted; (9) `$reset`/`$cancelPersist` drop pending writes; (10) pick of reactive objects stores a cloneable plain value; (11) `pagehide` flushes immediately; plus conventions test for direct store writes. Dep P0-1; blocks A-2a, A-2b, A-3, C-2. M, Opus implementer and reviewer. Risk: a missed write path silently stops persisting; rollback revert. Acceptance: no `$subscribe` left in `src/stores`; all tests present.

**A-2a Owned collection stores: copy-on-write (Grp A-w2).** Fnd STA-13, DSAL-12 (store half), REN-3 (data half), DSUB-17, DSUB-7, DPLA-6. Files: `stores/plants.ts`, `substrates.ts`, `components.ts`, `optimistic.ts`; tests `plantsStore.test.ts`, `substratesStore.test.ts`, `componentsStore.test.ts`, `optimistic.test.ts`. Steps: lists replaced wholesale, items frozen at commit, array `markRaw`; every update copy-on-write; `optimistic.ts` snapshots the previous array reference instead of `structuredClone`; an `idIndex` Map per list identity backs `byId`; persist entries declare `version: (s) => s.items` and `dirtyOn`. Tests: rollback restores previous reference; `byId` does not scan (spy on `Array.prototype.find`); one write per fetch action; no in-place mutation. Dep A-1; blocks A-8, C-4a, C-6a, C-6b. M.

**A-2b Watering, moreInfo, settings stores (Grp A-w2).** Fnd DPLA-1/2 (commit batching), STA-3 interim, STA-8, DPLA-6, DPLA-9 blob cap. Files: `stores/watering.ts`, `moreInfo.ts`, `calendar.ts`, `layout.ts`, `snapSettings.ts`; tests `wateringStore.test.ts`, `moreInfoStore.test.ts`, `calendarAndAdminStores.test.ts`, `layoutStore.test.ts`, `snapSettings.test.ts`. Steps: `ensureRecordsFor` collects worker results in a plain map and commits once per completed batch (`byPlantId` copy-on-write); maintained `maxLoadedAt` scalar replaces `Math.max(...spread)`; `moreInfo` becomes an LRU of 30 with per-key timestamps; settings stores declare `dirtyOn` and primitive `version` tokens. Tests: warming 200 plants gives at most `ceil(200/batch)` assignments; moreInfo eviction; settings not written on unrelated actions. Dep A-1; blocks C-4b, C-12. M.

**A-3 Sales store: per-snapshot commit, seen set, summary, lazy hydrate, bounded history (Grp A-w2).** Fnd DSAL-2, 4, 5 (short term), 10, 12, 13, STA-4, 5, 8, NAV-2, NAV-7, SALES-4, SALES-11. Files: `stores/sales.ts`, `utils/salesQuery.ts`, `mapping/SaleMapping.ts`, `types/saleTypes.d.ts`, `views/TabsPage.vue`, `views/sales/SalesOverview.vue`, `views/sales/SalesDetails.vue`, `components/SideMenu.vue` (badge source only); tests `salesStore.test.ts`, `salesQuery.test.ts`; read-only `utils/intlCache.ts`. Steps: stream frames into a plain Map in the action closure (remove `incoming` and `visibleSales`); cold empty store commits at most every 250 ms, otherwise one commit on `done`; price history via `nextHistory(prev, items, now)` pruned to current ids, capped at 30 points, assigned once; `isNew` leaves the items and becomes persisted `sales_new = { ids }` (`markSeen` deletes one id, `markAllSeen` is a single assignment, `newCount` = set size); entries declare `dirtyOn`; `TabsPage` calls `$hydrate(['sales_new'])` only, `SalesOverview.mounted` hydrates the rest via coalesced `load()`; `markSeen` moves to `SalesDetails` after first paint (`requestAnimationFrame`); `byId` uses a Map per list identity; `salesQuery` uses `intlCache` collator, takes an `isNew(id)` function, matches a `searchKey` (name + seller) precomputed in `SaleMapping`; card text memoized by `id + price + locale`. Tests: 1,000-item stream = one commit and one write per entry; `markAllSeen` on 1,000 items = one assignment and one write; existing NEW tests green; history pruned and capped; boot hydrates only `sales_new`; concurrent `load()` hydrates once; search does not match ids or URLs. Dep A-1, A-4; blocks C-7. M, Opus implementer and reviewer.

**A-4 Cached Intl formatters and collators (Grp A-w1).** Fnd REN-6, DSAL-3, NAV-3, DPLA-8, DSUB-11, REN-10 (formatters), STA-12 (formatters). Files: create `utils/intlCache.ts`, `tests/intlCache.test.ts`; modify `utils/formatPrice.ts`, `relativeTime.ts`, `enumLabels.ts`, `wateringStats.ts`, `localDate.ts` (only if it builds formatters); call sites only: `components/sales/PriceHistoryChart.vue`, `components/details/HorizontalGallery.vue`, `components/substrates/SubstrateContainer.vue`, `components/charts/PieChart.vue`. Steps: memoized `numberFormat`, `collator`, `dateTimeFormat`, `relativeTimeFormat`, `pluralRules` keyed by `locale + JSON.stringify(options)`; convert every hot-path `new Intl.*` and `localeCompare(..., options)` comparator. Tests: `Intl.NumberFormat` constructed once per key across 1,000 calls; output unchanged for de and en; collator ordering equals old `numeric: true`. S.

**A-5 Cheap containment and stable props (Grp A-w2).** Fnd REN-2 (interim), NAV-1 (adjunct), NAV-6b, REN-11. Files: `components/overview/ItemsOverview.vue` (style block only), `views/plants/PlantOverview.vue` (hoist `segments` into `data`), `theme/scrollbar.css` (drop the `*` selector, keep `:root`), `tests/viewReactivity.test.ts` (assert `segments` identity stable). S.

**A-6 Migration 0006: indexes, statistics, pragmas (Grp A-w1).** Fnd DBE-3, DSUB-14, DB-1, DB-2, DB-3 (index part), DB-4, DB-5, DBE-8, DBE-13 (journal). Files: create `core/database/migrations/0006_list_indexes.ts`, `tests/integration/queryPlans.test.ts`; modify `migrations/index.ts`, `core/database/db.ts`, `tests/integration/migrations.test.ts`. New indexes: `idx_plants_user_created(user_id, created_at DESC, id DESC)`, `idx_plants_user_name(user_id, name COLLATE NOCASE, id)`, `idx_plants_public_created(created_at DESC, id DESC) WHERE is_public=1`, `idx_plants_public_name(name COLLATE NOCASE, id) WHERE is_public=1`, `idx_plants_substrate(substrate_id) WHERE substrate_id IS NOT NULL`, `idx_substrates_user_created`, `idx_substrates_user_name`, `idx_substrates_public_created`, `idx_substrates_public_name` (same patterns), `idx_substrate_components_component(component_id)`, `idx_components_name(name COLLATE NOCASE, id)`; recreate `idx_images_lookup` as `(entity_type, entity_id, upload_date, id)`; drop `idx_plants_list`. `db.ts`: `busy_timeout = 5000`, `journal_size_limit = 67108864`, after migrations `analysis_limit = 1000` then `optimize = 0x10002`, `closeDb` runs `PRAGMA optimize`. Tests: migration list includes `0006`; plan test seeds rows, runs `ANALYZE`, asserts the mine/public list SQL (with literal) uses the new indexes with no `USE TEMP B-TREE FOR ORDER BY`; component lookup uses the new index. Blocks B-2. S, Opus reviewer.

**A-7 Account deletion for substrate owners (Grp A-w1).** Fnd DB-3, DBE-12. Files: `modules/auth/application/AuthUseCases.ts`, `modules/auth/infrastructure/SQLiteUserRepository.ts`, `modules/images/application/ImageCleanupService.ts`; create `tests/contract/accountDeletion.contract.test.ts`. Steps: `deleteAccount(userId)` in one transaction: collect image rows of the user's plants and substrates, delete them, delete the user's substrates (other users' plants get `SET NULL`, junction rows cascade), delete the user; after commit unlink files. No table-rebuild migration. Tests: owner of public and private substrates with images deletes successfully (was `SQLITE_CONSTRAINT_FOREIGNKEY`); files removed; another user's plant ends with `substrate_id = null`. S. Risk: Q2.

**A-8 Substrate component removal, replace semantics (Grp A-w3).** Fnd DSUB-9, DSUB-10 (edit half). Files: backend `modules/substrate/infrastructure/SQLiteSubstrateRepository.ts`, `application/SubstrateUseCases.ts`, `presentation/substrateController.ts`; frontend `stores/substrates.ts`, `components/substrates/SubstrateFormModal.vue`; tests `tests/contract/substrates.contract.test.ts` (add cases), `tests/unit/modules/substrate.test.ts`, frontend `substratesStore.test.ts`, `formModals.test.ts`. Steps: `PATCH /substrates/:id/components` is a true replace in one transaction (`DELETE ... NOT IN (...)`, deletes all when empty; then `INSERT ... ON CONFLICT DO UPDATE SET parts`); ownership checked in SQL; modal sends the full selection in one request, simplifying the removal path at `:239-260`. Tests: unticking removes the component (contract); empty list clears all; foreign substrate 404; frontend sends one request with the full list. Dep A-2a. S.

**A-G Phase A gate.** Run 2.7 gates; run harness (`sales-entry` N=300 and 2,000, `mark-all-seen`, `plants-cold`, `explain`) and compare with baselines; write `harness-phaseA.md`. Pass: stream and mark-all-seen meet targets; plants cold fill under 500 ms main-thread JS; `explain` passes. Tab-entry numbers recorded, not gated (windowing lands in C).

### Phase B: read models and paging contracts (backend first, then contract tests)

Groups: B-w1 {B-1, B-2}; B-w2 {B-3, B-5, B-7, B-8, B-9, B-12, B-13}; B-w3 {B-4, B-6, B-10}; B-w4 {B-11}; B-w5 {B-14}; B-w6 {B-15}; B-w7 {B-16..B-19}; then B-G. The UI is expected to break against the new API until C-G (ruling; no browser checks in that window).

**B-1 Pagination core, HTTP caching, config keys, proxy hops (Grp B-w1).** Fnd DBE-1 (contract), DBE-2 (row budget), DBE-7, BE-5, IMG-8, BE-9, DBE-16, DBE-5 (limiter key). Files: create `core/pagination/{cursor,listQuery,keyset,envelope,index}.ts`, `tests/unit/core/pagination.test.ts`, `tests/integration/httpCaching.test.ts`; modify `core/config/env.ts`, `constants.ts`, `app.ts`, `package.json`, lockfile. Steps: backend part of KD-2; add `@fastify/compress` and `@fastify/etag` at their Fastify 5 majors; static uploads `maxAge: '365d'` and `immutable`; CORS `maxAge: 600`; `trustProxy` reads `TRUST_PROXY_HOPS`; add env keys with validation and defaults: `SALES_REFRESH_ENABLED`, `SALES_REFRESH_INTERVAL_MIN`, `SALES_REFRESH_WARM_DELAY_MS`, `SALES_RETENTION_DAYS`, `SALES_PRICE_POINTS_MAX`, `TRUST_PROXY_HOPS`, `IMAGE_BACKFILL_ON_START`, `UPLOAD_MAX_PIXELS`. Tests: cursor round trip; tampered or mismatched cursors 400; limit clamping; `q` escaping; keyset walk over 50 rows with duplicate `created_at` and limit 7 returns every row once, including with a row inserted mid-walk; integration: large JSON compressed, `etag` present and `If-None-Match` returns 304, SSE not compressed, uploads `immutable`, `TRUST_PROXY_HOPS=2` keys the limiter by client IP. M, Opus implementer and reviewer.

**B-2 Phase B schema and image DTO (Grp B-w1).** Fnd IMG-3, 4, 7 (columns), SALES-1, 7, 9 (tables), DBE-5, DSAL-5. Files: create `migrations/0007_image_variants.ts`, `0008_sales.ts`, `0009_sessions.ts`, `modules/images/presentation/imageDto.ts`, `tests/unit/modules/imageDto.test.ts`; modify `migrations/index.ts`, `core/database/schema.ts`, `core/config/uploads.ts` (`variantUrl`), `tests/integration/migrations.test.ts`. Steps: KD-5, KD-4, KD-7 schemas; `schema.ts` interfaces; `toImageDto`, `variantUrl`. Tests: migrations 0006 to 0009 apply on empty and on populated 0006 DB (existing images get `variants = 0`); `srcset` only when `variants = 1` with 160w/480w/1024w entries. Dep A-6. M, Opus reviewer.

**B-3 Image upload pipeline (Grp B-w2).** Fnd IMG-1, 7, 9, 15, 16, REN-14, REN-20, DBE-11 (sharp), BE-17. Files: `modules/images/infrastructure/LocalImageStorage.ts`, `SQLiteImageRepository.ts`, `application/ImageUseCases.ts`, `ImageCleanupService.ts`, `presentation/imageController.ts`, `imageRoutes.ts`, `domain/Image.ts`; tests `unit/modules/images.test.ts`, `imageCleanup.test.ts`, `contract/images.contract.test.ts`. Steps: KD-5 pipeline; persist dimensions, placeholder, `variants = 1`; delete the `?size` route and `readAsWebp`; cleanup removes all three files; per-user upload limiter (`createLimiter`, `perUserKey`); pixel cap returns `ValidationError`. Tests: EXIF-orientation-6 JPEG gives upright variants with swapped dimensions; three files at expected widths; oversized rejected; delete removes all variants; `?size` URL returns 404. Dep B-1, B-2. M.

**B-4 Variant backfill (Grp B-w3).** Fnd IMG-1 (backfill), DBE-14. Files: create `src/tools/backfillImageVariants.ts`, `tests/integration/imageBackfill.test.ts`; modify `package.json` (script only), `modules/images/index.ts` (`startVariantBackfill` on `onListen`/`onClose`). Steps: resumable batches, `--dry-run`, `--batch`, a missing source file sets `variants = -1` and is logged. Tests: idempotent; resumes after interruption; dry run changes nothing; missing files skipped. Dep B-3. S.

**B-5 Plants read model (Grp B-w2).** Fnd BE-1, BE-2, DBE-1, DBE-6, DPLA-2 (server), DPLA-7, IMG-12, DB-7, DPLA-13. Files: create `modules/watering/infrastructure/wateringSummary.ts`, `modules/plants/domain/wateringSummary.ts`, `tests/integration/plantListRepository.test.ts`; modify `modules/plants/infrastructure/SQLitePlantRepository.ts`, `application/PlantUseCases.ts`, `domain/Plant.ts`, `presentation/plantsController.ts`, `plantsRoutes.ts`; update tests `unit/modules/plants.test.ts`, `contract/plants.contract.test.ts`. Steps: KD-3 with port methods `listMine`, `listPublic`, `findById(id, viewerId, tz)`; remove `findAllPublic`, `findAllByUser`, the merging `GetAllPlantsUseCase` and list-side image grouping; scope filter is a literal; responses send `Cache-Control: private, no-cache`; create and update return the detail DTO. Tests: two records on the same local day count once; `tz_offset` moves a late-evening record to the next day; average null with fewer than two days; cover is the newest image; `image_count` correct; guest `mine` empty; private plants never in public; EXPLAIN uses 0006 indexes; 2,000 plants x 20 records lists under 50 ms (generous bound). Dep B-1, B-2. L, Opus reviewer.

**B-6 Watering history and write responses (Grp B-w3).** Fnd DPLA-3, 5, 14, DB-7, DBE-6, DBE-9 (read-after-write), DB-6. Files: `modules/watering/infrastructure/SQLiteWateringRepository.ts`, `application/WateringUseCases.ts`, `domain/WateringRecord.ts`, `presentation/wateringController.ts`, `wateringRoutes.ts`; tests `unit/modules/watering.test.ts`, `contract/watering.contract.test.ts`, `wateringBatch.contract.test.ts`. Steps: KD-3 with keyset paging on `(date DESC, id DESC)`; multi-row `INSERT ... RETURNING`; summaries from `wateringSummary.ts`; fertilizer types memoized and sent with `Cache-Control: private, max-age=3600`. Tests: paging over 120 records complete and ordered; batch create returns records and summaries equal to a fresh list read; delete returns summaries; foreign plant rejected; `plant_name` and `owner_id` absent. Dep B-5. M.

**B-7 Substrates read model (Grp B-w2).** Fnd DSUB-1, 2, 6 (server), 10, BE-3, DBE-1, DBE-8. Files: `modules/substrate/infrastructure/SQLiteSubstrateRepository.ts`, `application/SubstrateUseCases.ts`, `domain/Substrate.ts`, `presentation/substrateController.ts`, `substrateRoutes.ts`; create `tests/integration/substrateListRepository.test.ts`; update `unit/modules/substrate.test.ts`, `contract/substrates.contract.test.ts`. Steps: list summary `{ id, name, user_id, is_public, created_at, cover, component_count }` with scopes, keyset paging, `q`, and `component_id` filter for "used in"; detail from three queries (base row, components, images) assembled in Maps; remove `substrateRows` and `filterDuplicatesById`; `POST` and `PATCH` accept `components` with replace semantics in the same transaction. Tests: listing 20 substrates with 5 components and 3 images each takes at most 3 statements (spy on `getSqlite().prepare`), no S x C x I rows; create with components is one request; used-in filter is visibility-aware; EXPLAIN uses indexes. Dep B-1, B-2, A-8. M.

**B-8 Components read model (Grp B-w2).** Fnd DSUB-15, DSUB-4 (server), DB-6. Files: `modules/components/infrastructure/SQLiteComponentRepository.ts`, `application/ComponentUseCases.ts`, `domain/Component.ts`, `presentation/componentController.ts`, `componentRoutes.ts`; tests `unit/modules/components.test.ts`, `contract/components.contract.test.ts`. Steps: list `{ id, name, fineness_id, fineness_name, cover }` keyset-paged by name with `q`; detail includes images; fineness levels memoized with `max-age=3600`. Tests: ties handled; `q` case-insensitive; list has no `images`; fineness reads hit DB once. Dep B-1, B-2. S.

**B-9 Sales repository and domain (Grp B-w2).** Fnd SALES-1 (storage), 7, 9, DSAL-5, 6, 13. Files: create `modules/sales/infrastructure/SQLiteSalesRepository.ts`, `modules/sales/domain/SalesRepository.ts`, `tests/integration/salesRepository.test.ts`; modify `modules/sales/domain/Sale.ts`, `domain/index.ts`, `tests/unit/modules/sales.test.ts` (Sale parts). Steps: KD-4 repository; `Sale.fromRaw(raw, seller, scrapedAt)`; `discount_pct` computed at write; `toDto`. Tests: `first_seen_at` kept across upserts; price points added on change only and trimmed at 30; items missing from a snapshot deactivated but an empty snapshot deactivates nothing; keyset walk complete; `summary(since)` counts; `pruneRetention` cascades to price points; EXPLAIN of `pageActive` uses the partial index. Dep B-1, B-2. M, Opus implementer and reviewer.

**B-10 Sales refresher (Grp B-w3).** Fnd SALES-1, 2, 5, 6, BE-4, DBE-10, DSAL-14. Files: create `modules/sales/application/SalesRefresher.ts`, `limiter.ts`, `tests/unit/modules/salesRefresher.test.ts`; modify `modules/sales/presentation/salesRoutes.ts` (composition and hooks), `src/tools/devServer.ts` (auto refresh with short warm-up). Steps: KD-4; `FetchSalesOverview` imports the extracted limiter until B-11 removes it. Tests (fake timers, fake sources): concurrent refreshes share one scrape; stops at first empty page; failures back off exponentially while items stay active; success reschedules within interval plus or minus 10 percent; `stop()` leaves no timers; warm-up covers only stale sources and is staggered; `scraped_at` equals injected clock. Dep B-9. M, Opus implementer and reviewer. Rollback `SALES_REFRESH_ENABLED=false`.

**B-11 Sales read path (Grp B-w4).** Fnd SALES-1 (read), 4 (server), 9, 10, DSAL-6, 13, 14, NAV-10 (server). Files: modify `modules/sales/presentation/salesController.ts`, `salesRoutes.ts`, `core/sse/SseManager.ts`; modify `tests/contract/harness.ts` (pass `sales: { autoRefresh: false, onRefresher }`, expose `refreshSales()`); delete `modules/sales/application/FetchSalesOverview.ts`; update `unit/modules/sales.test.ts`, `contract/sales.contract.test.ts`. Steps: KD-4 read path; `SseManager` stringifies each item once and derives the size check from that string; `GET /summary` and `GET /:id` routes; recheck untouched. Tests: replay delivers exactly the active rows then `done { total }`; zero `fetchPage` calls during `GET /sales`; abort stops the loop; summary and detail shapes; one stringify per item. Dep B-10. M, Opus implementer and reviewer.

**B-12 Persistent sessions and off-loop hashing (Grp B-w2).** Fnd DBE-5, BE-7, BE-11, DSAL-14 (tickets). Files: create `core/auth/passwords.ts`, `tests/unit/core/passwords.test.ts`, `tests/integration/sessions.test.ts`; modify `core/auth/sessions.ts`, `core/auth/index.ts`, `modules/auth/application/AuthUseCases.ts`, `modules/auth/infrastructure/SQLiteUserRepository.ts` (`updatePasswordHash`); update tests `unit/core/auth.test.ts`, `unit/modules/auth.test.ts` (in-memory DB init). Steps: KD-7. Tests: a new store instance on the same DB file still sees the session; oldest session evicted at cap; expired sessions not live; user deletion cascades; scrypt round trip; legacy bcrypt hash verifies and is rehashed on login; `crypto.scrypt` used, not `scryptSync`; tickets pruned. Dep B-1, B-2. M, Opus implementer and reviewer. Risk: everyone re-logs in once.

**B-13 Recognition (Grp B-w2).** Fnd DBE-4, DPLA-11 (server), 12, REN-21, BE-13. Files: `modules/recognition/infrastructure/SQLiteEmbeddingRepository.ts`, `TempSnapshotStore.ts`, `application/EmbedImages.ts`, `MatchSnapshot.ts`, `ConfirmSnapshot.ts`, `index.ts`, `presentation/recognitionController.ts`; tests `integration/embeddingRepository.test.ts`, `unit/modules/embedImages.test.ts`, `recognitionRoutesBackfill.test.ts`, `confirmSnapshot.test.ts`. Steps: KD-6. Tests: only the caller's vectors, plan starts from `plants`; backfill batches, yields, resumes; a full queue loses nothing; one decode per snapshot; cache invalidated. Dep B-1, B-2. M.

**B-14 Dev seed, mocks and harness for the Sales model (Grp B-w5).** Files: create `scripts/dev/seed/steps/10-sales.mjs`; modify `scripts/dev/seed/index.mjs`, `backend/src/tools/devMocks.ts` (`DEV_MOCK_SALES_DELAY_MS`, default 0), `scripts/perf/inject-sales.mjs` (`--mode db`), `CLAUDE.md` (Sales row of the seed table). Steps: seed polls `GET /sales/summary` as grower until `total > 0` (30 s timeout); with `ctx.sql` backdate `first_seen_at` by 20 days for all, set every fourth item (by `rowid`) to 1 day ago for NEW pills, add four falling historical price points (days 4 to 1) to every third item; `inject-sales --mode db --n 2000` writes synthetic rows; update CLAUDE.md Sales row (refresher warms on start, a quarter NEW, every third item has a chart, pull-to-refresh replays from DB, admin recheck still scrapes). Dep B-11. S.

**B-15 Realign shared backend tests (Grp B-w6).** Files: `tests/integration/repositories.test.ts`, `tests/contract/support.ts`, `routes.contract.test.ts`, `platform.contract.test.ts`, and `recognition.contract.test.ts` and `moreInfo.contract.test.ts` where shapes changed. Steps: update `createPlant`, `createSubstrate`, `createComponent` to the new shapes; add `listPage` and `walkPages`; the route inventory lists new and removed routes. Dep B-3..B-14. S.

**B-16 Contract: plants and watering (Grp B-w7).** Create `contract/plantsList.contract.test.ts`, `wateringHistory.contract.test.ts`. Asserts: scopes per role; keyset walk equals full set; `q`/`sort`; `total` only on page 1; ETag 304 and gzip; write-response summaries equal list values; `tz_offset` validation; history paging; a 30-item first page under 20 KB gzip. M.

**B-17 Contract: substrates and components (Grp B-w7).** Create `contract/substratesList.contract.test.ts`, `componentsList.contract.test.ts`. Asserts: summaries and scopes; used-in filter; create and edit with components including removal; detail shapes; component paging and search; fineness caching headers. M.

**B-18 Contract: Sales model (Grp B-w7).** Create `contract/salesModel.contract.test.ts` using `refreshSales()`, `ticketFor`, `parseSse`. Asserts: replay after a refresh with `done { total }`; a price change adds one point and keeps `first_seen_at`; a failing source keeps its items; `GET /sales` answers even when sources throw or hang; `summary.new_since`; bounded detail history; guest access; recheck unchanged. M, Opus reviewer.

**B-19 Contract: images, sessions, proxy (Grp B-w7).** Create `contract/imageVariants.contract.test.ts`, `sessions.contract.test.ts`. Asserts: upload DTO has `srcset`, dimensions, placeholder; variants served `immutable`; `?size` returns 404; a refresh token survives a second app instance on the same DB file; logout ends the persisted session; with `TRUST_PROXY_HOPS=2` the limiter keys on client IP. S.

**B-G Phase B gate.** Run 2.7 gates (frontend must stay green); `apitime` at the amplified dataset and at 100k public plants; `explain` with KD-2 queries added; time the replay with `DEV_MOCK_SALES_DELAY_MS=10000`. Pass: first pages single-digit ms and under 20 KB gzip at 100k; substrate page under 10 ms at S=1,000; replay under 100 ms despite the 10 s mock delay.

### Phase C: client consumption

Groups: C-w1 {C-0, C-1, C-3, C-5, C-9, C-14}; C-w2 {C-2, C-4a, C-6b, C-8, C-12}; C-w3 {C-4b, C-6a, C-7, C-11}; C-w4 {C-10, C-13}; then C-G.

**C-0 Locale keys.** Files `locales/en.ts`, `de.ts`. Grep for existing equivalents first, then add (EN / DE): `list.loading_more` Loading more / Lade weitere; `list.load_more_failed` Could not load more. Try again. / Weitere Einträge konnten nicht geladen werden. Erneut versuchen.; `watering.show_older` Show older records / Ältere Einträge anzeigen; `components.selected_count` Selected ({count}) / Ausgewählt ({count}); `substrates.picker_title` Choose substrate / Substrat wählen; `substrates.picker_search` Search substrates / Substrate suchen; `careGuide.show` Show care guide / Pflegehinweise anzeigen; `sales.updated_at` Updated {time} / Aktualisiert {time}. Report any reuse of existing keys. S.

**C-1 API client: timeouts, in-memory token, refresh, epoch, ETag.** Fnd STA-6, 9, 10, 11, FE-5, DSAL-15, STA-14. Files `utils/apiUtils.ts`, `utils/tokenUtils.ts`, `stores/session.ts`, `stores/resource.ts`; tests `apiUtils.test.ts`, `apiRequest.test.ts`, `sessionStore.test.ts`, create `resourceEpoch.test.ts`. Steps: token kept in memory, IndexedDB touched only on login, refresh, logout, boot; proactive refresh: `getHeaders` reads the token synchronously and calls `ensureFresh()` which refreshes when under 60 s remain (`exp` decoded once per token), also on visibility-visible and `online`; `AbortSignal.timeout` (GET 20 s, writes 30 s, uploads 120 s) merged with the caller's signal; SSE idle timer 60 s without a frame ends the stream; logout epoch (incremented on logout; `coalesced` and actions drop results from an older epoch; a global `AbortController` aborts in-flight requests and EventSources); ETag awareness (`notModified` flag when the ETag equals the last for that URL, bounded map). Tests: hung request times out; logout aborts and a late result is neither applied nor persisted (STA-11); one shared refresh before expiry; no storage read per request; `notModified` works. M, Opus reviewer.

**C-2 Storage split and O(1) logout (Grp C-w2).** Fnd STA-7, NAV-13, STA-6. Files `services/general/StorageService.ts`, `stores/persistence.ts` (route by `keepOnClear`), `tests/helpers.ts`, `persistence.test.ts`. Steps: two Ionic Storage instances: `kv` (token, theme, settings, every `keepOnClear` entry) and `cache` (account data); `clear()` clears `cache` without reading any value; one-time key migration deletes obsolete keys `sales_price_history`, `sales_new`, `watering_records_data`. Tests: logout performs no value reads; keepOnClear entries survive; migration runs once. Dep C-1, A-1. S.

**C-3 Paged helper, DTO types, mappers, epoch dates (Grp C-w1).** Fnd KD-2 client, STA-12, DSAL-3, DPLA-13, IMG-3. Files create `stores/paged.ts`, `tests/pagedStore.test.ts`; modify `types/*.d.ts`, `mapping/PlantMapping.ts`, `SubstrateMapping.ts`, `ComponentMapping.ts`, `ImageMapping.ts`, `WateringMapping.ts`, `SaleMapping.ts`, `tests/mapping.test.ts`, `tests/helpers.ts` (envelope fixtures). Steps: KD-2 helper; `ImageView` and `toImageView`; epoch-only dates formatted at the view edge through `intlCache`; frozen view models with `searchText`; `wateringStatus(summary, now)` adapter in `utils/wateringStats.ts`; new sale fields. Tests: `loadFirst` then `loadMore` append, stopping at `next_cursor = null`; `setQuery` drops stale results; `loadAll` loops; only the default-query first page persisted; mappers freeze output; `wateringStatus(summary)` equals old records-based result on fixtures. M, Opus implementer and reviewer.

**C-4a Plants on the summary contract (Grp C-w2).** Fnd DPLA-2 (client), 7, STA-3, REN-7, FE-2, FE-12, DPLA-13, NAV-12, FE-6. Files `stores/plants.ts`, `views/plants/PlantOverview.vue`, `PlantDetails.vue`, `components/plants/PlantTag.vue` (if it reads images), `PlantAddingModal.vue`, `PlantEditingModal.vue`; tests `plantsStore.test.ts`, `plantDetailsVisibility.test.ts`, `plantAdding.test.ts`, create `plantOverview.test.ts`. Steps: `mine` uses `loadAll` (with `tz_offset`), `public` uses the paged helper; `applySummaries` is a single copy-on-write commit; details use `fetchOne(id)`; `PlantOverview` builds status in O(1), uses `pageActiveMixin` (`utils/pageActive.ts`, created in C-5), passes `active`, `hasMore`, `serverSearch`, and no longer calls `warmWateringRecords`. Tests: zero `/watering/plant` requests on private entry; public search goes to the server, debounced, resets paging; `applySummaries` updates one plant; an inactive page does not recompute then recomputes once on re-entry. Dep C-3, C-5, A-2a. M, Opus reviewer.

**C-4b Watering on windowed history (Grp C-w3).** Fnd DPLA-3, 5 (client), 6, STA-3, FE-13. Files `stores/watering.ts`, `components/plants/watering/WateringRecords.vue`, `WateringStatus.vue`, `WateringRecordModal.vue`; tests `wateringStore.test.ts`, `wateringStatusComponent.test.ts`. Steps: `ensureRecords` loads 50, `loadOlder` appends; `byPlantId` becomes an LRU of 20 and is no longer persisted; `WateringStatus` reads the summary; writes apply returned records and call `plants.applySummaries`. Tests: one request per write; "show older" pages; status works without records loaded; LRU eviction. Dep C-4a, A-2b. M.

**C-5 ItemsOverview windowing, OverviewCard, search, inactive guard (Grp C-w1).** Fnd REN-1, 2, 3, NAV-1, 6, 9, 12, DSAL-7, 9, 12, DSUB-3, 13, DPLA-10, FE-6, FE-11, SALES-10 (client), IMG-14. Files create `components/overview/OverviewCard.vue`, `components/overview/ItemsGrid.vue`, `utils/pageActive.ts` (Options API mixin with `data.pageActive`; `ionViewWillEnter` sets true, `ionViewDidLeave` false), `tests/itemsOverview.test.ts`; modify `components/overview/ItemsOverview.vue`, `components/SearchBar.vue` (trailing 150 ms debounce, no emit on mount), `tests/viewReactivity.test.ts`, `overviewHeader.test.ts` if affected. Steps: implement the KD-2 view contract keeping empty, error, no-results states and accessibility; isolate scroll-to-top and refreshing state from the grid. Tests: 1,000 items mount 40 cards and the infinite event mounts 80; one changed view model re-renders one card; an outlet re-render does not update the grid (NAV-6, M10); keystrokes within 150 ms trigger one filter; server mode emits `query-change` and does not filter locally; an inactive page does not recompute. Dep A-5. L, Opus implementer and reviewer.

**C-6b Components store, overview, details, picker (Grp C-w2).** Fnd DSUB-4, 5, 6 (component half), 8 (minimum), 15, 16 (only if trivially unused). Files `stores/components.ts`, `views/components/ComponentOverview.vue`, `ComponentDetails.vue`, `components/substrates/ComponentSelection.vue`, `components/components/ComponentAddingModal.vue`, `ComponentEditingModal.vue`; create `components/substrates/ComponentPartRow.vue`, `tests/componentSelection.test.ts`; update `componentsStore.test.ts`. Steps: catalogue uses `loadAll`; `selectableComponents` sorted once with the cached collator; picker: one `ComponentPartRow` per row, stable "Selected (n)" block, selection kept in a Set; `getComponent(id)` fetches by id only; edit and delete call `useSubstratesStore().invalidate()`. Tests: a keystroke re-renders one row; stable order; detail does not fetch the substrates list; edit invalidates substrates. Dep C-3, C-5, A-2a. M.

**C-6a Substrates store, overview, details, one-request form (Grp C-w3).** Fnd DSUB-2 (client), 5, 6, 8, 10 (client). Files `stores/substrates.ts`, `views/substrates/SubstrateOverview.vue`, `SubstrateDetails.vue`, `components/substrates/SubstrateFormModal.vue`, `SubstrateAddingModal.vue`, `SubstrateEditingModal.vue`, `SubstrateContainer.vue`; tests `substratesStore.test.ts`, `formModals.test.ts`. Steps: `mine` uses `loadAll`, `public` the paged helper; detail loads by id without the catalogue; "Used in" calls `GET /substrates?component_id=`; create and edit send `components` in the same request; form reads `selectableComponents` and calls `ensureLoaded` on open; remove the catalogue fetch from `ionViewWillEnter`. Tests: create is one request; edit with a removal is one request; detail does not fetch the catalogue; public search on the server. Dep C-6b. M.

**C-7 Sales client on the server model (Grp C-w3).** Fnd SALES-4, 8, 9, 11, DSAL-2, 4, 5, 6, 10, 13, NAV-7, 10, STA-4, 5. Files `stores/sales.ts`, `views/sales/SalesOverview.vue`, `SalesDetails.vue`, `components/sales/PriceHistoryChart.vue`, `views/TabsPage.vue`, `types/saleTypes.d.ts`, `mapping/SaleMapping.ts`, `utils/salesQuery.ts`; tests `salesStore.test.ts`, `salesQuery.test.ts`, `adminSalesDisplay.test.ts` if affected. Steps: KD-4 client part; keep ticket and EventSource via `ApiUtils.stream`; replace `sales_new` with `sales_seen`; `ensureFresh` only in `ionViewDidEnter`; details read the id Map, fall back to `GET /sales/:id`, load history from the endpoint, pull-to-refresh refreshes only that item; keep the `newCount` getter name so `SideMenu` needs no change. Tests: a 2,000-item replay gives one commit (at most one per 250 ms when cold) and one write; watermark plus seen-ids semantics; a fresh install shows only the last 7 days as NEW; `markAllSeen` is one assignment; boot hydrates only `sales_summary` and `sales_seen`; `ensureFresh` skips when `refreshed_at` unchanged; details never open a stream; logout during replay drops the result. Dep C-1, C-3, C-5, A-3. L, Opus implementer and reviewer.

**C-8 Image component rewrite and baked placeholders (Grp C-w2).** Fnd REN-4, 5, 10, IMG-2..6, IMG-13, DSAL-8, SALES-3 (own-origin), REN-16 (opacity fade). Files `components/ProgressiveImage.vue`, `components/ui/PlantPlaceholder.vue`, `components/ui/placeholder-art/*` (replaced by a `placeholderArt.ts` string builder), `components/ui/DetailHero.vue`, `components/details/DetailsBanner.vue`, `HorizontalGallery.vue`, `components/images/ImageModal.vue`, `components/overview/OverviewCard.vue` (pass `image`, `sizes`, `priority`); create `components/details/GalleryTile.vue`, `tests/progressiveImage.test.ts`; update `imageModal.test.ts`. Steps: KD-5; `sizes` per usage (cards `(min-width: 992px) 25vw, 50vw`; thumbs `64px`; hero `100vw`); sale images use `src` only; first visible row gets `priority`. Tests: exactly one `img` per card and no `window.Image` construction; `srcset`, `sizes`, `width`, `height`, `loading="lazy"`, `decoding="async"` rendered; placeholder stays until `load`; `error` keeps placeholder; one placeholder element per card; reduced motion disables the transition. Dep C-3, C-5. M, Opus reviewer.

**C-9 Client-side downscale (Grp C-w1).** Fnd REN-15, DPLA-11 (client), DSUB-18, IMG-15. Files create `utils/imageResize.ts`, `utils/exifDate.ts`, `tests/imageResize.test.ts`; modify `components/formcomponent/fields/UploadField.vue`, `services/ImageService.ts`, `services/RecognitionService.ts`. Steps: `createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth })` (1600 px uploads, 768 px snaps); `OffscreenCanvas.convertToBlob` (webp 0.8) falling back to `HTMLCanvasElement.toBlob`; read EXIF `DateTimeOriginal` before resizing and send it in the existing `date` field; preview the resized blob; pass through files already below target. Tests: orientation and width arguments; fallback path; EXIF date from a fixture; pass-through of small files. M.

**C-10 Watering round, picker, snap sheet (Grp C-w4).** Fnd REN-8, 9, DPLA-4, 5 (client), STA-3. Files `views/water/WaterRound.vue`, `components/water/RoundList.vue`, `PlantPickerModal.vue`, `SnapMatchSheet.vue`, `utils/waterRound.ts`; create `components/water/RoundRow.vue`; tests `waterRound.test.ts`, `waterRoundView.test.ts`, `roundList.test.ts`, `waterRoundEntry.test.ts`, `waterSnapFlow.test.ts`, `snapMatchSheet.test.ts`. Steps: `baseRows` from summaries sorted once; interaction state (checked ids Set, overrides Map, incremental count); one `RoundRow` per row with the editor opened on demand; picker windowed with 150 ms debounce; submit and undo apply returned records and summaries. Tests: a tap re-renders one row; no history requests on entry or submit; undo works locally; picker windowed. Dep C-4b. M.

**C-11 Navigation and boot (Grp C-w3).** Fnd NAV-5, 8, 11, FE-1, FE-3, FE-14/REN-18 (preload), FE-4 (optional, measured). Files create `utils/overlayRegistry.ts`, `tests/overlayRegistry.test.ts`, `tests/sideMenuNavigation.test.ts`; modify `utils/utils.ts` (`closeAllOpenModals`), `router/index.ts`, `main.ts`, `theme/darkMode.ts`, `frontend/index.html` (inline theme script from a `localStorage` mirror, skeleton, font preload), `components/SideMenu.vue` (tab navigation through the injected Ionic nav manager the tab bar uses; implementer verifies the API in `node_modules/@ionic/vue`, Options API `inject` option), `frontend/vite.config.ts` (stop preloading `vendor-charts`; split `vendor-ionic` only if a visualizer build shows a gain); tests `routerGuard.test.ts`, `darkMode.test.ts`. Steps: registry counts `ionModalDidPresent`/`ionModalDidDismiss`; `closeAllOpenModals` returns immediately at zero; locale and route resolution start before the theme await; theme applied synchronously; side menu uses push with direction `none`. Tests: no `getTop` call when registry empty; menu navigation does not grow history and keeps pages mounted; theme mirror written and read; boot does not block on the theme. Dep C-1, C-2. M.

**C-12 Care guide on request with abort (Grp C-w2).** Fnd DPLA-9 (client), FE-7 (auto-start). Files `components/plants/MoreInfo.vue`, `stores/moreInfo.ts`; tests `moreInfoComponent.test.ts`, `moreInfoStore.test.ts`. Steps: guide starts on tap or shows the cached guide; stream aborted on unmount or leave. Tests: no stream on entry; leaving aborts; cached guide renders without a request. Dep A-2b, C-1. S.

**C-13 Searchable substrate picker (Grp C-w4).** Fnd DSUB-12. Files create `components/formcomponent/fields/SubstratePickerField.vue`, `tests/substratePickerField.test.ts`; modify `components/formcomponent/FormComponent.vue` (field type `substrate-picker`), `components/plants/PlantAddingModal.vue`, `PlantEditingModal.vue`. Steps: `PlantPickerModal` pattern; full `mine` list plus paged public search; sorted by name. Dep C-6a, C-4a. M.

**C-14 Harness update (Grp C-w1).** Files `scripts/perf/navbench.mjs` (add scenarios `public-scroll`, `sales-replay`, `round-tap`, `heap-20-switches`), `scripts/perf/apitime.mjs` (scoped defaults), `scripts/perf/explain-expectations.json` (KD-2 and sales queries), `scripts/perf/README.md`. Dep B-14. S.

**C-G Phase C gate.** Run 2.7 gates; full harness on the amplified dataset with `inject-sales --mode db --n 2000`; browser smoke (subset of 5.3). Pass: tab entry under 50 ms at 4x for every tab; first mount under 100 ms; bounded DOM; heap delta under 10 percent; zero history requests on Plants entry; one image request per card.

### Phase D: infrastructure and lifecycle

Groups: D-w1 {D-1, D-3, D-4, D-6, D-7, D-8} with D-2 after D-1; D-w2 {D-5} after D-4; then D-G.

**D-1 nginx, Dockerfiles, compose, CI smoke.** Fnd REN-12, FE-9, BE-9, IMG-8, DBE-11, DBE-17, BE-12, DBE-13. Files `frontend/nginx.conf`, `frontend/Dockerfile`, `backend/Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`; create `frontend/scripts/precompress.mjs` (zlib, no new dependency so `vite.config.ts` stays with D-3). Steps: nginx per KD-8; read-only uploads volume mounted into the frontend container; SSE locations unbuffered; compose memory limits, `UV_THREADPOOL_SIZE=8`, `NODE_OPTIONS=--max-old-space-size=384`, log options; CI docker job gains `nginx -t` and `curl -sI` assertions for `/uploads/<seeded>` (`immutable`), a hashed asset (`content-encoding`), `/api/v*/plants` (`etag`). Tests: CI only. M. Risk: volume permissions.

**D-2 serve.js.** Fnd REN-19, FE-8. Files `frontend/serve.js` (and `frontend/scripts/deploy.mjs` only if needed). Steps: serve precompressed siblings, `createReadStream`, `ETag`/`Last-Modified`, `immutable` only for hashed assets, `no-cache` for `index.html`, `sw.js`, manifest. Dep D-1. S. Default: harden rather than retire (Q5).

**D-3 Service worker and fonts.** Fnd REN-13, IMG-10, REN-18, FE-19. Files `frontend/vite.config.ts` (variant CacheFirst, `maxEntries` 300, `purgeOnQuotaError`, `globIgnores` for unused font subsets), `src/pwa.ts` if needed; create `tests/pwaConfig.test.ts`. S.

**D-4 Logging and maintenance.** Fnd DBE-13, BE-10, BE-11, DSAL-14, DSAL-5, DB-4. Files create `core/maintenance/MaintenanceScheduler.ts`, `tests/unit/core/maintenance.test.ts`; modify `core/logging/logger.ts` (`maxsize` 10 MB, `maxFiles` 5, or stdout via `LOG_TO_STDOUT`), `core/middleware/errorHandler.ts` (401 at debug, other 4xx at info), `backend/server.ts` (start after listen, stop on shutdown), `package.json` (`db:vacuum`). Jobs (unref'd): ticket sweep every 5 min; expired sessions hourly; `pruneRetention` daily; orphan upload files (unreferenced and older than 1 day, keeping variants) daily; `PRAGMA optimize` every 6 h; `wal_checkpoint(PASSIVE)` every 10 min. Tests: each job fires under fake timers; orphan sweep keeps referenced files; `stop` clears everything. M.

**D-5 Startup after listen, idle Chromium, loop monitor.** Fnd DBE-14, DBE-2, DBE-17, BE-12. Files `backend/server.ts`, `src/app.ts`, `modules/sales/infrastructure/HttpFetcher.ts`, `modules/recognition/index.ts`; create `tests/unit/core/health.test.ts`. Steps: lazy `import('playwright')`; close Chromium after 10 min idle; recognition loads after listen with `/health/ready` false until loaded; `monitorEventLoopDelay` p50/p99/max on `/health`. Tests: health fields; readiness flips; idle close (fake timers). Dep D-4. M.

**D-6 Prepared statement cache.** Fnd DBE-9. Files create `core/database/cachedSqliteDialect.ts`, `tests/unit/core/statementCache.test.ts`; modify `core/database/db.ts`. Steps: bounded LRU of 200 statements keyed by SQL text. Tests: same SQL prepares once; eviction; reads and writes stay correct. M, Opus reviewer.

**D-7 Care guide single-flight.** Fnd DPLA-9 (server), BE-6 (partial). Files `modules/moreInfo/application/StreamPlantInfo.ts`, `infrastructure/PlantLinkSearchers.ts`, `presentation/moreInfoRoutes.ts`, `tests/unit/modules/moreInfo.test.ts`. Steps: single-flight via promise map; LRU of 200 completed guides; concurrent requests share one upstream call. S.

**D-8 Rendering polish.** Fnd REN-16, 17, FE-18, FE-17 (only if confirmed unused). Files `theme/custom.css` (opacity skeleton, reduced-motion guards), `utils/motion.ts` (listen for media query changes), `utils/themeColors.ts` (cache per theme), `components/calendar/Calendar.vue`; tests `motion.test.ts`, `motionCss.test.ts`, `themeCss.test.ts`. S.

**D-G Phase D gate.** Run 2.7 gates; confirm `serve-dist.mjs` still works; `git push -u origin perf/scaling` (no PR yet); `gh run watch` for the CI docker smoke. Pass: gates green and CI green.

### Phase Z: documentation, verification, PR

**Z-1 Docs.** `CLAUDE.md` (harness line, seed table if needed); `frontend/docs/design-system.md` (image component contract and `sizes`/priority; windowed lists and server search for public scopes; no-direct-store-writes rule); `docs/README.md` (API changes); `docs/performance-audit-deep.md` (append a status section mapping waves to commits); `scripts/perf/README.md`. S.
**Z-2 Clean-install gates.** `pnpm install --frozen-lockfile` in both packages, then all gates.
**Z-3 Harness and browser verification.** Run all of 5.2 and 5.3 vs `scripts/perf/baselines/main-f11430d.json`; commit `scripts/perf/baselines/perf-scaling.json`; write `harness-final.md`.
**Z-4 Whole-branch review and fix wave.** Opus reviewer over `main..perf/scaling`: one envelope and one cursor helper; no dead code (`FetchSalesOverview`, `ensureRecordsFor`, `visibleSales`, `readAsWebp`); triage deferred minors; one parallel fix wave; rerun Z-2.
**Z-5 PR.** `gh pr create --base main --head perf/scaling` with the 5.4 text. No AI mentions, no attribution lines.

---

## 5. Prompt blocks

### 5.1 Cross-cutting rules (paste into every implementer brief)
```
You are implementing task <ID> of docs/superpowers/plans/2026-10-12-perf-scaling.md on branch perf/scaling.
Repo: C:\Users\owner\Documents\github\plantcare-tracker (backend: Fastify 5, Kysely, better-sqlite3; frontend: Ionic Vue, Options API, Pinia, Vite). Use pnpm.

Scope
- Implement exactly the task block and the key design sections quoted below. No extra features, no drive-by refactors.
- Allowed files (create/modify): <list>. Read-only references: <list>. Anything else needs a written justification in your report.

Rules
- Do NOT run the test suite or any gate (no vitest, test:coverage, lint, typecheck, vue-tsc, check-keys, build). Tests run once per phase. You may run `pnpm exec prettier --write <files you touched>` inside the owning package, and `pnpm install` only if this task adds a dependency.
- Write the tests listed in the task. Each regression test must fail on the old behaviour; say in the report why it would.
- Frontend: Options API only (no <script setup>); state changes only inside store actions; styling with tokens only; icons only from src/theme/icons.ts; every new user-visible string has keys in both src/locales/en.ts and de.ts (Phase C: use the C-0 keys; report a missing key instead of editing locale files unless this task owns them).
- Backend: invalid input raises ValidationError (400); ownership checks in SQL; list queries bounded by LIMIT; partial indexes (WHERE is_public = 1) need the literal (sql`p.is_public = 1`), never a bound parameter; migrations are forward-only `up` functions registered in migrations/index.ts and listed in tests/integration/migrations.test.ts.
- Seed and mocks: if the change alters what a dev-up user sees, extend scripts/dev/seed (steps/NN-name.mjs listed in scripts/dev/seed/index.mjs) and backend/src/tools/devMocks.ts when they are in your allowlist; otherwise report it.
- Scripts are Node .mjs and cross-platform (Windows and Linux): path.join, process.execPath, no shell syntax.
- Writing: English only. No em dashes anywhere (code, comments, docs, commit messages). Default to no comments; only non-obvious constraints get a short one.
- Never run the app with pnpm dev. If you must look at it: node scripts/dev-up.mjs --id <task-id> and node scripts/dev-down.mjs --id <task-id>, following the browser-hygiene skill (Edge first, new window, clean up). Most tasks do not need the app.
- Git: commit only allowlisted paths: git add -- <paths>; git commit -m "<type>: <lowercase imperative summary>" -- <paths>. Types: feat, fix, refactor, chore, docs, test. No scope. Never mention Claude, Anthropic or AI. No attribution trailers. No amend, no force push. On index.lock errors wait and retry (max 3).

Report (write .superpowers/sdd/2026-10-12-perf-scaling/task-<ID>-report.md and return a summary)
- Commits (sha, message), files changed, how each step was done, tests written and which old behaviour each catches, deviations and why, open questions, locale keys or seed changes others need, follow-ups.
```

### 5.2 Reviewer prompt template
```
You are an independent reviewer for task <ID> of docs/superpowers/plans/2026-10-12-perf-scaling.md.
You did not write this code. Do not run tests, linters or builds. Read the diff and the files.

Inputs
- Task block and key design sections: <pasted>
- Allowed files: <list>
- Diff: .superpowers/sdd/2026-10-12-perf-scaling/review-<base>..<head>.diff (also git diff <base>..<head>)
- Implementer report: task-<ID>-report.md

Check every rubric item (section 2.6) and state pass or the finding.

Output
Verdict: Approved | Approved with minors | Needs fixes
Findings: [Critical|Important|Minor] file:line - problem - concrete fix
Carry-overs for later tasks, if any.
```

---

## 6. Verification

### 6.1 Per-phase checks
Every phase runs the 2.7 gates plus: P0 `node --check` on every harness script and P0-6; A `sales-entry` N=300 and 2,000, `mark-all-seen`, `plants-cold`, `explain`; B `apitime` at the amplified dataset and 100k public plants, `explain`, mock-delay replay check; C full navbench suite, image requests per card, heap; D CI docker smoke; Z everything, 5 runs each, medians.

### 6.2 Harness targets
Setup: production build served by `serve-dist.mjs`; amplified dataset (197 plants, about 21.7k records, 467 images, 97 substrates, 49 components); Sales injected `--mode idb` in Phase A and `--mode db` from Phase C on.

| Scenario | Baseline | Target |
|---|---|---|
| `sales-entry` N=300, warm re-entry | 740 to 770 ms blocked (longest 674 to 690 ms) | under 50 ms, no long task |
| `sales-entry` N=2,000, warm re-entry | 24.9 to 37.2 s | under 50 ms |
| Enter Substrates with N=2,000 Sales mounted | 33.2 s | under 50 ms |
| `mark-all-seen` N=1,000 | 41 s (dev build) | one commit, no long task over 200 ms |
| `sales-replay` N=2,000 | n/a | no long task over 100 ms |
| `plants-cold` 197 x 120 | 2.1 to 3.7 s long tasks, 36 s main thread | under 100 ms first mount, at most 2 API requests, no history requests |
| `public-scroll` at 100k | n/a | first page under 100 ms; each next page under 50 ms |
| `heap-20-switches` | not measured | under 10 percent growth |
| DOM nodes all tabs N=2,000 | 36k | under 12k |
| Image requests per card | 2 | 1 |
| `/plants?scope=mine` (197) | 6.8 ms, 110 KB | under 5 ms, under 40 KB gzip |
| `/plants?scope=public&limit=30` at 100k | n/a | single-digit ms, under 20 KB gzip |
| `/substrates?scope=public` S=1,000 C=30 I=10 | 452 ms | under 10 ms |
| `explain` | scans and temp B-trees | all PASS |

### 6.3 Browser verification via dev-up
Follow browser-hygiene (Edge first, new window, clean up). `node scripts/dev-up.mjs --id perfverify --user grower`; DevTools mobile profile, 4x CPU, Fast 4G.
1. Plants private tab: only the list request fires, no `/watering/plant/*`; statuses match the CLAUDE.md seed table (ok, today, due, overdue, never).
2. Plants public tab: scrolling loads more pages; search hits the server once per pause; `Private Treasure` absent.
3. Sales: about a quarter of items NEW and badge equals that count; every third item has a chart; back navigation has no long task; pull-to-refresh replays without any shop fetch in the backend log.
4. Substrates: untick a component, save, reopen: it is gone (DSUB-9); create with components is one request.
5. Components (admin): picker keystrokes re-render one row; a component edit refreshes substrates on next entry.
6. Watering round (`/tabs/plants/water`): seeded plants pre-ticked; a tap re-renders one row; submit is one batch request with no history loads; undo works.
7. Snap to log: upload `scripts/dev/.snapshots/Monty.png`; request body under 300 KB.
8. Images: one sized variant request per card; placeholder colour before load; Layout Shift 0.
9. Logout during a Sales replay, then log in as `newbie`: no data from the previous account (STA-11).
10. Backend restart: stop the backend PID from `dev-session.json`, restart `devServer` with the same env, refresh: still signed in (B-19 is the automated proof).
Count long tasks with `navbench`, not by eye; screenshots only on failures; `node scripts/dev-down.mjs --id perfverify`, close the window.

### 6.4 Final PR checklist
Gates and CI green on a clean install including the docker smoke; before/after harness table from 6.2 with deviations explained; breaking API changes listed (response envelope, scopes and cursor paging, summary DTOs with cover image, removed `?size` route, new Sales DTO fields and endpoints, watering history paging, write responses returning what changed); migrations 0006 to 0009 with expected runtimes, one-time effects (everyone re-logs in once, legacy password hashes upgraded at next login, image backfill runs in the background after deploy); docs updated (seed, CLAUDE.md, design-system); follow-ups (deferred minors and low findings); diff hygiene (no em dashes, conforming commits, no AI mentions).

### 6.5 Not verifiable locally
| Item | How to verify |
|---|---|
| nginx alias, `immutable`, `gzip_static`, per-location buffering | CI docker job (`nginx -t` plus `curl -sI` assertions from D-1) |
| http2 and brotli at the TLS edge | owner on the deployment: `curl -sI --http2 -H 'Accept-Encoding: br'` |
| Real scrapers and refresher cadence | owner on staging: watch `scrape_source_health` and `sales_source_state` for 24 h; logs show no request-path scraping |
| Container memory and `UV_THREADPOOL_SIZE` | CI smoke plus RSS observation during a refresher cycle |
| Real phone performance | `navbench` against USB-debugged Android Chrome over CDP, or field INP |
| Safari `OffscreenCanvas` fallback | unit-tested, plus one upload on iOS by the owner |
| Backfill duration on production data | `pnpm run images:backfill -- --dry-run` on the server first |

---

## 7. Risks, open questions, dependency graph

### 7.1 Risks
R1 persistence regressions (A-1): mitigated by conventions test, store tests, `$patch` wrapper, `pagehide` flush. R2 UI broken between B-G and C-G: accepted (single PR). R3 partial indexes need literals: EXPLAIN tests. R4 DST shifts watering day boundaries near midnight: accepted, documented. R5 refresher timers in tests: `onListen` registration plus `autoRefresh: false`. R6 parallel implementers on one worktree: allowlists, path-scoped commits, serialized lockfile and migrations. R7 session cutover logs everyone out once; each legacy bcrypt hash costs 52 ms once when upgraded. R8 account deletion now removes public substrates (Q2). R9 stale replay ships the whole active list: bounded by retention, skipped when `refreshed_at` unchanged. R10 coverage dips from deleted modules: fix with tests, never lower thresholds.

### 7.2 Open questions (work proceeds on defaults; tell me to change them)
Q1 Sales: also add a JSON paged `GET /sales/page`? Default no. Q2 On account deletion delete or transfer public substrates? Default delete. Q3 AVIF variants? Default webp only. Q4 `NEW_WINDOW_DAYS` on first install? Default 7. Q5 `serve.js`: harden or retire (with `frontend/scripts/deploy.mjs`)? Default harden. Q6 Side-menu tab semantics remove desktop history entries (NAV-8)? Default accept.

### 7.3 Deferred findings (listed in the PR as follow-ups)
Not built: DBE-15 (single JWT verification per request, also BE-14), DPLA-15, STA-15, a DBE-2 read worker (only if the loop monitor shows stalls), IMG-11 sale image proxy (first audit Wave 3). Partly covered: DBE-16 beyond `maxAge`; DSUB-16 removed only if trivially unused. Not a gap: BE-16 refuted by the audit; REN-20 resolved by deleting the route.

### 7.4 Dependency graph
```
P0-1 -> P0-2 -> {P0-3, P0-4, P0-5} -> P0-6
P0-1 -> A-w1 {A-1, A-4, A-6, A-7}
A-1 -> A-2a, A-2b ; {A-1, A-4} -> A-3 ; A-5 independent
A-2a -> A-8
{A-2a, A-2b, A-3, A-5, A-6, A-7, A-8} + P0-6 -> A-G
A-G -> B-w1 {B-1, B-2}            (A-6 -> B-2 for migration order)
{B-1, B-2} -> B-w2 {B-3, B-5, B-7 (+A-8), B-8, B-9, B-12, B-13}
B-3 -> B-4 ; B-5 -> B-6 ; B-9 -> B-10 -> B-11 -> B-14
{B-3 .. B-14} -> B-15 -> B-w7 {B-16, B-17, B-18, B-19} -> B-G
B-G -> C-w1 {C-0, C-1, C-3, C-5 (+A-5), C-9, C-14 (+B-14)}
C-1 -> C-2 ; {C-3, C-5, A-2a} -> C-4a ; {C-3, C-5, A-2a} -> C-6b ; {C-3, C-5} -> C-8 ; {A-2b, C-1} -> C-12
{C-4a, A-2b} -> C-4b ; C-6b -> C-6a ; {C-1, C-3, C-5, A-3} -> C-7 ; {C-1, C-2} -> C-11
C-4b -> C-10 ; {C-6a, C-4a} -> C-13
all C -> C-G -> D-w1 {D-1, D-3, D-4, D-6, D-7, D-8} ; D-1 -> D-2 ; D-4 -> D-5 -> D-G
D-G -> Z-1 -> Z-2 -> Z-3 -> Z-4 -> Z-5
```
Critical path: P0-1, P0-2, P0-5, P0-6; A-1, A-3, A-G; B-2, B-9, B-10, B-11, B-14, B-15, B-18, B-G; C-3 (with C-5 in parallel), C-7, C-G; D-4, D-5, D-G; Z-1..Z-5. Shorten it by starting A-w1 right after P0-1 (only the A-G comparison waits for P0-6), keeping B-w2 seven-wide, and giving C-3 and C-5 Opus implementers in parallel (C-4a, C-6b, C-7, C-8 all wait on them).
Safe parallel groups (disjoint files): P0-3/4/5; A-1/A-4/A-6/A-7 then A-2a/A-2b/A-3/A-5; B-1/B-2 then B-3/B-5/B-7/B-8/B-9/B-12/B-13 then B-4/B-6/B-10 then B-16..B-19; C-0/C-1/C-3/C-5/C-9/C-14 then C-2/C-4a/C-6b/C-8/C-12 then C-4b/C-6a/C-7/C-11 then C-10/C-13; D-1/D-3/D-4/D-6/D-7/D-8.
Must serialize: migrations (A-6 then B-2); lockfile changes (B-1, D-1); B-15 before B-16..B-19; C-3 owns `helpers.ts` and `mapping.test.ts`; C-0 owns locale files; `vite.config.ts` and `index.html` (C-11 then D-3); `server.ts` and `app.ts` (D-4 then D-5); `harness.ts` (B-11 only).

---

## 8. Critical files
`frontend/src/stores/persistence.ts`, `frontend/src/components/overview/ItemsOverview.vue`, `frontend/src/stores/sales.ts`, `backend/src/modules/plants/infrastructure/SQLitePlantRepository.ts`, `backend/src/modules/sales/presentation/salesRoutes.ts`.

