# PlantCare Tracker performance audit, deep dive (scaling edition)

Audit only. No application code was changed. Date: 2026-10-12. Baseline: `main` at `f11430d`.
This report supersedes the conclusions of `docs/performance-audit.md` where they differ (corrections are listed in section 6). It does not replace it: the first audit's findings that are not contradicted here still stand.

**Why a second audit.** The first pass measured cold paths on 17 plants and 36 sales. The user's observation ("navigating into Sales is a bit slow every time, and the other tabs will be too once they hold enough content") is a *scaling* question. So this pass (a) built a large dataset and measured tab entry cost as a function of N, and (b) had seven independent audits trace every user input, end to end (DOM event, component, computed and watcher cascade, store action, persistence write, HTTP/SSE, route, middleware, use case, repository, SQL, response, store merge, re-render), each with a scaling table at N = 10 / 100 / 1,000 / 10,000.

Evidence labels: **Measured** = I measured it in the browser/API in this session (section 2). **Benchmarked** = an audit agent ran a micro-benchmark of the real library versions (desktop Node, expect 3x to 6x slower on a phone). **Confirmed** = traced in code with file:line. **Suspected** = pattern-based, magnitude not measured. The seven detailed audits are attached as appendices; every finding ID below (NAV, DSAL, DPLA, DSUB, STA, DBE, REN) has its full entry (evidence, root cause, fix, layers, impact, effort, dependencies) there.

---

## 1. Executive summary

### The answer to "Sales is slow every time"

It is not the network and not the scrapers. It is **client work that is proportional to the list size and is paid on every tab entry**, and it gets worse than linearly:

| Sales items mounted | One tab entry (re-entry, warm) at 4x CPU | Notes |
|---|---|---|
| 300 | one long task of about 0.7 s (290 ms for Components in the same session) | consistent on 3 of 3 re-entries |
| 2,000 | 25 to 37 s of long tasks, not settled after 20 s | 36k DOM nodes |

Why every entry pays: Ionic keeps all tab pages mounted and hides them with `display:none !important`. Showing a page makes the browser restyle and lay out every card again (NAV-1, REN-2), and the list has no windowing at any layer (REN-1, DSAL-7). Each card is about 45 to 65 DOM nodes, 3 to 5 component instances and two `new Image()` loaders (DSAL-7, DSAL-8, REN-4). In my CPU profile of a clean entry at N=2,000, Layout plus style recalculation plus pre-paint were about 3.8 s of an 8 s window, and a further 2 s were a Vue deep-watcher traversal and 1.8 s a *hidden* Plants page recomputing (REN-7, NAV-4).

It is the same for every tab, just with a smaller N today. The side effect I measured: with a big Sales list mounted, entering **Substrates** took 0.8 s (N=300) and 33 s (N=2,000). One large list taxes the whole app.

### The single biggest root cause (affects every store, every user action)

**`stores/persistence.ts:128-138` subscribes to each persisted store with Pinia `$subscribe({ flush: "sync" })`. Pinia makes that a deep watcher, so Vue re-walks the entire store state on every single mutation, before the 250 ms debounce and before the `suppressed` guard** (NAV-4, DSAL-1, STA-1, DPLA-1; four audits found it independently, each with its own benchmark). Costs per *one* mutation: sales store 23 ms at N=1,000 and 452 ms at N=10,000; plants 32 ms and 443 ms; watering 56 ms at 5,000 records and 590 ms at 50,000, versus 0.003 ms without the watcher. Any per-item loop becomes quadratic: a Sales stream with a price point per sale took 3.4 s at 500 sales and 9.5 s at 1,000; "Mark all seen" with 1,000 new items took 41 s in a dev build; the watering warm-up took 35.8 s at 197 plants x 120 records. I measured the same trap in the browser: 24 s of a 36.6 s profile window in the watering store, 20.7 s of it in Vue `traverse`.

The first audit blamed `JSON.stringify` of the whole list (FE-10, SALES-8). That is the cheaper half. The expensive half is the observation itself.

### Top issues by user impact (after this pass)

1. **Persistence deep watcher** (NAV-4 / DSAL-1 / STA-1 / DPLA-1, Critical). Fix: persist at action completion (`$onAction` plus explicit dirty marking, or a `markRaw` snapshot written by the action that changed it), never by observing the data tree.
2. **Every list mounts all N cards and no layer has a paging contract** (REN-1, NAV-1, REN-2, DSAL-7, DSUB-3, DPLA-10, High). The 50 ms line is already crossed near N=170 for first mount and N=400 for Sales events (REN estimate), so the first audit's "virtualize past 500" is too late. Fix end to end: keyset-paginated list endpoints with server-side search and sort, a paged store helper, an `OverviewCard` child component with frozen view models, infinite scroll, plus `content-visibility:auto` as a cheap complement. Do not start with client-only virtualization.
3. **Plant list N+1 and quadratic watering warm-up** (DPLA-2 Critical, BE-1/FE-2/DBE-6, STA-3, REN-7). Fix: return `last_watered_at`, `last_fertilized_at`, interval on `GET /plants`; load full history only for the open plant, windowed by month. Removes 197 requests (about 5 MB) at 197 plants.
4. **Sales data model** (SALES-1/BE-4 from the first audit stand; DSAL-2/4/5/6): scrape in request, whole dataset on every load, `scraped_at` = request time (so every refresh rewrites IndexedDB), `isNew` stored inside every item (one flag flip dirties the whole list), price history never pruned and persisted in full. Fix: server-side persisted sales plus price points, delta/paged reads, `seenIds` set separate from items.
5. **Unbounded server list reads on a single event loop** (DBE-1, DBE-2, DBE-3, DSUB-1, DSUB-2): `GET /plants` and `GET /substrates` return every public row of every user, built and serialized synchronously (28 ms at 20k plants, 2.9 s and 99 MB at 1M); the substrate list is a cartesian join measured 452 ms per query at S=1,000, C=30, I=10; missing indexes on `plants.user_id`, `plants.substrate_id`, `substrates.user_id`, `substrate_components.component_id`, and `ANALYZE` never runs (`PRAGMA optimize` alone took one query from 0.92 to 0.04 ms at 20k).
6. **Per-item Intl and Luxon construction in every hot path** (REN-6, DSAL-3, NAV-3, DPLA-8, DSUB-11, STA-12): 2 to 3 `Intl.NumberFormat` per sale per recompute (about 100 ms at N=1,000, 27x to 40x faster cached). Trivial module-level caches.
7. **Image path** (first audit IMG-1 to IMG-4 stand and are reconfirmed by REN-4, DSAL-8): double full-size download, eager loaders, no placeholder or dimensions. Two corrections in section 6.
8. **Correctness bugs found on the way** (not performance, but they surfaced in the same traces): unticking a component in the substrate edit modal is never sent to the server (DSUB-9); deleting a user who owns substrates fails with `SQLITE_CONSTRAINT_FOREIGNKEY` (DB-3, DBE-12, confirmed by execution) and leaves image files behind; in-flight requests may repopulate the previous account's data after logout (STA-11, Suspected).
9. **Snap-to-log and care guide** (DPLA-11, DPLA-9, DBE-4): the raw 3 to 10 MB camera file is uploaded and decoded twice; `vectorsForUser` scans every plant image in the system (2.1 s at 1.48M images, 3.7 ms when the query starts from `plants`); the care guide auto-starts on every detail visit and burns the 20-streams-per-15-min AI quota.
10. **Operational hazards**: every server restart logs everyone out (sessions in memory) and bcryptjs blocks the loop for 52 ms per login (DBE-5); possible shared-IP rate-limit across all clients behind the proxy (DBE-5, Suspected); no request timeout or abort (STA-9); no proactive access-token refresh (STA-10); uploads have no pixel cap (REN-14); nginx serves uploads through Node and has no http2 (REN-12).

---

## 2. What I measured (this session)

Setup: production build served by an nginx-emulating Node server (gzip, immutable assets, no-cache shell); Edge, mobile profile 390x844 DPR 3, **4x CPU slowdown, Fast 4G**; seeded dev backend amplified to 197 plants, 21,699 watering records, 467 images, 97 substrates, 49 components; Sales injected into IndexedDB at N=300 and N=2,000 with 12 price points per item. Single runs; repeat before using as acceptance numbers.

#### Tab entry cost versus Sales size

| Scenario | Long tasks | Blocked time | Longest | DOM nodes (all mounted pages) |
|---|---|---|---|---|
| Enter Sales, N=300, warm re-entry (3 runs) | 2 | 740 to 770 ms | 674 to 690 ms | 6.1k to 7.0k |
| Enter Components (49 rows), same session | 2 to 4 | 300 to 610 ms | 207 to 231 ms | |
| Enter Substrates, N=300 sales mounted | 4 | 771 ms | 283 ms | |
| Enter Sales, N=2000, first entry after load | 12 | 12.4 s | 3.1 s | 35.9k |
| Enter Sales, N=2000, warm re-entry | 12 to 18 | 24.9 to 37.2 s | 3.8 to 4.9 s | 36.0k to 36.8k |
| Enter Substrates while N=2000 Sales page is mounted | 24 | 33.2 s | 3.1 s | 36.0k |
| Enter Components while N=2000 Sales page is mounted | 9 | 4.1 s | 0.6 s | 36.0k |

Reading: the cost is paid on **every** entry (re-entry is as slow as the first), it is a single block of about 0.7 s at 4x CPU already at 300 sales (about 170 ms on a desktop CPU, 700 ms on a mid-range phone), and it grows faster than linearly: 6.7x more items gave about 30x more blocked time. Because Ionic keeps tab pages mounted, **a large Sales list also slows entering unrelated tabs** (Substrates: 0.8 s at N=300, 33 s at N=2000).

#### What the main thread does (CPU profile of one clean Sales entry at N=2000, 12 s window)

- 8.0 s of tasks in the window, of which Layout 1.9 s, UpdateLayoutTree 1.2 s, PrePaint 0.7 s, Commit 0.35 s (36k nodes, rendered in full with no windowing and no `content-visibility`).
- 2.0 s inside Vue's deep watcher `traverse` (self 1.2 s) triggered by a store `set`: a Pinia `$subscribe` watcher (deep, `flush: "sync"`) re-walks the whole store state on **every** mutation.
- 1.8 s in `PlantOverview.overviewItems` recomputing from `wateringStats` for a hidden page while Sales is entered: hidden Ionic pages keep reacting to store changes.
- About 4.4 s "program" (native: style, layout, paint outside JS).

#### Watering store: quadratic hydrate (profile of Plants then Sales, N=2000 sales, 197 plants x 120 records)

36.6 s of sampled main-thread time in one window, **24.0 s attributed to the watering store module** (`wateringStats` chunk), of which 20.7 s is Vue deep traverse. Mechanism: `ensureRecordsFor` writes `byPlantId[id]` and `loadedAt[id]` once per plant (197 plants, so about 394 mutations); each mutation synchronously triggers the persistence plugin's deep `$subscribe` watcher, which traverses all records loaded so far (up to 21.7k objects), and after the 250 ms debounce `flush` runs `JSON.stringify` of all records plus `Math.max(0, ...Object.values(state.loadedAt))`. Total work is O(plants x total records) per hydrate. Entering Plants measured 2.1 to 3.7 s of long tasks (longest 0.8 to 1.5 s) at 4x CPU.

#### API at the same scale (loopback, median of 7)

| Endpoint | Time | Payload |
|---|---|---|
| `GET /plants` (197 plants, 467 images) | 6.8 ms | 110,088 B |
| `GET /substrates` (97) | 6.4 ms | 87,430 B |
| `GET /components` (49) | 2.6 ms | 6,773 B |
| `GET /watering/plant/:id` (120 records) | 2.5 ms | 25,230 B |
| Client N+1: 196 history requests, 3 parallel | 304 ms loopback | about 5 MB total |

The backend is not the bottleneck at this scale. The cost is in what the client does with the data.

#### Conclusions that change the first audit

1. The user's "slow every time" is **render and reactivity cost proportional to the Sales list, paid on every tab entry**, not cold-scrape latency. SALES-1 (scrape in request) stays valid for cold loads but is not the per-navigation cause.
2. The first audit's "Pinia and persistence fine" assumption is wrong: the persistence plugin's deep sync subscription is a quadratic trap (state, sales, watering).
3. Ionic's mounted-pages model multiplies every list: all tabs' DOM and watchers coexist.
4. The first audit's FE-6 (hidden pages recompute) is promoted from Medium to High.


---

## 3. Root causes (ordered by how many symptoms each explains)

| # | Root cause | Symptoms it explains | Findings |
|---|---|---|---|
| RC1 | State is persisted by *observing* reactive data with a deep sync watcher instead of by action boundaries | quadratic streams, mark-all-seen freeze, N+1 warm-up freeze, slow back-navigation, slow boot hydrate | NAV-4, DSAL-1, DSAL-4, DSAL-11, STA-1, STA-2, DPLA-1, DPLA-5, DPLA-6, DSUB-7 |
| RC2 | Lists have no paging contract; the DOM, store and API all assume "everything" | per-entry cost proportional to N, memory, payload size, slow lists at scale in every tab | REN-1, NAV-1, REN-2, REN-3, DSAL-6, DSAL-7, DSUB-2, DSUB-3, DPLA-7, DPLA-10, DBE-1 |
| RC3 | Hidden pages stay alive and reactive (Ionic) and are not guarded | Sales entry tax on other tabs, hidden Plants recompute during Sales entry | NAV-1, NAV-6, NAV-12, DSAL-12, REN-7, DPLA-2 |
| RC4 | The API has no read models for what screens need (no summary, no "last watered", no cover image, no delta) | N+1, unbounded history, full-collection downloads, joins on the client | BE-1, DBE-6, DPLA-3, DPLA-7, DSUB-1, DSUB-2, DSUB-6, DSAL-6 |
| RC5 | Derived values are recomputed whole and with fresh objects (Intl, Luxon, `localeCompare` with options, whole-list sorts) on every change | ~100 ms per recompute at N=1,000, per SSE frame, per tap | REN-6, REN-7, REN-8, DSAL-2, DSAL-3, DPLA-4, DPLA-8, DSUB-5, DSUB-11, NAV-3, STA-12 |
| RC6 | Extraction work lives in the request path (scraping, recognition vector load, per-request image resize) and the loop is single-threaded and synchronous | cold Sales, snap-to-log, login stalls, restart waves | SALES-1, SALES-2, DBE-2, DBE-4, DBE-5, DBE-10, DBE-11 |
| RC7 | No data lifecycle (no pruning, no indexes/stats, no scoping by user, no invalidation across related entities) | unbounded growth, stale substrates after component edit, orphan files, FK delete failure | DSAL-5, STA-8, DBE-3, DBE-13, DSUB-8, DBE-12 |
| RC8 | The image pipeline has no variants, dimensions or placeholders | jank, double downloads, pop-in | IMG-1 to IMG-4, REN-4, REN-5, REN-13 to REN-15 |

---

## 4. Ranked findings (consolidated)

Severity is the highest any audit assigned, adjusted for user impact. Effort: S under a day, M a few days, L a week or more. The full entry for every ID is in the appendix named in the last column. First-audit IDs (SALES, IMG, FE, BE, DB) are in `docs/performance-audit.md`.

| Rank | ID(s) | Title | Sev | Status | Effort | Appendix |
|---|---|---|---|---|---|---|
| 1 | NAV-4, DSAL-1, STA-1, DPLA-1 | Deep synchronous persistence watcher re-traverses each whole store on every mutation | Critical | Confirmed, Measured, Benchmarked x4 | M | A, B, F, C |
| 2 | REN-1, NAV-1, REN-2, DSAL-7, DSUB-3, DPLA-10 | All N cards mounted, no paging contract at any layer, whole page re-styled on every tab entry | High (Critical at N>=1,000) | Confirmed, Measured | L | G, A, B, C, D |
| 3 | DPLA-2, STA-3, REN-7, BE-1, DBE-6 | Plant list N+1 plus quadratic watering status recompute | Critical | Confirmed, Measured | M | C, F, G, H |
| 4 | DSAL-4, DSAL-2, DSAL-5, DSAL-6, DSAL-11 | Sales state model: `isNew` inside items, per-frame recompute, price history unbounded, whole dataset per load, whole list rewritten per flush | High | Confirmed, Benchmarked | M | B |
| 5 | DBE-1, DBE-2, DPLA-7, DSUB-2 | Unbounded list reads of all users' public rows, serialized on the event loop | Critical at scale | Confirmed, Measured | M | H, C, D |
| 6 | DBE-3, DSUB-14, DSUB-1, DBE-8 | Missing indexes, no `ANALYZE`, cartesian substrate join | High | Confirmed, Measured | S (indexes) / M (query) | H, D |
| 7 | REN-6, DSAL-3, NAV-3, DPLA-8, DSUB-11, STA-12 | Intl/Luxon/collator objects built per item per recompute | High | Benchmarked (27x to 40x) | S | G, B, A, C, D, F |
| 8 | REN-3, REN-8, DPLA-4, DSAL-12, NAV-6, DSUB-4 | One big render function with deep reactive data; round, picker and component picker repatch everything per tap/keystroke | High | Confirmed | M | G, C, D |
| 9 | DSAL-5, STA-8, DBE-13 | Unbounded growth of price history, `moreInfo`, tickets, sessions, logs, uploads | High/Medium | Confirmed | S/M | B, F, H |
| 10 | REN-4, DSAL-8, IMG-1, IMG-2, IMG-3, IMG-4 | Image stack: two loaders per card, fake low-res step, no placeholder or dimensions | Critical (IMG-1/2) | Confirmed | M/L | G, B |
| 11 | DBE-4, DPLA-11, DPLA-12, REN-21 | Recognition: system-wide vector scan, raw upload, double decode, fire-and-forget embeddings | High | Confirmed, Measured | M | H, C, G |
| 12 | DBE-5 | Restart logs everyone out, bcryptjs blocks loop 52 ms per login, shared-IP limiter | High | Confirmed + Suspected topology | M | H |
| 13 | STA-5, NAV-7, DSAL-10 | Boot hydrates the whole Sales list just for the tab badge; not coalesced | High | Confirmed | S | F, A, B |
| 14 | NAV-2, DSAL-4 | `markSeen` on re-entry invalidates the whole derived chain and rewrites IndexedDB | High | Confirmed | S | A, B |
| 15 | DPLA-5, DPLA-3, STA-9 | Round submit/undo refetches every ticked plant's full history; no request timeout/abort | High | Confirmed | M | C, F |
| 16 | DSUB-9 | Unticking a component never reaches the server (correctness) | High | Confirmed | S | D |
| 17 | DBE-12, DB-3 | Account deletion fails for substrate owners, orphans files | Medium | Confirmed by execution | S | H |
| 18 | DSUB-6, DSUB-8, DPLA-13, NAV-10 | Re-entry and cross-entity staleness: one detail forces the other collection, component edit leaves substrates stale | Medium | Confirmed | M | D, C, A |
| 19 | DPLA-9, DBE-10 | Care guide auto-start, no in-flight dedup; failed scrape pages never cached | Medium | Confirmed | S | C, H |
| 20 | STA-6, STA-7, STA-10, STA-11, NAV-13 | Token in IndexedDB per request, logout deserialises all, no proactive token refresh, possible cross-account repopulation | Medium | Confirmed / Suspected | S/M | F, A |
| 21 | REN-12, REN-13, REN-14, REN-15, REN-19, DBE-17, DBE-11 | Infra: uploads through Node, no h2, SW LRU worst case, no pixel cap, serve.js, unbounded memory | Medium | Confirmed | S/M | G, H |
| 22 | NAV-5, NAV-8, NAV-9, NAV-11, NAV-12, REN-5, REN-9, REN-10 | Smaller navigation and rendering items | Medium/Low | Confirmed | S | A, G |
| 23 | Remaining Low items | DSAL-9/13/14/15, DPLA-14/15, DSUB-12/13/15/16/17/18, STA-13/14/15, DBE-9/14/15/16, REN-11/16 to 18/20, NAV-13 | Low | as labelled | S | all |

---

## 5. Fix plan (ordered waves, with verification against the measured baselines)

Order rule: remove the quadratic trap first (it multiplies everything else and is small), then the data contracts, then the components that consume them. Tests run once per wave, after the wave's changes are complete.

### Wave A: remove the multipliers (small, no contract change)

| Change | Findings |
|---|---|
| Replace the deep `$subscribe` persistence with action-boundary persistence: wrap persisted actions via `$onAction` (or call an explicit `persist(entry)` from the actions that change it), snapshot with `toRaw` and a single serialization (no `JSON.stringify` then `JSON.parse`), dirty flags per entry so a `query` change does not rewrite `items` | NAV-4, DSAL-1, STA-1, STA-2, DSAL-11, DPLA-6, DSUB-7 |
| Commit per snapshot, not per item: build the list in a plain array and assign once; `isNew` leaves the items and becomes a persisted `seenIds` Set; `markAllSeen` becomes one set operation | DSAL-4, STA-4, NAV-2 |
| Module-level cached `Intl.NumberFormat`, `Intl.RelativeTimeFormat`, `Intl.Collator`, Luxon formatters keyed by locale | REN-6, DSAL-3, NAV-3, DPLA-8, DSUB-11, STA-12 |
| Shallow reactivity for big collections (`shallowRef`, `markRaw`, or frozen view models) | STA-13, DSAL-12, REN-3 |
| `content-visibility:auto` with `contain-intrinsic-size` on cards (cheap interim for RC2) | REN-2, NAV-1 |
| Hydrate the Sales list lazily; persist a tiny `{count, newCount}` summary for the tab badge; coalesce `restore()` | STA-5, NAV-7, DSAL-10 |
| Prune `priceHistory` to ids that still exist and to a bounded time window; cap `moreInfo` | DSAL-5, STA-8 |
| One migration: indexes on `plants(user_id, created_at DESC)`, `plants(substrate_id)`, `substrates(user_id)` (plus public partial), `substrate_components(component_id)`; `PRAGMA optimize` on open and on close; `busy_timeout`; `ON DELETE` rule for `substrates.user_id` | DBE-3, DSUB-14, DB-3, DBE-12 |
| Fix the substrate component removal call (client sends removals; endpoint deletes) | DSUB-9 |

Verify (repeat section 2 harness): the N=2,000 Sales stream and "Mark all seen" no longer scale quadratically (target: time for 1,000 items under 0.3 s on desktop CPU, long tasks under 200 ms at 4x); the Plants cold fill drops from about 36 s of main-thread to a few hundred ms (traversal gone); `EXPLAIN QUERY PLAN` shows seeks and no temp B-tree; re-measure tab entry at N=300 and N=2,000.

### Wave B: read models and paging contracts (backend first)

1. **Plant list summary**: `GET /plants` adds `last_watered_at`, `last_fertilized_at`, `watering_interval_days` (correlated `max(date)` subquery, 3.3 ms for 2,000 plants, versus 591 ms for `GROUP BY` per DBE-6; optionally denormalized columns), and a cover image instead of `images[]`. Watering history becomes `GET /watering/plant/:id?from=&to=` (month window). Batch endpoints return the created records so the client stops refetching (DPLA-5). Findings: BE-1, DBE-6, DPLA-3, DPLA-5, DPLA-7.
2. **Paged lists**: keyset cursor (`?cursor=&limit=&q=&sort=`) on plants, substrates, components, sales; split `mine` and `public` scopes; summary DTO for lists, detail by id; ETag/304; response compression. Substrates: replace the cartesian join with an `IN`-list second query, aggregate components in SQL. Findings: DBE-1, DBE-2, DBE-7, DBE-8, DSUB-1, DSUB-2, DSUB-6, DSAL-6.
3. **Sales server model**: persisted `sales_items` and `sales_price_points` written by a scheduled single-flight refresher (stale-while-revalidate), true `scraped_at`, server `isNew` basis, paged read; SSE only for admin recheck. Findings: SALES-1, SALES-2, SALES-5, SALES-6, SALES-9, DSAL-2, DSAL-6, DBE-10.
4. **Recognition**: `vectorsForUser` starts from `plants` (3.7 ms versus 2.1 s at 1.48M images), embeddings queue with retry and no silent drop, client downscale before upload. Findings: DBE-4, DPLA-11, DPLA-12, REN-14, REN-15, REN-21.
5. **Image variants and placeholders** (first audit Wave 1.3).
6. **Sessions and login**: persist sessions (or switch to stateless refresh tokens with a revocation table), move bcrypt off the loop (native `bcrypt` or worker), fix the limiter key behind the proxy (`trustProxy`). Findings: DBE-5, STA-10.

Verify: list endpoints answer in single-digit ms at 100k plants with a bounded payload (target: first page under 20 KB gzip); plants view makes 2 requests instead of 1 + P; loop block per list request under 5 ms at 20k plants; restart no longer logs users out; `GET /sales` independent of shop latency.

### Wave C: client consumption

1. Paged store helper (cursor append, `shallowRef` list, server-side search and sort, debounce at the input) and **`OverviewCard` child component** with frozen view models and stable keys; infinite scroll in `ItemsOverview`; remove the hidden-page recompute (guard computeds/watchers when the page is inactive via `ionViewWillLeave`/`isActive`). Findings: REN-1, REN-3, REN-7, NAV-1, NAV-6, NAV-9, DSUB-3, DSAL-7, DSAL-9, DSAL-12, DPLA-10.
2. **Watering round and pickers**: split base rows from per-tap overlay, row component, windowed list. Findings: REN-8, REN-9, DPLA-4, DSUB-4, DSUB-5.
3. **`ProgressiveImage` rewrite** against the variant contract (first audit Wave 2.1; REN-4 adds baked CSS placeholder instead of 22 to 66 SVG elements per card, REN-5).
4. **Navigation and boot**: parallelise the boot chain, skip the modal-controller query when no overlay exists (registry), replace side-menu `router.push` with the tab navigation semantics, request timeouts with `AbortController`, in-memory token, proactive refresh, logout flow that cancels in-flight work and clears by store instead of deserialising everything. Findings: NAV-5, NAV-8, NAV-11, STA-6, STA-7, STA-9, STA-10, STA-11.
5. **Cross-entity invalidation**: component edit/delete invalidates substrates; substrate detail and component detail fetch by id. Findings: DSUB-6, DSUB-8, DSUB-10.

Verify: tab entry cost flat (target under 50 ms at 4x CPU independent of total N); first mount under 100 ms at 4x with a 20 to 30 item first page; DOM node count per list bounded; heap bounded across 20 tab switches.

### Wave D: infrastructure and lifecycle

nginx serves `/uploads` from a shared read-only volume (immutable headers, http2, brotli, `proxy_buffering off` only on SSE routes); SW image cache sized for list scroll or replaced by HTTP caching; server pixel cap and an upload semaphore; memory limits and `UV_THREADPOOL_SIZE`; log rotation and 4xx level; scheduled cleanup for tickets, sessions, orphan images, `VACUUM`/`ANALYZE`; startup work after `listen`. Findings: REN-12, REN-13, REN-14, REN-19, DBE-9 (prepared statement reuse), DBE-11, DBE-13, DBE-14, DBE-17.

---

## 6. Corrections to the first audit

| First-audit item | Status now |
|---|---|
| FE-10, SALES-8 (whole-collection persistence) | **Escalated to Critical and re-diagnosed**: the deep sync watcher, not `JSON.stringify`, is the dominant cost (NAV-4, STA-1, DPLA-1, DSAL-1) |
| FE-6 (hidden pages recompute) | Escalated Medium to High (measured: hidden Plants page recomputing 1.8 s during a Sales entry) |
| FE-11 and IMG-14 ("virtualise past about 500") | Too late: cost crosses 50 ms near N=170 to 400 (REN-1); use paging contract |
| SALES-4 / "client stream coalescing fine" (section 7) | **Refuted**: UI work is not batched across frames (DSAL-2) |
| IMG-5, IMG-6 | Partly wrong: `ion-img` already sets `decoding="async"` and is viewport-gated (`@ionic/core` img.js:79); the eager cost is network, cache and service-worker churn, not decode (REN-4) |
| IMG-15 | Escalated Low to Medium (no pixel cap, REN-14) |
| BE-7 (bcryptjs) | Corrected: bcryptjs does not yield at cost 10; 52 ms blocked per compare (DBE-5) |
| BE-16 (response schemas / fast-json-stringify as a speed lever) | **Refuted**: 6 ms vs 7 ms on a 5.2 MB plants payload (DBE) |
| BE-11 (session arrays) | Raised Low to High: restart logs everyone out (DBE-5) |
| BE-13 / recognition | Refined: the scan covers all users' images, not the caller's (DBE-4) |
| FE-7 (care guide quadratic render) | Partly refuted: render cost is bounded by max tokens 1,000; auto-start confirmed (DPLA-9) |
| "Plants query fine", "SQLite config fine", "no N+1 in plants" | Partly refuted: user query is `SCAN p` plus temp B-tree, `ANALYZE` never runs, substrate list is a cartesian join (DSUB-1, DBE-3, DBE-8) |
| `scrape_source_health` growth | Refuted as unbounded (one row per source) |
| FE-3 / FE-5 | Confirmed |
| DB-3 (user delete FK) | Confirmed by execution |

New relative to the first audit and not an extension of an earlier ID: NAV-5, NAV-6, NAV-8, NAV-12 (shell and navigation), DSAL-4, DSAL-9, DSAL-12, DSAL-13, DSAL-15, DPLA-4, DPLA-5, DPLA-11, DPLA-12, DSUB-4, DSUB-9, DSUB-10, STA-4, STA-9, STA-10, STA-11, DBE-4, DBE-5, DBE-10, DBE-11, DBE-14, REN-8, REN-13, REN-14.

---

## 7. Checked and found fine (do not re-audit)

Server: ownership checks in SQL; WAL, `synchronous=NORMAL` and foreign keys on; sharp processing runs off the event loop; component-delete cascade is cheap at tested sizes (2.4 ms at 30,000 junction rows); no per-request DB lookup for auth; multi-stage non-root Dockerfile; graceful shutdown; sorting itself is cheap (`localeCompare` sort 0.64 ms at N=1,000, 3.8 ms at N=5,000, so the cost is the *formatters and recompute frequency*, not the sort).
Client: route guards and auth cost per navigation; route watchers; `LocalizationService`; dark mode switch; offline banner; PWA registration; timers; form keystroke paths (`FormComponent`, constant cost per key); profile flows (O(1)); tab-bar taps use `duration:0` so no animation runs; tab re-entry with fresh stores does no network or IndexedDB work (confirmed by NAV, DSAL, DSUB).
Infra: nginx immutable caching for hashed assets and `sw.js` no-cache; uploaded filenames are unique so immutable is safe.

---

## 8. Limits of this audit

- Browser numbers are single runs on a throttled desktop Edge, not a real phone. Repeat five times and take the median before using them as acceptance targets.
- At N=300 I did not take a CPU profile of the 0.7 s entry; its split into layout, style and JS is inferred from the N=2,000 profile and the audits' estimates (REN-2 and NAV-1 are Suspected for magnitude at small N, Confirmed for mechanism).
- Backend scaling numbers are agent benchmarks on synthetic databases (1 to 1M plants, an SSD); expect 2 to 5x worse on a Raspberry Pi or NAS.
- Real scraper latency and the real Docker/nginx/http2/brotli path remain unmeasured (no Docker here); LCP, TBT, INP and a Lighthouse score are still untaken (the available Lighthouse tool excludes performance). Procedures are in each appendix's measurement-hooks section (hooks M1 to M15 per slice) and in section 3.2 of the first audit.
- Three agent claims depend on topology and are Suspected: shared-IP rate limiting behind the proxy (DBE-5), cross-account repopulation after logout (STA-11), CORS preflight cost (DBE-16).

---

# Appendices: the seven detailed audits (unabridged)

Appendix letters: A navigation and shell (NAV), B Sales (DSAL), C Plants (DPLA), D Substrates and Components (DSUB), E measured (this session), F state and persistence (STA), G rendering, media and infra (REN), H backend and database (DBE). Appendices contain each audit's inventory of every input event, its scaling table, its verified-fine list and its measurement hooks.


---

## Appendix A: Navigation and shell (NAV-n)

### Deep audit, slice nav (prefix NAV): boot, shell, navigation, page stack, stores persistence on the nav path

Read-only static audit. Baseline `main` at `f11430d`. Paths are relative to `frontend/src` unless prefixed. Evidence labels: **Confirmed** = traced in code (file:line, including Ionic/Pinia/Vue sources in `node_modules`); **Suspected** = mechanism confirmed, magnitude is an estimate that needs the measurements in section 5.

Glossary used here: N = items in one list (Sales cards, plants, ...), P = price points, K = images, "page stack" = the set of `ion-page` elements Ionic keeps mounted in the tabs outlet.

#### 0. Short answer: why entering Sales is slow every time

Nothing in the router, guard, store or lifecycle path does network or storage work on a plain re-entry (verified below). The cost is in three places, ranked by how often they hit:

1. **Every tab switch toggles `display:none` on a page that contains every card of the list** (NAV-1). Ionic never unmounts tab pages and hides them with `.ion-page-hidden{display:none !important}`. Showing the Sales page makes Blink rebuild style and layout for N cards times about 30 nodes (price block, discount chip, ion-icon, ion-img, SVG placeholder), hiding the previous tab tears down the same for its list. The list renders all N items with no windowing. Cost is O(N_entering + N_leaving) per tab switch, and Sales has by far the largest N and the heaviest card, so it is the first tab where it shows. Suspected magnitude: 0.1 to 0.3 ms per card on desktop (100 to 300 ms at N=1000), about 4x on a phone.
2. **Coming back from a sale detail runs a full O(N log N) JS recompute on the list inside `ionViewWillEnter`** (NAV-2, NAV-3). `SalesOverview.ionViewWillEnter` calls `markSeen`, which flips `isNew`, which invalidates `filteredSales` (copy + sort with `localeCompare(locale,{numeric})`), `mappedSales` (up to 3 `new Intl.NumberFormat` per sale), the `ItemsOverview` watcher, `newInView`, the whole `v-for`, and a deep Pinia traversal plus a whole-list `JSON.stringify` + IndexedDB rewrite 250 ms later (NAV-4).
3. **On the desktop menu path (`SideMenu.navigate` = `router.push`) the transition is a forward push, animated, and the list page is unmounted on any later back/pop** (NAV-8), so the next entry is a full remount of N cards (about 0.25 to 0.4 ms per card) instead of a show.

Everything else on the nav path is O(1) to O(#mounted pages) and not the cause.

#### 1. Input / entry-event inventory and trace

N = items of the list involved. "pages" = number of mounted views (visited tabs plus details).

| # | Entry event | Trace (hop by hop) | Complexity |
|---|---|---|---|
| E1 | Cold boot | `main.ts:55-87`: title, `applyInitialTheme` (IDB open+read), `connectSessionToTransport`, `createApp.use(router)`, `await Promise.all([router.isReady, resolveInitialLocale])`; `isReady` runs `beforeEach` (`router/index.ts:168-196`): `closeAllOpenModals` -> `ensureAuthenticated` (`session.ts` hydrate IDB; no token -> `POST /auth/refresh-token`) -> lazy `TabsPage` + `PlantOverview` chunks; then mount; `App.created` loads layout + snapSettings (IDB); `TabsPage.mounted` -> `restoreSales` = `$hydrate` of 3 IDB entries (`sales_data` whole list, `sales_price_history`, `sales_query`) -> stringify of each for the diff baseline (`persistence.ts:85-91`); `SideMenu.mounted` -> calendar `$hydrate` (5 keys); admin: `adminHealth.load` | O(1) network RTTs serial (FE-3) + O(N_sales + P) JSON/IDB decode + 3x stringify on the critical path of the first tab |
| E2 | Tab bar tap (phone), re-entry | `IonTabButton.onClick` -> `ionRouter.handleNavigate(href,"push","none")` (`vue-router index.js:690`) -> `router.beforeEach`: `Utils.closeAllOpenModals` (`modalController.getTop` = `document.querySelectorAll('ion-modal')` over the whole document, `overlays.js:371-399`), `resolveAccess` (`session.ensureAuthenticated`: `hydrate` returns at once when hydrated; `isAdmin` getter cached) -> `afterEach` title -> outlet watcher (`vue index.js:1355`, deep watch on route) -> `setupViewItem` -> `handlePageTransition` (`:1509-1613`): `fireLifecycle WILL_ENTER` (`ionViewWillEnter` of the target), `transition()` with `duration:0` (root/none direction), leaving gets `ion-page-hidden` (`:1572`), `DID_LEAVE`/`DID_ENTER`; `components.value = getChildrenToRender` -> outlet re-render -> every mounted page gets a fresh `registerIonPage` prop (`:1709`) so every mounted page component re-renders (NAV-6); TabsPage `activeTab` recompute | JS: O(pages) + O(total DOM) for the modal query. Rendering: O(N_entering x nodes) show + O(N_leaving x nodes) hide (NAV-1) |
| E3 | SideMenu item tap (desktop >= 992 px, tab bar hidden) | `SideMenu.navigate` (`SideMenu.vue:~376`): `menuController.close()` then `this.$router.push(to)`; Ionic records `push`/`forward` (`vue-router index.js:397-520`), so the transition is animated (`duration` undefined, `animation()` -> `waitForReady(opts,true)` -> `deepReady` walks until the first Stencil element of each page, then MD/iOS transition), leaving view stays mounted on forward push, history grows by one entry per tap | O(1) JS + animated compositing of a full page; stack unmount semantics differ from E2 (NAV-8) |
| E4 | Re-entry into the list, E2 or E3, nothing changed | `SalesOverview.ionViewWillEnter` (`SalesOverview.vue:168`): `openedId === null` -> return. `PlantOverview.ionViewWillEnter` -> `ensureLoaded` (fresh -> resolved promise). `SubstrateOverview` -> `ensureLoaded` x2. `ComponentOverview` -> `ensureLoaded`. | O(1) |
| E5 | Open a detail from a list | `ItemsOverview.navigateToItem` -> `onItemClick` -> `router.push({name:"sales-details"})` (forward, animated); list stays mounted; `SalesDetails.ionViewWillEnter` -> `reload` -> `sales.load({force:false})` (resolved when fresh; **full SSE restream when older than 24 h**, NAV-11); `byId` = `items.find` | O(N) find; O(1) otherwise |
| E6 | Back from detail (IonBackButton, pop/back) | detail view removed (`mount=false`, `vue index.js:1580-1596`), list `ionViewWillEnter`: `markSeen(openedId)` -> `items.find` O(N) + `isNew=false` -> pinia sync deep watcher traversal O(N+P) -> `newCount`, `filteredSales`, `mappedSales`, `ItemsOverview` watcher/`newInView`/grid re-render -> 250 ms later `flush`: `JSON.stringify(items)` + `JSON.parse` + IDB structured-clone write of the whole list (`persistence.ts:112-126`) | O(N log N) compare + O(3N) Intl + O(N x ~18) vnodes + O(N+P) traversal + O(N) stringify/parse/IDB per back (NAV-2, NAV-3, NAV-4) |
| E7 | Pull to refresh / manual refresh button (Sales) | `ItemsOverview.handleRefresh` -> `fetchSales(true)` -> `load({force})` -> `runStream` (`sales.ts:~118-165`): `POST /auth/ticket`, `EventSource`; per SSE frame: `convertToSales`, `incoming.push`, `addPricePoint` per new sale (each a sync-watched mutation); `visibleSales`/`filteredSales`/`mappedSales`/grid recompute per frame | per frame O(N_seen) recompute + k x O(N+P) traversal; whole stream quadratic (NAV-4; SALES-4 for the render part) |
| E8 | "Mark all as seen" | `markAllSeen` (`sales.ts:186`): `items.forEach(sale => sale.isNew=false)` = one sync-watched mutation per new sale, each re-traverses the whole store state | O(k x (N+P)), k = new count, up to N^2 (NAV-4) |
| E9 | Typing in the search bar | `ion-searchbar :debounce=0` -> `SearchBar.onInput` -> `ItemsOverview.filterItems` (`:294`): `Utils.baseSearchFilter` (`for key in item`, `toLowerCase` on every string field incl. `imageUrl`) -> `sortItems` -> `filteredItems` (deep reactive data) -> grid diff: removed cards unmount 5 component instances each, re-added cards remount | per keystroke O(N x fields) filter + O(M) vnodes + O(removed) unmount / O(added) mount (NAV-9) |
| E10 | Sales sort select / filter modal apply | `setQuery` -> `query` state change (sync watcher traversal, then persist `sales_query` small) -> `filteredSales` re-sort -> `mappedSales` (3N Intl) -> grid | O(N log N) + O(3N Intl) + O(N) vnodes per change (NAV-3) |
| E11 | Segment change Plants public/private | `OverviewHeader` `ionChange` -> `showPublic` -> `plants` computed -> `overviewItems` (map + `wateringStatus` per plant) -> watcher `warmWateringRecords` -> `ItemsOverview` watcher | O(N x records) |
| E12 | Plant list change (any plant mutation, any watering record change) | `PlantOverview.overviewItems` depends on `byPlantId` deep (records of all plants) -> recompute for all N plants even while page hidden (FE-6 confirmed); `plants` watcher -> `ensureRecordsFor` loop O(N) resolved promises | O(N x R) per mutation |
| E13 | Watering record fetch burst (3 workers over N plants) | per plant: `byPlantId[id] = ...` and `loadedAt[id] = ...` (2 sync-watched mutations, each re-traverses all records of all plants), `ensureRecords` -> `$hydrate` race (FE-13) | O(N x total_records) (NAV-4) |
| E14 | Locale switch (side menu select) | `localizationService.setLocale` -> `_locale` ref -> every `t()` call inside a render registers on it: all mounted pages re-render, `mappedSales` + `filteredSales` + `applySalesQuery(locale)` recompute (3N Intl), `updateDocumentTitle` | O(sum over mounted tabs of N), rare |
| E15 | Dark mode toggle | `setDarkMode`: class on `<html>`, `getComputedStyle(...).getPropertyValue` (forces one style recalc), `meta[theme-color]`, IDB set | one style recalc of the visible tree, O(visible) |
| E16 | online/offline event | `watchConnectivity` (registered by `OfflineBanner.mounted`, `utils/network.ts:15-25`) -> `networkState.online` -> banner only; `resize` listener -> `measure` (guarded) | O(1) |
| E17 | App resume / `visibilitychange` / focus | none registered (grep over `src`: no `visibilitychange`, `pageshow`, `appStateChange`) | 0 (also means no refresh-on-resume) |
| E18 | Timers | `setInterval` none in `src`; only `setTimeout` for persistence debounce (250 ms), offline banner (3 s), overlay settle (50 ms), refresh retry | 0 steady state |
| E19 | Service worker | `registerServiceWorker` once after mount (`pwa.ts`, `main.ts:86`), `registerType:autoUpdate`, `immediate:true`; no per-navigation work (hash history, no network navigations) | O(1) |
| E20 | Logout / login | `localLogout`: `resetAllStores` (`$reset` on each store, `rememberAll` stringifies each entry), `storageService.clear()` (reads every key to check `keepOnClear`, `StorageService.ts:~70-85`: O(keys x value size) because it `get`s every value), `clearRuntimeCaches`, route replace + `location.reload` | O(total stored bytes) |
| E21 | Scroll in a list | `ion-content :scroll-events=true` -> `ionScroll` -> `handleScroll` (assigns a boolean; no trigger when unchanged) | O(1) per scroll frame |

#### 2. Scaling table

Constants (stated assumptions, desktop mid-range CPU; multiply JS by about 4 and rendering by 4 to 6 for a mid phone):
- Card = about 25 light-DOM nodes plus shadow DOM of `ion-img`/`ion-icon` (about 30 to 45 nodes, SVG placeholder +18) and 4 to 6 component instances (`ProgressiveImage`, `ion-img`, `PlantPlaceholder` while loading, `ion-icon`).
- Blink style+layout for a shown subtree 3 to 10 us per node (so 0.1 to 0.3 ms per card); hide 0.02 ms per card; Vue mount of a card 0.25 to 0.4 ms including DOM creation; keyed diff of an unchanged card 10 us.
- `new Intl.NumberFormat(locale, opts)` 20 us; `localeCompare(b, locale, {numeric:true})` 3 us; deep traverse 1 us per Sale object plus 0.1 us per price point (30 max).

| Event | N=10 | N=100 | N=1000 | N=10000 | Over 16 / 50 / 200 ms |
|---|---|---|---|---|---|
| E2/E3 show page (NAV-1) | 1 to 3 ms | 10 to 30 ms | 100 to 300 ms | 1 to 3 s | 16 ms at N>=100; 50 ms at N~250; 200 ms at N~700 |
| E2 hide previous page | 0.2 ms | 2 ms | 20 ms | 200 ms | 200 ms at N=10000 |
| first mount of a tab list (E1/E2 first visit) | 3 to 4 ms | 25 to 40 ms | 250 to 400 ms | 2.5 to 4 s | 16 ms at N>=50; 200 ms at N>=600 |
| E6 `mappedSales` Intl (NAV-3) | 0.6 ms | 6 ms | 60 ms | 600 ms | 50 ms at N~850 |
| E6 `filteredSales` sort (all ties, localeCompare) | 0.1 ms | 2 ms | 30 ms | 400 ms | 16 ms at N~600 |
| E6 grid vdom diff (unchanged cards) | 0.1 ms | 1 ms | 10 ms | 100 ms | |
| E6 total JS on back (sum of the three plus traversal) | 1 ms | 10 ms | about 100 ms | about 1.1 s | 50 ms at N~500, 200 ms at N~1500 |
| E6 persistence flush (stringify + parse + IDB clone of items), 250 ms later | 0.1 ms | 1 ms | 10 to 20 ms | 100 to 200 ms | |
| E8 markAllSeen with all new (NAV-4), history 1 point | 0.1 ms | 12 ms | 1.2 s | 2 minutes | 50 ms at N~200; 200 ms at N~420 |
| E7 whole stream deep traversal cost (NAV-4), full history | 0.2 ms | 20 ms | about 2 s | about 200 s | 200 ms at N~300 |
| E13 watering warm (2 mutations per plant, R records each) | negligible | 10 plants x 100 recs: 2 x 10 x 1 ms = 20 ms | 100 plants x 100 recs: about 2 x 100 x 10 ms = 2 s | n/a | quadratic in plants x records |
| E9 keystroke filter (fields=8) | 0.02 ms | 0.2 ms | 2 ms filter + 30 to 100 ms mount/unmount of changed cards | 20 ms + seconds | card churn dominates |
| E14 locale switch (Sales + others mounted) | 1 ms | 10 ms | 100 to 200 ms JS + relayout | 1 to 2 s | |
| E2 modal query `querySelectorAll('ion-modal')` x2 (NAV-5) | <0.1 ms | 0.2 ms | 1 to 3 ms | 10 to 30 ms | 16 ms at about 100k total nodes |
| E1 `restoreSales` hydrate (IDB decode + 3 stringify + patch) | 1 ms | 3 ms | 15 to 40 ms | 150 to 400 ms | |

Plants/Substrates/Components follow the same E2/E6-style rows with their own N and lighter cards (no price block): their show cost is the same formula with about 60 percent of the Sales constant, which is why only Sales hurts today and the others will hurt at the same N.

#### 3. Findings

##### NAV-1 Page show/hide is O(DOM of the whole list) because pages stay mounted and lists are not windowed
- Severity: High. Status: mechanism Confirmed, magnitude Suspected (measure with hook M1). Related: FE-6, FE-11 (confirms and sharpens: FE-11 only listed render cost, not the per-switch cost).
- Evidence: `ion-router-outlet` keeps pages mounted (`vue/dist/index.js:1572-1573` adds `ion-page-hidden` to the leaving page, `:1580-1596` only removes on non-forward pushes); core CSS `.ion-page-hidden{display:none !important}` (`@ionic/core/css/core.css`) and `.ion-page{contain:layout size style}`; `ItemsOverview.vue:95-141` renders every item with `v-for` (no windowing, no `content-visibility`; `grep content-visibility src` returns nothing); each Sales card has 17 light-DOM elements plus `ion-img`, `ion-icon` (price chip) and an 18-node SVG placeholder while images load (`ProgressiveImage.vue:3,60-62`, `PlantPlaceholder.vue`); `tag-card` has `box-shadow` and a transform transition (`ItemsOverview.vue:411-426`).
- Root cause: the list component's DOM size is O(N) regardless of viewport, and the framework's tab model turns every tab switch into a style/layout attach (entering) and detach (leaving) of two full lists. Page-level `display:none` does not make DOM size irrelevant, it moves the cost to every switch.
- Fix (root): make the list DOM O(viewport). Replace the unconditional `v-for` in `ItemsOverview` by a windowed/chunked grid composable (`useWindowedGrid`): measures columns with a `ResizeObserver` on the grid, uses a fixed row height derived from the existing `aspect-ratio: 4/3` media box plus a measured body height, renders only rows in `viewport +- 2 screens` using spacer elements, and keeps scroll position across hide/show. Layers: `components/overview/ItemsOverview.vue` plus a new composable under `composables/` (or `utils/`); no view changes. Pair with a bounded server contract for Sales (paged `GET /sales?cursor&limit`, see SALES-10) so memory is bounded too. `content-visibility:auto` with `contain-intrinsic-size` on `.tag-card` is a cheap adjunct that skips layout/paint of off-screen cards but still pays style for N cards and keeps all DOM in memory, so it is not the root fix.
- Expected impact: show/hide drops from O(N) to O(visible rows) (about 30 to 60 cards): 100 to 300 ms at N=1000 becomes under 20 ms; first mount likewise (also removes the 5 component instances per card from memory: about 5000 instances at N=1000).
- Effort: M. Risk: medium (scroll restoration, grid with variable card height, a11y of off-screen items, tests asserting rendered cards). Dependencies: NAV-9 (filteredItems as computed), image lazy loading (IMG-2) becomes natural once off-screen cards are not mounted.

##### NAV-2 `markSeen` on re-entry invalidates the whole derived list chain inside `ionViewWillEnter`
- Severity: High. Status: Confirmed (code), magnitude Suspected. Extends SALES-4/SALES-8 (they covered SSE frames and persistence, not re-entry).
- Evidence: `SalesOverview.vue:168-172` (`ionViewWillEnter` -> `markSeen`), `sales.ts:181-185` (`markSeen`: `items.find` then `sale.isNew=false`), `sales.ts:81-88` (`filteredSales` copies and sorts), `sales.ts:95` (`newCount`), `SalesOverview.vue:150-162` (`mappedSales`), `ItemsOverview.vue:321-331` (watcher) and `:265-267` (`newInView`), `utils/salesQuery.ts` `applySalesQuery` (sort by `isNew` first, ties by `localeCompare(..., locale, {numeric:true})`), `persistence.ts:112-126` (stringify of `items`).
- Root cause: "seen" is stored as a flag inside every Sale, and the view model (formatted strings, sorted array) is derived per render of the whole list from the whole store, so a one-item change costs O(N log N). The mutation also runs while the page is entering, so it delays the first paint of the page the user navigated to.
- Fix (root): (a) move seen-state out of the Sale objects into a small persisted `seenIds` set in the sales store (O(1) write, tiny persistence entry) and expose `isNew` through a per-id getter; (b) build the card view-model once per sale per locale in the mapper/store layer (memoized by `id + price fields + locale`), so `SalesOverview.mappedSales` becomes a cheap map over precomputed objects and a one-item change touches one entry; (c) mark as seen in `SalesDetails` (on enter, after first paint via `requestAnimationFrame`/idle), not in the list's `ionViewWillEnter`, so the re-entry path has no work; (d) keep the `new` sort order stable within a session (only re-sort on explicit refresh), which removes the sort from the markSeen path altogether. Layers: `stores/sales.ts`, `mapping/SaleMapping.ts` (or a view-model mapper), `views/sales/SalesOverview.vue`, `SalesDetails.vue`.
- Expected impact: back-navigation JS drops from about 100 ms to under 5 ms at N=1000 (about 1 s to under 20 ms at N=10000), no whole-list IDB rewrite per back.
- Effort: M. Risk: medium (badge count semantics, persisted format of `sales_data` must stay readable: keep `isNew` on write for old readers or migrate). Dependencies: NAV-3, NAV-4.

##### NAV-3 A new `Intl.NumberFormat` is constructed on every price/discount format call
- Severity: High. Status: Confirmed (code), cost per construction Suspected (about 15 to 50 us). Extends SALES-4 (which mentioned Intl per SSE frame; this is every recompute trigger).
- Evidence: `utils/formatPrice.ts:5-6` (`formatPrice` constructs per call), `:18-24` (`formatDiscount` constructs per call), `SalesOverview.vue:157-161` (up to 3 calls per sale per `mappedSales` evaluation), `SalesDetails.vue:~158-165` (`savingPercent` constructs), plus `Utils.convertDate`-style helpers elsewhere.
- Root cause: formatter construction is the expensive part of `Intl` and it is done in the innermost loop.
- Fix (root): a memoized formatter registry in `formatPrice.ts` keyed by `locale + style` (module-level `Map`, `Intl.NumberFormat` created once per key), and the same for `Intl.Collator` in `salesQuery.ts` (`new Intl.Collator(locale, {numeric:true})` hoisted per locale; use `collator.compare` instead of `localeCompare` with options). Layers: `utils/formatPrice.ts`, `utils/salesQuery.ts`, `utils/wateringStats.ts` (`relativeDaysText` check for the same pattern).
- Expected impact: `mappedSales` at N=1000 from about 60 ms to under 5 ms; the sort from about 30 ms to under 8 ms (Collator reuse). Applies to every trigger (E6, E7 per frame, E10, E14).
- Effort: S. Risk: low. Dependencies: none.

##### NAV-4 The persistence plugin's `$subscribe` is a deep, synchronous watcher: every mutation re-traverses the whole store state
- Severity: Critical at N>=1000 (seconds), High at N=100. Status: Confirmed (code and library source); magnitude Suspected. New (not in the first audit; FE-10 covers only the debounced flush, not the per-mutation traversal).
- Evidence: `stores/persistence.ts:128-137` calls `store.$subscribe(cb, { detached: true, flush: "sync" })`; Pinia 4.0.3 `dist/pinia.js:1030,1161-1167` implements `$subscribe` as `watch(() => pinia.state.value[$id], cb, assign({deep:true}, options))`; a deep sync watcher re-runs `traverse(state)` on every trigger, which reads every property of every nested object and registers a dep per property. Mutation sites that multiply it: `sales.ts:148-149` (`incoming.push` per frame, `addPricePoint` per new sale: `priceHistory[id] = ...`), `sales.ts:186-189` (`markAllSeen`: one mutation per new sale), `watering.ts:~90-91` (`byPlantId[id] =` and `loadedAt[id] =` per plant fetched by 3 workers), `plants.ts` optimistic upserts, `optimistic.ts` (two mutations per optimistic op).
- Root cause: change detection by deep observation of an arbitrarily large state tree, used only to schedule a debounced write that the callback then ignores until the 250 ms timer fires. The traversal cost is paid per mutation, while the actual need (one flush after a burst) is per action.
- Fix (root): drop the deep subscription. Persist on action completion instead: `store.$onAction(({ after, onError }) => { after(() => schedule()); })` (plus `$patch`), with a per-store dirty flag; the flush then runs once after a burst, and the string-diff baseline (`last`) can be replaced by a version counter or entry-level dirty set declared by the store (e.g. `dirtyOn: ["markSeen","runStream"]`). For direct state writes outside actions (components writing `store.x = ...`), route them through actions (a lint/test can enforce it). Also remove the `JSON.parse(json)` round trip in `flush` (`persistence.ts:121`): pass a structured-clone-safe snapshot (`toRaw` deep copy) or write the already-built value. Layers: `stores/persistence.ts`, store actions that currently rely on implicit detection (audit with a test that every persisted store mutation happens inside an action), `stores/optimistic.ts`.
- Expected impact: removes the quadratic term: a 1000-item stream goes from about 2 s of traversal to about 0 ms, `markAllSeen` with 1000 new from about 1.2 s to one flush; also removes a dep object per property of the whole state (memory and GC pressure, every persisted store: plants with `images` arrays, watering records, sales history).
- Effort: M. Risk: medium (persistence must still catch every mutation; the existing tests in `stores/persistence` need a dirty-action contract). Dependencies: coordinate with the persistence/store slice (FE-10, FE-13).

##### NAV-5 Every navigation awaits `modalController.getTop()` (document-wide `querySelectorAll`) up to twice
- Severity: Low (Medium at very large DOM). Status: Confirmed. 
- Evidence: `router/index.ts:169` (`await Utils.closeAllOpenModals()` before the guard), `utils/utils.ts:139-151` (`getTop`, and again after a dismiss), `@ionic/core overlays.js:371-399` (`getOverlays` = `Array.from(doc.querySelectorAll('ion-modal')).filter(...)`). Each page owns inline `ion-modal` elements (`SalesFilterModal`, adding modals), and all visited pages stay in the document, so the walk is O(total DOM nodes across mounted tabs).
- Root cause: modal state is discovered by querying the DOM instead of being tracked.
- Fix (root): an overlay registry (a tiny service that listens once for `ionModalDidPresent`/`ionModalDidDismiss` on `document` and keeps a counter/stack), and `closeAllOpenModals` returns immediately when it is empty. Layers: `utils/utils.ts` (or a new `OverlayService`), router guard unchanged. 
- Expected impact: removes 1 to 3 ms per navigation at N=1000 per tab with 3 tabs mounted (O(total DOM)); also removes two awaited promise hops before every navigation starts.
- Effort: S. Risk: low (modals opened by `modalController.create` also emit the events). Dependencies: none.

##### NAV-6 Every navigation re-renders every mounted page because the outlet passes a fresh `registerIonPage` closure per render
- Severity: Low (becomes High if any list page passes an unstable prop or slot to `ItemsOverview`). Status: Confirmed.
- Evidence: `@ionic/vue index.js:1706-1712` builds `registerIonPage: (ionPageEl) => registerIonPage(c, ionPageEl)` inside `render()` for every view item, `components.value = getChildrenToRender(id)` is reassigned on each transition (`:1614`), so `shouldUpdateComponent` sees changed props on every mounted page. Today `ItemsOverview` receives stable props (computed array refs, stable method refs, compiled stable slots), so the re-render stops at the page level (O(pages x template size)). Latent traps: `PlantOverview.vue:4-14` passes an inline array literal `:segments="[...]"` to `OverviewHeader` (rebuilt each page render, header-only), and any inline object/array/arrow prop passed to `ItemsOverview` would force an O(N) re-render of its grid on every navigation.
- Root cause: framework behaviour; the page components are not isolated from outlet renders.
- Fix (root): (a) keep `ItemsOverview` props referentially stable by contract (add a test that renders a list page twice and asserts `ItemsOverview` did not update); (b) hoist the `segments` literal to a computed/`data`; (c) in `ItemsOverview` make the grid its own child component (`ItemsGrid`) with `props: { items }` only so it can never be dragged along by slot or handler churn. Layers: `PlantOverview.vue`, `ItemsOverview.vue`. 
- Expected impact: guards against an O(N) re-render per navigation; today saves a few hundred microseconds.
- Effort: S. Risk: low. Dependencies: NAV-1 (grid component is the same seam).

##### NAV-7 `restoreSales` runs in `TabsPage.mounted` and needs the whole list because the tab badge is `items.filter(isNew).length`
- Severity: Medium. Status: Confirmed. Extends SALES-11 (which noted double hydration; this is the reason it runs at all).
- Evidence: `views/TabsPage.vue:86-96` (`await this.restoreSales()` on mount), `sales.ts:100-102` (`restore` = `$hydrate` of 3 entries), `persistence.ts:75-100` (reads each key, `store.$patch`, then re-stringifies each entry to set the baseline: a second full `JSON.stringify(items)`), `sales.ts:95` (`newCount`), `SideMenu.vue` (`salesCount` badge).
- Root cause: a 1-number summary (the badge) is derived from the full list, so the first screen the user sees pays for decoding, patching (deep reactive wrap) and stringifying a list the Plants tab does not need.
- Fix (root): persist a small `sales_summary` entry (`{ newCount, fetchedAt }`) written by the store actions that change `isNew` (stream completion, `markSeen`, `markAllSeen`), have `TabsPage` hydrate only that, and hydrate the full list lazily in `SalesOverview.mounted`/first `load`. Combine with `$hydrate(entryKeys)` support so a store can hydrate a subset. Layers: `stores/sales.ts`, `stores/persistence.ts`, `views/TabsPage.vue`.
- Expected impact: removes 15 to 40 ms (N=1000) from the boot critical path and one 3-entry IDB decode from the first paint of Plants.
- Effort: M. Risk: low to medium. Dependencies: NAV-2, NAV-4.

##### NAV-8 Side menu navigation uses `router.push` (forward, animated, unmounting semantics differ from the tab bar)
- Severity: Medium. Status: Confirmed (semantics), user impact Suspected (depends on whether the reporter uses the desktop menu or the tab bar; measure M2).
- Evidence: `components/SideMenu.vue` `navigate` -> `this.$router.push(to)` after `menuController.close()`; Ionic treats a plain router push as action `push`, direction `forward` (`vue-router index.js:397-520`), versus `IonTabButton.onClick` -> `handleNavigate(href,"push","none")` (`vue-router index.js:690`). Consequences in `handlePageTransition` (`vue index.js:1509-1613`): forward direction runs the animated transition (`animation()` -> `waitForReady(opts,true)`), the leaving page is kept mounted, history length and `locationHistory` grow by one per tap; on a later pop/back (browser back, Android back, `IonBackButton`) the leaving page is removed (`mount=false`, `:1580-1596`) so the next visit mounts N cards from scratch (first-mount row of the scaling table). The tab bar path keeps both pages mounted forever (duration 0).
- Root cause: two navigation primitives for the same top-level destinations.
- Fix (root): one navigation helper for top-level tab destinations used by both tab bar and side menu: `useIonRouter().navigate(path, "none", "push")` (or `handleNavigate(path,"push","none")`), exposed as a composable `useTabNavigation()` so tab semantics (no animation, page stays mounted, no history growth, optional `replace`) are identical. Layers: `components/SideMenu.vue`, new composable.
- Expected impact: desktop entry becomes the cheap E2 path (no animation of a full page, no remount after back); removes unbounded history growth.
- Effort: S. Risk: low to medium (back-button behaviour on desktop changes: tab switches no longer create history entries; confirm with product). Dependencies: none.

##### NAV-9 `ItemsOverview` keeps the filtered list as mutable `data()` and filters per keystroke with no windowing
- Severity: Medium. Status: Confirmed (code); keystroke magnitude Suspected. Confirms and refines FE-11.
- Evidence: `ItemsOverview.vue:247-259` (`filteredItems` in `data`), `:294-298` (`filterItems`), `:321-331` (immediate `items` watcher), `SearchBar.vue` (`:debounce="0"`, `mounted` calls `emitSearch` -> a second compute at mount), `Utils.baseSearchFilter` (`utils.ts:65-80`: `for key in item` over every string field including `imageUrl`, `description`, price strings; typing "http" matches every item).
- Root cause: derived state stored as mutable data and recomputed imperatively; the grid below it has no windowing so every change in the match set mounts/unmounts whole cards (5 component instances each).
- Fix (root): `filteredItems` becomes a `computed` of `(items, searchText)`, `searchText` set from the input with a trailing 120 to 150 ms debounce inside `SearchBar` (the composable owns it), search restricted to a declared set of fields (`name`, `description`) via the `OverviewItem` contract, and the grid from NAV-1 so unmounting is bounded. Layers: `ItemsOverview.vue`, `SearchBar.vue`, `utils/utils.ts`.
- Expected impact: per keystroke from 30 to 100 ms (N=1000, card churn) to under 10 ms; removes the double compute at mount and the deep-reactive duplicate of N items.
- Effort: S/M. Risk: low. Dependencies: NAV-1.

##### NAV-10 Re-entry into Sales never revalidates, while the other tabs do and `SalesDetails` can start a full scrape
- Severity: Low (consistency) / Medium (the detail-entry scrape). Status: Confirmed.
- Evidence: `SalesOverview.vue:165-171` (`mounted` -> `fetchSales(false)`, `ionViewWillEnter` does not call `load`), versus `PlantOverview.vue:93-95`, `SubstrateOverview.vue:119-121`, `ComponentOverview.vue:66-68` (all `ensureLoaded` on every enter); `SalesDetails.vue:137-139` calls `load({force:false})` on every enter, which starts a full SSE scrape (`POST /auth/ticket` + `EventSource`, 31 page fetches server side, SALES-1) once `fetchedAt` is older than 24 h in production (`utils.ts:19-23`, 6 h in dev) even though the user only opened one card. No `visibilitychange`/resume handler exists (E17), so a page left open past the TTL stays stale until pull-to-refresh or a detail open.
- Root cause: freshness policy is encoded in individual views instead of one resource policy; a stale-while-revalidate load is triggered from a leaf page.
- Fix (root): a single `ensureFresh()` policy on the store (`load({force:false})` semantic: serve cached, revalidate in the background at most once per TTL, in-flight dedup already exists via `coalesced`) called from one place (the list's `ionViewDidEnter`, not `WillEnter`, so it never delays the transition) and nowhere in the details page (details read from the store only, falling back to `GET /sales/:id` when the id is unknown, which also fixes deep links). Layers: `stores/sales.ts`, `SalesOverview.vue`, `SalesDetails.vue`. Depends on the server making `GET /sales` an indexed read (SALES-1) to be cheap.
- Expected impact: opening a detail never triggers a scrape; consistent staleness behaviour across tabs.
- Effort: S/M. Risk: low. Dependencies: SALES-1 for the full benefit.

##### NAV-11 Boot: mount is gated on the serial chain, and the first route chunk plus the modal query run inside it (confirms FE-3, FE-5)
- Severity: High (FE-3 rating). Status: Confirmed.
- Evidence: `main.ts:55-87` (`await applyInitialTheme()` before anything else, `await Promise.all([router.isReady(), resolveInitialLocale()])` before `mount`), `router/index.ts:168-196` (guard awaits `closeAllOpenModals`, then `ensureAuthenticated` -> IDB read -> optional `POST /auth/refresh-token`), `utils/apiUtils.ts:109-122` (token read from IDB per request: FE-5 confirmed), `theme/darkMode.ts:31-38` (IDB read before first paint).
- New detail beyond FE-3: `closeAllOpenModals` is the first awaited hop of the very first navigation, before the auth check; at boot there are no overlays so it is pure latency (2 awaited promises, one `querySelectorAll`). The theme IDB open (`StorageService` creates Ionic Storage lazily on first use) is also the IDB init that the later `$hydrate` calls wait on (`StorageService.ready`).
- Fix (root): as FE-3 (start locale chunk and route resolution before the theme await; synchronous theme from a `localStorage` mirror in an inline script; skeleton in `index.html`), plus make `closeAllOpenModals` a no-op when the overlay registry (NAV-5) is empty, plus an in-memory token (FE-5).
- Effort: M. Risk: low. Dependencies: NAV-5, FE-5.

##### NAV-12 Locale switch and `$t` registration re-render all mounted pages including hidden ones with N cards
- Severity: Low (rare event). Status: Confirmed (mechanism).
- Evidence: `main.ts:~72-76` (`$t` reads `locale.value` so every render using it depends on it), `ItemsOverview.vue:270-272` (`t` per card inside the render), `SalesOverview.vue:150-162` + `salesQuery.ts` (locale in `mappedSales`/sort), `SideMenu.vue` `changeLocale`.
- Root cause: hidden pages are reactive (FE-6) and the list re-renders as one big component.
- Fix (root): same seam as NAV-1/NAV-6 (grid as a child with windowing; pages that are not active skip re-render via an `active` flag set in `ionViewWillEnter/Leave` that gates expensive computeds). Layers: shared composable `usePageActive()` used by list pages.
- Expected impact: locale switch cost bounded by the visible page instead of the sum of all mounted tabs.
- Effort: S/M. Risk: low. Dependencies: NAV-1.

##### NAV-13 `storageService.clear()` on logout reads every stored value
- Severity: Low. Status: Confirmed.
- Evidence: `services/general/StorageService.ts:~70-85` (`clear`: `keys()` then `get` of every value to inspect `keepOnClear`, so all caches including the `sales_data` blob are decoded on logout).
- Fix (root): keep a small manifest (`keepOnClear` key list) or store protected entries under a key prefix and delete by prefix; Layers: `StorageService`, `persistence.ts` entries. Effort S. Risk low.

#### 4. Areas verified fine (re-verified, not taken from the first audit)

- Router guard cost per navigation: `resolveAccess` (`router/guards.ts`) is O(1); `ensureAuthenticated` returns after `hydrate()` (already hydrated) with a token present; `isAdmin` is a cached getter and the JWT decode (`session.ts` `decodeToken`) runs once per token change (computed cache). No network, no IDB read on re-entry. The only remaining per-navigation hop of note is NAV-5.
- No per-navigation token refresh: refresh is on 401 only (transport `AuthBridge`), plus the boot path. Cost is an extra RTT once per access-token expiry and once per Sales stream (`POST /auth/ticket`), not per navigation.
- Route watchers and `$route` readers: only `App.vue` (`showShell`, boolean computed), `SideMenu.vue` (`isActive`/`isTabActive`, 8 cheap string checks per render of the menu), `TabsPage.vue` (`activeTab`), and the `afterEach` title update. No list view reads the route.
- `ionViewWillEnter` is the only lifecycle hook used (8 views; no `ionViewDidEnter`, `ionViewWillLeave`, `activated`, `beforeRouteEnter`/`Leave` anywhere). Plants/Substrates/Components enter hooks resolve immediately when fresh (`ensureLoaded` `status==="ready" && !isStale`).
- Page titles: `updateDocumentTitle` is O(1) (a `t()` lookup and a string concat).
- `LocalizationService.t`: Map lookup plus a single-pass regex interpolation; the locale bundle is loaded once and cached; the document language is updated only on set.
- Dark mode: one class toggle, one forced style read, one IDB write per toggle.
- Layout store: one persisted boolean, hydrate once (`ensureLoaded`).
- Offline banner: one `online`/`offline` listener pair and one `resize` listener, removed in `beforeUnmount`; `measure` is guarded; no polling.
- PWA: `registerSW` once after mount, SW precache and `/uploads` CacheFirst only; hash history means no network navigations.
- No `setInterval`, no `visibilitychange`, no `pageshow`, no Capacitor `appStateChange` handlers: nothing runs on resume (no cost, no refresh either, see NAV-10).
- Outlet mechanics for tab switches: `handleNavigate(...,"none")` with `duration:0` skips the animation and `waitForReady` deep walk (`@ionic/core transition/index.js` `getAnimationBuilder` returns undefined, `noAnimation`); `deepWait` is false in the custom-elements build (`hasLazyBuild` false), so no recursive DOM readiness walk on tab switches.
- Scroll handler `handleScroll` assigns a boolean (no reactive trigger when unchanged).
- `ion-page` has `contain: layout size style`, so page show/hide is isolated from the rest of the document (it limits the cost to the page, it does not remove it).

#### 5. Measurement hooks (what I want you to take)

Use a production build with a Sales dataset of N=100, 1000, 5000 (and Plants N=1000 for comparison), Chrome Performance panel with 4x CPU throttle and without. Unless stated, record 3 runs and report the median.

M1 Tab re-entry, no data change (NAV-1). Scenario: open Sales once and let it finish; switch Plants -> Sales -> Plants -> Sales via the tab bar (viewport under 992 px). Capture the Performance trace and report for the switch interval: summed "Recalculate Style", "Layout", "Update Layer Tree", "Pre-Paint", "Paint", "Commit" and the long tasks; the number of nodes in the document (`document.getElementsByTagName('*').length`) and per page (`$0.querySelectorAll('*').length` on each `ion-page`). Also add temporarily `performance.mark` in `router.beforeEach`, `afterEach`, `SalesOverview.ionViewWillEnter` and a double `requestAnimationFrame` after `ionViewDidEnter` to read "tap to painted". If the JS part is under 5 ms and the rest is style/layout, NAV-1 is confirmed as the cause. Then run the same with `.tag-card { content-visibility:auto; contain-intrinsic-size: auto 260px }` injected via DevTools to see how much of it is layout (upper bound of the cheap adjunct).

M2 Same switch via the side menu on a viewport over 992 px (NAV-8): compare the trace with M1 (animation frames, `deepReady`, `locationHistory` size), then Plants -> Sales -> browser back -> Sales again: check whether `SalesOverview` mounted again (add a `console.count` in its `mounted` or watch the DOM node count drop and rise).

M3 Back from a detail with a new item (NAV-2/3). Scenario: ensure at least one `isNew` item, open it, press back. Profile from the click on back until the first paint. Report the self time of `filteredSales`, `applySalesQuery` (and `localeCompare`), `mappedSales`, `formatPrice`/`formatDiscount`/`Intl.NumberFormat` constructor, `ItemsOverview` render/patch, the pinia watcher traverse (function `traverse` from Vue), and the 250 ms later `flush` (`JSON.stringify`, `JSON.parse`, IDB put). Then repeat after memoizing `Intl.NumberFormat` in `formatPrice.ts` (console-patch it) to quantify NAV-3 alone.

M4 Deep traverse cost (NAV-4). In the console: `const s=useSalesStore(); console.time('t'); s.$state.items.forEach(()=>{}); ` is not enough; instead measure the watcher: wrap `traverse` via the Performance panel (search "traverse" bottom-up) during (a) a forced stream with N=1000 and (b) "Mark all as seen" with all items new. Report number of `traverse` calls and total self time; and heap snapshot (Memory) before/after hydrating `sales_data` to count `Dep` objects (`take_heapsnapshot`, filter by `Dep`/`Link`) versus `items.length`.

M5 Watering warm (NAV-4/E13). Plants with N=100 and about 100 records each: cold Plants entry; report count and total time of `traverse` calls and of `JSON.stringify` calls in the flush after the burst, and the long tasks.

M6 Modal query (NAV-5). With Sales (N=1000), Plants and Substrates mounted, time `document.querySelectorAll('ion-modal')` in the console (`performance.now()` around 100 calls) and `document.getElementsByTagName('*').length`.

M7 Boot (NAV-7/11). Reload with Sales cache present (N=1000): trace from navigation start to first Plants paint; report the `restoreSales` span (IDB read, `store.$patch`, the 3 `serialized` stringify calls) and whether it overlaps the first render. Also report `TabsPage.mounted` duration.

M8 Search typing (NAV-9). Type "mon" then backspace three times in Sales (N=1000): per keystroke script time, mount/unmount counts (`ProgressiveImage` created/unmounted via `console.count` in `created`/`beforeUnmount`), and long tasks.

M9 Locale switch (NAV-12) with Plants, Substrates and Sales mounted (N=1000 Sales): total time from the select change to the next paint; split JS vs layout.

M10 Outlet re-render (NAV-6). Add `console.count` in `ItemsOverview` render (use the `updated` hook) and navigate between tabs and into/out of a detail: expected count 0. Any non-zero count means an unstable prop reached the grid and is an O(N) re-render per navigation.

M11 Memory per mounted tab (NAV-1). Heap snapshot after visiting all four tabs with N=1000 each: retained size and instance counts of `ProgressiveImage`, `PlantPlaceholder`, `IonImg`, plus detached DOM; compare to heap with only the first tab visited.


---

## Appendix B: Sales vertical (DSAL-n)

### Deep scaling audit: Sales vertical (prefix DSAL)

Read-only. Baseline `main` at `f11430d`. No app code touched, no tests/builds/servers run. Cost constants come from small stand-alone Node microbenchmarks that import the repo's own `vue` 3.5.43 and replicate the store shapes (scripts in `scratchpad/bench/b1.cjs` to `b4.cjs`). They are DESKTOP V8 numbers. Assume 4x to 6x for a mid-range phone. Anything not traced in code or measured in those scripts is labelled Suspected.

Labels: Confirmed = traced in code (file:line). Measured = microbenchmark. Suspected = estimate, needs the measurement hooks in section 5.

Earlier-audit IDs used: SALES-n (appendix A), FE-n (appendix B), IMG-n, BE-n of `docs/performance-audit.md`.

Glossary used here: N = sale items in `store.items`; P = price points per item (cap 30, `sales.ts:23`); F = number of SSE data frames in one stream (at least one per non-empty page job, 31 jobs, or N/38 at ~16 KB per frame, whichever is larger); S = size of the whole store state in reactive properties (about 10 per item plus 2 + 2P per history entry).

---

#### 0. Short answer: why entering Sales is slow every time, and what a refresh does

1. The data is not what is slow to read. After the first hydrate nothing is read from IndexedDB on navigation (router guard only awaits `closeAllOpenModals()` and an already-hydrated session, `router/index.ts:168-170`, `session.ts:74-78`). The cost is DOM and reactive work that is proportional to N and is never windowed.
2. Tab re-entry is not a re-mount. Ionic Vue keeps the Sales page mounted and hides it with `.ion-page-hidden{display:none !important}` (tab switch has `routerDirection: "none"`, `@ionic/vue-router dist/index.js:668,690`, leaving view not unmounted at `@ionic/vue dist/index.js:1581`). Entering it removes `display:none` from a subtree of N cards at about 45 to 70 DOM nodes and 3 to 4 component instances per card, so the browser must run style, layout and paint for the whole list, and every `ion-img` and `ion-icon` custom element re-observes. That is O(N) main-thread work on every entry, with no `content-visibility`, no windowing, no pagination (Confirmed structure, magnitude Suspected: about 100 us per card desktop, 0.4 to 0.6 ms on a phone, so 200 ms is crossed at about N = 400 to 500 on a phone).
3. On top of that, the per-entry events that look cheap are not: returning from a detail page marks the opened item seen, and a single `sale.isNew = false` runs the full pipeline (deep reactive traversal of the whole store, re-sort with `localeCompare` options, 3 `Intl.NumberFormat` constructions per item, re-render of N cards) and 250 ms later stringifies, JSON-parses and IndexedDB-writes the entire list (DSAL-1, DSAL-3, DSAL-4, DSAL-11).
4. Cold start: `TabsPage.mounted` eagerly hydrates the Sales store (3 IndexedDB reads, 3 deep traversals, 3 stringifies) for the tab badge, even when the user never opens Sales (`TabsPage.vue:86-87`, DSAL-10).
5. When the persisted snapshot is older than 24 h (6 h in development builds, `utils.ts:19-23`, which is why it feels "every time" on a dev stack), `SalesOverview.mounted` starts a stream (`SalesOverview.vue:165-167`, `sales.ts:113-119`).
6. A refresh (pull to refresh, the reload icon, retry, stale-on-mount, and also pull to refresh on a Sales detail page) is not a delta. It re-streams the entire dataset through two serial round trips (`POST /auth/ticket`, then `EventSource`), every item gets a fresh `sale_scraped_at` (`Sale.ts:65`) so every item differs from what is stored, every frame re-runs the whole derive-sort-map-render pipeline even when nothing new arrived, every addPricePoint and flag mutation triggers a full deep traversal of the store, then 5 more mutations at `done` (each a full traversal), then a full rewrite of `sales_data` to IndexedDB (DSAL-1, DSAL-2, DSAL-6).

The single most expensive discovered mechanism is DSAL-1 (the persistence plugin's deep synchronous watcher). Measured: a cold stream at N = 500 spends 3.2 s of main thread in that watcher alone (desktop); `markAllSeen` is N x S.

---

#### 1. Input and entry-event inventory with traces

Notation per hop: DOM event, handler, derived cascade, store, persistence, network, server, merge, fan-out. Costs in Big-O, constants in section 2.

| # | Entry event | Trace (file:line) | Complexity | Notes |
|---|---|---|---|---|
| E1 | App cold start | `TabsPage.mounted` `TabsPage.vue:86-87` calls `restore()` `sales.ts:108-110` calls `$hydrate` `persistence.ts:74-96`: 3 parallel `storageService.get` (keys `sales_data`, `sales_price_history`, `sales_query`), then `$patch` per entry (each assignment fires the sync deep watcher, `persistence.ts:88`), then `serialized()` (stringify) per entry (`:89`) | O(N + N*P) with a traversal per entry: about 3 traversals + 3 stringify + IDB deserialize | Happens at tabs mount, not at Sales entry. Competes with the first Plants render. |
| E2 | First entry into Sales, data fresh | Router lazy chunk, `SalesOverview.mounted` `:165-167` calls `fetchSales(false)` `:195-206` calls `load` `sales.ts:113-119` (returns at once when `status==='ready' && !stale`). Meanwhile render: `mappedSales` `:150-163`, `ItemsOverview` items watcher `:321-331`, v-for `:95-141` | O(N log N) sort + O(N) 3x Intl + O(N) mount of cards | If hydrate has not finished yet (deep link), `load` hydrates a second time (`sales.ts:116`, DSAL-10). |
| E3 | Entry with stale data (> 24 h prod, 6 h dev) | as E2 then `runStream` `sales.ts:121-171` | see E8 | First visit after a day. |
| E4 | Tab re-entry via tab bar | `ion-tab-button` href, `router.push` with direction "none", `ionViewWillEnter` `SalesOverview.vue:168-172` is a no-op unless `openedId` set. Page already mounted; `.ion-page-hidden` removed | O(N) style, layout, paint, plus `ion-img` IntersectionObserver callbacks for what is on screen | The most likely candidate for "slow every time" (Suspected magnitude). No code runs per entry; the browser pays for the DOM size. |
| E5 | Entry via side menu (desktop) | `SideMenu.vue:385-387` `router.push(to)` (direction forward, with slide animation), same page reuse | as E4 plus a compositor transition of a very tall layer | |
| E6 | Tap a card | `ItemsOverview.vue:97` click calls `navigateToItem` `:313-319` calls `onItemClick` `SalesOverview.vue:208-213` (O(N) `find`) then `router.push`. `SalesDetails` mounts, `ionViewWillEnter` `:137-139` calls `reload()` `:183-192` calls `load({force:false})` (no-op when fresh). `sale` computed does `byId` = O(N) `find` `sales.ts:96-99` | O(N) small | Chart.js lazy chunk on first use. List page set to `display:none`. |
| E7 | Back from detail | detail view unmounted (`routerDirection back`), list `ionViewWillEnter` calls `markSeen(openedId)` `sales.ts:181-184`: `sale.isNew=false` | per NEW item: 1 deep traversal O(S) + recompute pipeline O(N log N + 3N Intl) + render O(N) + 250 ms later flush (stringify all entries, JSON.parse, IDB put of the whole list) O(N + N*P) | Only when the item was NEW (Vue does not trigger when the value is unchanged). A fresh install has N new items, so the first N returns all pay it. Also E4 cost (page shown again). |
| E8 | Stream (cold, fresh install or empty items) | `ApiUtils.stream` `apiUtils.ts:284-356`: `POST /auth/ticket` (`:292`, plus IDB token read `:110`), `EventSource /sales?ticket=`. Per frame `onMessage`: `convertToSales` `SaleMapping.ts:42-46`, `{...sale,isNew}` + Map, `incoming.push(...fresh)` `sales.ts:148` (1 mutation), `addPricePoint` per item `:149,192-198` (1 mutation per item with a changed price, which is every item on a fresh install). Per frame the UI pipeline runs because `visibleSales` returns a new array (`:81-85`) | deep watcher: (N + F) traversals of size growing to S: O(N * S) = O(N^2). UI: F x O(visible log visible + 3 visible + render visible) | Measured: 3185 ms for N=500 in the watcher alone. |
| E9 | Stream (warm: pull to refresh, reload icon, retry, stale on mount, also detail-page pull to refresh `SalesDetails.vue:193-195`) | same transport. `knownIds` from items (`:122`), `received` Map, no `addPricePoint` mutation if price equal (`:194`). But `incoming` grows so `visibleSales` is a new array per frame (`:82-85`, builds `new Set(items ids)` O(N) per frame). At `done` 5 mutations `:158-162`, each a full traversal | F + 7 traversals of about 1.5 N items, plus F x full pipeline over N | Every frame, although nothing visible changed. Then items replaced by new objects, flag copies, new `scrapedAt` on all. |
| E10 | Search typing | `ion-searchbar` `:debounce="0"` (`SearchBar.vue:6`) calls `ionInput` calls `onInput` calls emit `search` calls `ItemsOverview.filterItems` `:294-298` calls `baseSearchFilter` `utils.ts:65-80` (per item, per string field, `toLowerCase()`), then `filteredItems = result` | O(N * fields) filter + keyed v-for diff: cards that drop out unmount, cards that return mount again | Per keystroke. No debounce. Search is local to `ItemsOverview`: it never reaches the store query, so count text and "shown" counter disagree with it. |
| E11 | Clear search / backspace | `clearSearch` `:299-301` | remounts up to N cards | each card re-creates 2 `new Image()` loaders (`ProgressiveImage.vue:90-103`) |
| E12 | Sort select | `ion-select` `ionChange` `SalesOverview.vue:28` calls `setQuery` `sales.ts:173-175` | 1 traversal O(S) + sort + 3 Intl per item + keyed reorder of N + flush stringify all 3 entries (no write: only `sales_query` changed) | |
| E13 | Open filter modal | `showFilter=true`, `SalesFilterModal` `v-if=mounted` `useMountWhileOpen` | O(sellers) mount (about 14 checkboxes) + `sellers` getter O(N) once | Independent of N otherwise. |
| E14 | Modal inputs: shop checkbox, only-new toggle, discount segment, min/max price typing | local `draft`/`priceText` data only (`SalesFilterModal.vue:30,41,54,64`) | O(1) per keystroke (modal render) | Fine. |
| E15 | Apply / Reset filters | `apply` `:178-185` emits, `SalesOverview.applyFilters` `:184-187` calls `setQuery` or `resetQuery` | same as E12 plus unmount/mount of the cards added or removed | |
| E16 | Mark all seen | `markAllSeen` `sales.ts:186-189`: `items.forEach(sale.isNew=false)` and the same for `incoming` | K mutations (K = NEW count), each a sync full traversal: O(K * S), quadratic when most items are new | Measured model: N=500 all new is about 9 s desktop. |
| E17 | Scroll | `ion-content :scroll-events="true"` `@ionScroll` `ItemsOverview.vue:2,273-275` | per scroll event O(1); `showScrollTop` only changes at threshold | Fine, one handler call per scroll frame. |
| E18 | Image completion (per card, twice) | `ProgressiveImage.processImage` `:73-103`: placeholder mounted, low-res `new Image` onload sets `currentSrc` (placeholder unmounts, `ion-img` mounts), high-res onload sets `currentSrc` again (src swap, `ion-img` `srcChanged` re-creates its IntersectionObserver) | 3 patches per card, 2 requests per card, mounted regardless of visibility | defeats `ion-img` lazy load (`ion-img.entry.js` `addIO`) |
| E19 | Locale change | `localizationService.locale` ref read inside every `t()` and `getLocale()` | re-render of every card | rare |
| E20 | Logout / account wipe | `resetAllStores`, `$cancelPersist`, `keepOnClear` entries stay | O(1) | Sales data intentionally survives logout. |
| E21 | App resume, visibility, online/offline, timers, push | none found for Sales (`network.ts:19` only drives the offline banner; no `visibilitychange`, no polling) | none | Verified absent. Staleness is only checked on mount. |
| E22 | Server side of E8/E9 | `salesRoutes.ts:36` ticket auth, `FetchSalesOverview.execute` `:66-107` (31 jobs, limiter 8 and 2), `BaseScraper.fetchPage` `:78-136` (cache get by `key_page`), `Sale.fromRaw` per item (sha1 + `new URL`), `sse.sendUnique` `SseManager.ts:46-61`, `chunkAndSend` `:101-120` (stringify each item twice) | O(N) CPU per stream on the shared event loop, 4.7 ms at N=500, 28 ms at N=5000 (Measured) when the cache is warm; a cold cache is bounded by the slowest shop | Payload 181 KB at 500, 1.8 MB at 5000, uncompressed. |

---

#### 2. Scaling table

Method: desktop V8 microbenchmark constants x item count, P = 2 unless noted. "Mobile" = 5x (assumption). Flag: `!16` exceeds one frame, `!50`, `!200` exceed those budgets on desktop; `m200` means it crosses 200 ms on a phone.

Constants (Measured unless marked):
- c_trav, deep traversal by the persistence watcher, per mutation: about 17 us + 9.6 us x P per item. At P=2 about 36 us/item. Raw numbers (b1): N=500: P=1 17 ms, P=10 66 ms, P=30 153 ms; N=5000: 154 ms, 579 ms, 1520 ms.
- c_sort, `applySalesQuery` with `localeCompare(..., {numeric:true})` (sort "new"): N=50 1.6 ms, N=500 24 ms, N=5000 316 ms. With a cached `Intl.Collator`: 0.08, 0.9, 12.8 ms.
- c_map, `mappedSales` with 3 `Intl.NumberFormat` constructions per item: N=50 4.4 ms, 500 40 ms, 5000 258 ms. With cached formatters: 0.08, 0.6, 7.5 ms.
- c_render, ItemsOverview re-render with N keyed cards, props unchanged: about 15 us per card (Suspected).
- c_mount, mounting one card (ProgressiveImage + PlantPlaceholder + art, then IonImg, IonIcon, about 25 elements + custom elements): about 300 us (Suspected).
- c_layout, style+layout+paint of one card when the page becomes visible: about 100 us (Suspected).
- c_flush, stringify items + history: 2.2 us/item at P=1, about 3 us at P=2 (Measured: 10.9 ms at N=5000/P=1). Write path adds `JSON.parse` (1 us/item) and an IndexedDB structured clone put (about 5 to 10 us/item, Suspected).

| Event | N=10 | N=100 | N=1000 | N=10000 | First threshold crossed (desktop / phone) |
|---|---|---|---|---|---|
| E1 hydrate (about 100 us/item: 3 traversals + 3 stringify + IDB deserialize) | 1 ms | 10 ms | 100 ms `!50` | 1 s `!200` | 50 ms at N=500 / 200 ms at N=400 |
| E2 first mount of the list (about 0.5 ms/card incl. sort, map, mount, layout) | 5 ms | 50 ms `!50` | 500 ms `!200` | 5 s | 50 ms at N=100 / 200 ms at N=80 |
| E4 tab re-entry (layout/paint only, Suspected) | 1 ms | 10 ms | 100 ms `!50` | 1 s | 16 ms at N=160 / 200 ms at about N=400 |
| E7 return from detail of a NEW item (traversal 36 + sort 55 + map 60 + render 15 + flush 12 = about 180 us/item) | 2 ms | 18 ms `!16` | 180 ms `!50` | 1.8 s | 16 ms at N=90 / 200 ms at N=220 |
| E8 cold stream, deep watcher only (measured 12.8 us x N^2) | 1.3 ms | 128 ms `!50` | 12.8 s `!200` | about 21 min (extrapolated) | 200 ms at N=125 / 200 ms at N=50 |
| E8 cold stream, per-frame pipeline (F x avg visible N/2 x 130 us, F = max(31, N/38)) | 6 ms | 200 ms `!200` | 2 s | about 170 s | at N=100 |
| E9 warm refresh, deep watcher (F+7 traversals of 1.5 N x 36 us, F=max(31,N/38)) | 20 ms `!16` | 205 ms `!200` | 2.1 s (31) to 3 s | about 70 s | at N=100 / at N=30 |
| E9 warm refresh, per-frame pipeline (F x N x 130 us) | 40 ms | 400 ms `!200` | 4 s | about 340 s | at N=40 |
| E10 search keystroke, narrowing to 10% (remove 0.9 N cards x 100 us + filter 0.5 us/item) | 1 ms | 9 ms | 90 ms `!50` | 0.9 s | 50 ms at N=550 |
| E11 backspace restoring list (0.9 N x (300 us mount + 2 image loaders)) | 3 ms | 27 ms `!16` | 270 ms `!200` | 2.7 s | 16 ms at N=60 / 200 ms at N=740 |
| E12 sort change (traversal 36 + sort 55 + map 60 + reorder 30 + flush 3 = about 185 us/item) | 2 ms | 18 ms `!16` | 185 ms | 1.9 s | 16 ms at N=90 / 200 ms at N=215 |
| E15 apply filter (E12 plus add/remove cards at 100 to 300 us) | 3 ms | 25 ms | 250 ms `!200` | 2.5 s | |
| E16 mark all seen, all new (K=N mutations x N x 36 us = 36 us x N^2) | 4 ms | 360 ms `!200` | 36 s | about 1 h | 200 ms at N=75 / at N=33 |
| E22 server CPU per stream, warm cache (Measured: 4.7 ms at 500, 28 ms at 5000) | 0.1 ms | 1 ms | 9 ms | 56 ms (shared event loop) | |
| Transfer per load, uncompressed (about 365 B/item, Measured payload 181 KB at 500) | 4 KB | 36 KB | 365 KB | 3.6 MB | repeated on every refresh |
| Persisted `sales_data` (about 430 B/item, Measured 213 KB at 500) | 4 KB | 43 KB | 430 KB | 4.3 MB | IDB clone on every markSeen |
| Persisted `sales_price_history` (about 60 + 38 x P bytes per id) at P=2 | 1.4 KB | 14 KB | 140 KB | 1.4 MB | grows without bound, see DSAL-5 |
| Heap for reactive tracking of the list (Suspected, about 2 to 4 KB/item: item, proxies, Dep/Link per property for persist watcher, computeds, render effect) | 40 KB | 400 KB | 4 MB | 40 MB | |

Time growth example (DSAL-5): with a weekly rotating catalogue and no pruning, the 52 weeks history holds about 52 x N ids. At N=500 that is 26 000 history entries, so every traversal is about 26 000 x (2 + 2P) properties more: single mutation roughly 0.9 s desktop (P=2, extrapolated from 17 + 9.6 P us/item) and growing.

Per-item footprint in the grid (Confirmed by template, counts approximate):
- DOM per card with a photo: li, button, `.tag-media`, `.progressive-img-container`, `ion-img` host (+ shadow `img`), optional new pill, `.tag-body`, `.tag-hole`, `.tag-name`, `.tag-price` and 4 to 6 children, discount chip + `ion-icon` host (+ shadow icon svg, about 3 nodes), `.tag-sub`; about 22 to 26 elements plus about 10 text nodes and about 8 `<!--v-if-->` comments: about 45 nodes.
- DOM per card while the placeholder shows (before the first image load, and always for items without a photo): replaces the `ion-img` subtree with `div.placeholder` + `svg` + `g`/`path`/`circle` art: 14 to 25 SVG elements per `SaleArt` shape (`SaleArt.vue`): about 40 elements, about 65 nodes. The card is built with the placeholder first, then swapped (mount, unmount, mount again).
- Component instances per card: ProgressiveImage, PlantPlaceholder, SaleArt (placeholder phase); later IonImg and, with a discount, IonIcon. 3 to 4 live at a time, 5 created over the card's life.
- Reactive effects per card: render effects 3 to 4; computeds 5 (PlantPlaceholder `art`, `h`, `tint`, `shape`; ProgressiveImage `showPlaceholder`); watchers 1 (`src` immediate watcher on ProgressiveImage, `ProgressiveImage.vue:64-71`).
- Custom elements with their own observers: each `ion-img` creates one `IntersectionObserver` per `src` change, and `src` changes twice per card (`ion-img.entry.js` `addIO`/`srcChanged`).
- Network per card at mount: 2 image requests (`?size=128` then original) regardless of viewport (IMG-1, IMG-2).
- At N = 50 / 500 / 5000: about 2.3k / 23k / 230k DOM nodes, 150-200 / 1.5-2k / 15-20k component instances, 100 / 1000 / 10000 image requests.

---

#### 3. Findings

##### DSAL-1: The persistence plugin runs a deep, synchronous traversal of the entire store state on every single mutation
- Severity: Critical. Status: Confirmed in code, Measured in microbenchmark. Corrects and escalates FE-10 and SALES-8 (earlier audits rated whole-collection persistence Medium/Low and blamed `JSON.stringify`; stringify is the cheap part).
- Evidence: `persistence.ts:128-138` calls `store.$subscribe(cb, { detached: true, flush: "sync" })`. Pinia merges `{ deep: true }` and passes it to `watch(() => pinia.state.value[$id], ..., options)` (`frontend/node_modules/pinia/dist/pinia.esm-browser.js:1029,1152-1165`). In Vue 3.5 a deep sync watcher re-runs its getter, which is a `traverse` of the whole reactive tree, once per triggering mutation, before the callback (the callback's `if (suppressed) return` at `persistence.ts:130` runs after the traversal). Mutation sites that fire it: `sales.ts:124,125` (start), `:148` (every frame), `:149`/`:195` (every changed price, per item), `:158-162` (5 at done), `:183`, `:187` (per item), `:195`, `setQuery`, and `$hydrate`'s three `$patch` calls (`persistence.ts:88`; `isSyncListening` only gates the callback, not the traversal).
- Measured (b1, b2): single mutation under the watcher: N=500/P=1 17 ms, P=30 153 ms; N=5000/P=1 154 ms, P=30 1.5 s. Cold stream (500 items in 9 frames plus 500 price-point mutations): 3185 ms; N=2000: 51 s. Warm refresh: 230 ms at N=500, 2.7 s at N=2000. Quadratic in N.
- Root cause: persistence is implemented as "observe the whole object graph deeply and synchronously" rather than "know what changed". Reactive tracking of a 2 MB immutable list that nobody mutates field by field buys nothing.
- Root-cause fix (layers: `stores/persistence.ts`, `stores/sales.ts`, then the other 7 persisted stores which pay the same per-mutation tax):
  1. Persistence entries declare a cheap revision signal instead of being found by traversal: a plugin option like `watch: (state) => state.itemsRevision` (a number the store bumps in the one action that replaces `items`), or `watch(() => state.items, ..., { deep: false })` combined with replace-on-write updates (immutable list replaced as a whole). Shallow, flush `post`, debounced.
  2. Store the sale list as `shallowRef`/`markRaw` data (records are replaced wholesale on stream commit, never edited in place). This also removes the per-property `Dep`/`Link` memory and the Proxy per item (DSAL-12 memory).
  3. Replace `JSON.stringify` change detection with the revision counter; write `structuredClone(toRaw(state.items))` (the codebase already does this in `optimistic.ts:4-10`) or hand the raw array to IndexedDB, which clones itself. The `JSON.stringify` then `JSON.parse` double pass at `persistence.ts:117,121` disappears.
- Expected impact: removes the N^2 term entirely: cold stream at N=500 loses 3.2 s desktop (about 16 s on a phone), warm refresh loses 0.23 s, `markAllSeen` becomes O(1), boot hydrate loses 3 traversals.
- Effort: M. Risk: medium (all persisted stores, existing tests in `salesStore.test.ts` and persistence tests need adapting). Dependencies: DSAL-4 (seen state split), DSAL-11.

##### DSAL-2: Every SSE frame recomputes the whole list pipeline, even a warm refresh that changes nothing visible
- Severity: High. Status: Confirmed (SALES-4 confirmed and its scope enlarged: it also hits warm refreshes). Measured constants.
- Evidence: `sales.ts:81-85` `visibleSales` returns a new array every time `streaming && incoming.length > 0` (builds `new Set(items.map(id))` O(N) per recompute, then `[...items, ...filtered]`). `filteredSales` `:87-89` copies and sorts it, `sellers` `:90-94` re-sorts sellers with `localeCompare`, `SalesOverview.vue:150-163` re-maps every item with 3 Intl constructions, `ItemsOverview.vue:321-331` assigns a new `filteredItems`, `:96` re-renders N keyed cards, `newInView` `:265-267` filters again. Each SSE `message` is its own task (`apiUtils.ts:307-315`) so Vue flushes after every frame. Server emits at least one frame per non-empty page job (31) even with a warm cache (`FetchSalesOverview.ts:73-103`).
- Root cause: UI is bound to the transport. The store's own header comment says `items` is replaced only on completion (`sales.ts:8-10`), but `visibleSales` exposes the partial `incoming` stream into the whole derived chain per frame.
- Fix (layers: store; view unchanged): keep `incoming` out of reactive state (plain `Map` in the action closure) and commit once on `done` (stale-while-revalidate: the old list stays on screen, the toolbar shows the existing "checking" indicator, `SalesOverview.vue:56-59`). For the cold, empty case commit at most every 250 ms or per animation frame (single batched mutation), never per frame. Ultimately removed by DSAL-6 (the stream disappears from the read path).
- Expected impact: warm refresh from F x pipeline (N=100: 0.4 s, N=1000: 4 s desktop) to 1 x pipeline; cold stream from quadratic to linear.
- Effort: S. Risk: low (`salesStore.test.ts` asserts visible-while-streaming behaviour, adapt). Dependencies: none; complements DSAL-1.

##### DSAL-3: Intl formatters and collators are constructed per item in the hot recompute path
- Severity: High. Status: Confirmed, Measured. Related: SALES-4.
- Evidence: `formatPrice.ts:5-6` builds `new Intl.NumberFormat` on each call; `formatDiscount` `:22-24` another; `SalesOverview.vue:157-161` calls `formatPrice` up to twice and `formatDiscount` once per item per recompute. `salesQuery.ts:72` calls `a.name.localeCompare(b.name, locale, { numeric: true })` in the comparator (N log N calls, each re-resolving locale and options). `sellers` getter `sales.ts:91-93` uses `localeCompare` per comparison. `PriceHistoryChart.vue:67-70,115-120` and `SalesDetails.vue:156` build formatters per point and per render (P <= 30, small).
- Measured: 3 Intl per item = about 80 us/item (N=500: 40 ms; N=5000: 258 ms). `localeCompare` with options: N=500 24 ms, N=5000 316 ms. Cached `Intl.NumberFormat`/`Intl.Collator`: 0.6 ms and 0.9 ms at N=500 (40x and 27x faster).
- Root cause: formatting and comparison are done lazily at render time with locale-agnostic helpers that have no cache, and derived display strings are recomputed from raw numbers on every unrelated invalidation (stream frame, flag flip, sort change).
- Fix (layers: `utils/formatPrice.ts`, `utils/salesQuery.ts`, `mapping/SaleMapping.ts`, store): (a) module-level memo of formatters and one `Intl.Collator` per locale, invalidated by the locale ref. (b) compute `priceText`, `oldPriceText`, `discountPercent`, and a lowercase search key once at ingest into an immutable `SaleView` entity and keep sorting keys (name collation key, discount) precomputed; `mappedSales` then becomes a pure slice, no per-recompute formatting. 
- Expected impact: E7, E12, E15 and every stream frame lose about 115 to 140 us/item; N=500: 64 ms to about 2 ms per recompute desktop.
- Effort: S for (a), M for (b). Risk: low. Dependencies: none.

##### DSAL-4: "Seen" state is stored inside every item, so one flag flip dirties the whole list, and "Mark all seen" is quadratic
- Severity: High. Status: Confirmed (code), Measured model (N x S).
- Evidence: `sales.ts:143` bakes `isNew` into each item copy; `markSeen` `:181-184` and `markAllSeen` `:186-189` mutate item fields; `newCount` `:95` and the tab badge derive from them. Each field write is a persistence-watcher traversal (DSAL-1), a full pipeline recompute (DSAL-2/3) and a full `sales_data` rewrite (DSAL-11). `markAllSeen` performs K such mutations in a loop with no batching: with N=500 NEW items about 500 x 18 ms = 9 s desktop. A fresh install has N new items. `isNew` also survives only as long as the item is in `items`: when an item drops out of a stream and returns, it is flagged NEW again although its history exists.
- Root cause: derived user state (what was seen) is modelled as mutable data on server-origin records.
- Fix (layers: store, persistence, `ItemsOverview` input mapping): keep immutable sale records; keep `seenIds` (or `lastSeenAt` plus `firstSeenAt` on each record) as a separate small structure persisted as its own key; `isNew` is derived `!seen.has(id)`; `markAllSeen` is one assignment; `markSeen` mutates the small set (O(1) persist of a few KB). Then the list pipeline only re-derives when `seen` changes, and only the NEW-pill dependent slice changes.
- Expected impact: E7 from about 180 us/item to about 20 us/item; E16 from quadratic to O(N) at worst (one pass), O(1) when derived lazily.
- Effort: M. Risk: medium (store contract: `Sale.isNew` consumers: `ItemsOverview`, badge in `TabsPage.vue:51`, `SideMenu.vue:40`, tests). Dependencies: DSAL-1.

##### DSAL-5: Price history is never pruned, is persisted and traversed in full, and grows without bound
- Severity: High (grows with calendar time). Status: Confirmed (no deletion path anywhere: only `sales.ts:192-198` writes `priceHistory`; grep finds no other writer), magnitude Suspected beyond one year of weekly catalogue rotation.
- Evidence: `sales.ts:36,57-65,192-198`. `items` is replaced by exactly the ids received (`:158`), but `priceHistory` keeps every id ever seen, up to 30 points each. The whole object is part of the deep-traversed state (DSAL-1), part of `pick` for `sales_price_history` and stringified on every flush (`persistence.ts:117`), keyed as `Object.entries(...).map` (new arrays per flush) and hydrated at boot (E1). `addPricePoint` also stores `Date.now()` per client, so two clients disagree (SALES-9).
- Measured: P multiplies traversal cost (17 + 9.6 P us/item): at P=30 each mutation costs 153 ms at N=500. 26 000 stale ids (one year, N=500, weekly rotation) projects to about 0.9 s per mutation at P=2.
- Root cause: client-local, unbounded cache of a server-owned time series, kept in the same reactive store as the list.
- Fix (layers: backend sales module, store): the server persists items and price points (the SALES-1 fix) and serves `GET /sales/:id/history` on detail open (30 points, a few hundred bytes); client history is a lazy, per-item IndexedDB record read only by `SalesDetails`, with a retention cap (prune ids absent from the latest snapshot after 30 days). Short term, same layer: prune ids not in `items` on stream commit and store each history as its own key.
- Expected impact: removes P and age from every list-path cost; list store state shrinks to items only.
- Effort: M (client prune and split) to L (server history). Risk: low to medium. Dependencies: SALES-1 for the server variant.

##### DSAL-6: Every load transfers and rebuilds the entire dataset; there is no pagination, no delta, and `scraped_at` changes on every item every request
- Severity: High (architectural, extends SALES-1, SALES-9, SALES-10). Status: Confirmed.
- Evidence: `salesController.ts:23-27` streams all items of all 31 jobs; `Sale.ts:65` sets `sale_scraped_at: new Date().toISOString()` at request time, so each item serialises differently each time (`SaleMapping.ts:35` copies it into the client item), which makes the "did anything change" test at `persistence.ts:118` always fail for `sales_data` and forces a full list rewrite after every refresh. `SseManager.ts:101-120` stringifies every item twice (size check at `:106`, frame at `:126`). No compression on the SSE stream (reply is hijacked, `sseEndpoint.ts:61`). Server CPU per warm stream: 4.7 ms at N=500, 28 ms at N=5000 (b4) on the same event loop that serves everyone. Payload measured at 181 KB (N=500), 1.8 MB (N=5000), 12 and 114 frames.
- Root cause: reads trigger extraction (SALES-1) and the read contract is "all items, always".
- Fix (layers: backend sales module + repository + migration, `apiUtils`, store): scheduled refresher persists `sales_items` and `sales_price_points`; `GET /sales?cursor=&limit=&sort=&shop=&minDiscount=&q=` keyset-paginated, `ETag`/`Last-Modified`, gzip/brotli; `scraped_at` becomes the scrape time (or is dropped from the list contract); the client keeps page 1 and extends on scroll (works with DSAL-7). SSE stays only for admin recheck progress. NEW semantics move to `first_seen_at` on the server compared with a stored `lastVisitedAt` (also fixes first-install "everything is NEW", SALES-9).
- Expected impact: transfer from O(N) per entry to O(page); refresh becomes one conditional GET (a 304 when nothing changed); persist writes shrink to one page; frame count F disappears; the 2-RTT ticket handshake is removed from the read path.
- Effort: L. Risk: medium (contract change; `contract` tests). Dependencies: SALES-1 (same work item).

##### DSAL-7: The grid is not windowed, so every entry, search keystroke and filter change is O(N) DOM work
- Severity: High. Status: Confirmed structure (`ItemsOverview.vue:95-141` renders every item; no `content-visibility`, no virtual list, no incremental rendering), per-card counts in section 2, timings Suspected. Extends SALES-10, FE-11.
- Evidence: see section 2 (45 to 65 nodes and 3 to 4 component instances per card). Tab re-entry removes `display:none` (E4). Search (E10/E11) unmounts and remounts hundreds of cards per keystroke because the keyed v-for is bound to the search result (`:96`, `filteredItems` data `:250,294-298`).
- Root cause: `ItemsOverview` is a shared "render everything" component for all four collections; its cost is O(collection) per interaction.
- Fix (layers: `components/overview`, benefits Plants/Substrates/Components too): a `useWindowedGrid` composable and a windowed list in `ItemsOverview` (measure column count and fixed card height, render only rows within viewport plus overscan from `ionScroll`, spacer elements for the rest). Keep a stable mounted pool so search and filter changes recycle nodes instead of mounting. A purely CSS `content-visibility: auto; contain-intrinsic-size` on `li` helps layout and paint but still mounts N components, so it is a complement, not the fix.
- Expected impact: E2, E4, E10, E11, E12, E15 become O(visible) (about 8 to 14 cards on a phone): re-entry from 100+ ms at N=1000 to a few ms; mount cost removed from the list path.
- Effort: M to L. Risk: medium (focus order, a11y `role=list`, anchor on scroll restoration). Dependencies: DSAL-6 pairs naturally (pages feed the window).

##### DSAL-8: `ProgressiveImage` starts 2 image loaders per card at mount, defeating `ion-img`'s lazy loading, and swaps DOM 3 times per card
- Severity: High. Status: Confirmed. Confirms IMG-1, IMG-2, SALES-3 for this slice and adds scaling numbers.
- Evidence: `ProgressiveImage.vue:90-103` (`new Image()` for `url&size=128`), `:105-121` (second `new Image()`), `:60-62` placeholder shown while `currentSrc` empty, `ItemsOverview.vue:99`. `ion-img.entry.js` creates its own IntersectionObserver in `addIO` and loads only when intersecting, but the `new Image()` loaders already pulled both files. For third-party hotlinked sale images `?size=128` is not honoured (it is a second full download or a 404 fallback to `fetchHighRes`).
- Scaling: 2N requests at list mount (1000 at N=500, 10 000 at N=5000), queued by the 6 per host limit, completing in arbitrary order; every completion re-patches that card; typing in search remounts cards and re-fires both loaders.
- Fix (layers: `components/ProgressiveImage.vue`, `components/ui`): a single native `<img loading="lazy" decoding="async" width/height or aspect-ratio>` with a persistent placeholder that stays until `load`, no second request, `srcset` only where the backend offers variants (IMG design). With DSAL-7 only visible cards even exist.
- Effort: S to M. Risk: low. Dependencies: IMG variant pipeline for owned photos.

##### DSAL-9: Search is per keystroke, undebounced, local to the rendered list, and re-lowercases every field of every item each time
- Severity: Medium. Status: Confirmed.
- Evidence: `SearchBar.vue:6` `:debounce="0"`, `ItemsOverview.vue:294-298`, `utils.ts:65-80` (`for (const key in item)`, `toLowerCase()` per string field: about 7 fields per mapped item including the 40 character id and image URL, so a match on the hash or URL is possible), `SalesOverview.vue:21-52` counters ignore the search. Cost is small in filter (about 0.5 us/item) and large in the follow-up v-for diff (DSAL-7).
- Root cause: search is a view concern with no connection to the query model that already holds sort and filters (`SalesQuery`).
- Fix (layers: `salesQuery.ts`, store getter, `SearchBar`): add `text` to `SalesQuery`, match against a precomputed `searchKey` (lowercased name + seller) built at ingest, apply it inside `applySalesQuery` so counts, empty states and persistence stay consistent; debounce the emit by about 150 ms at the input boundary only as a complement. Match only declared fields, not ids or URLs.
- Effort: S. Risk: low.

##### DSAL-10: Boot hydrates the full sales list and history eagerly for a badge, and hydration is not coalesced
- Severity: Medium. Status: Confirmed.
- Evidence: `TabsPage.vue:86-87` calls `restoreSales` on every app start; `sales.ts:108-110` has no in-flight guard, while `SalesOverview.mounted` calls `load()` which hydrates again when status is still `idle` (`:116`), so a deep link or a fast tab visit pays two reads, two applies and two stringify rounds. Hydrate cost per section 2 E1 (about 100 us/item). Also `closeAllOpenModals` runs on every navigation (`router/index.ts:168-169`, `utils.ts:139-151`), cheap and independent of N.
- Root cause: the badge needs a number, but it is derived from the full list.
- Fix (layers: store, persistence): persist `newCount` (or `seenIds` with `lastSnapshotIds` summary) as its own tiny key used by the badge; hydrate the list lazily on first Sales entry (route `beforeEnter` or view `ionViewWillEnter`); coalesce `$hydrate` with the same `coalesced` helper used for streams (`resource.ts:21-30`).
- Effort: S to M. Risk: low.

##### DSAL-11: Every debounced flush stringifies all entries, then parses and IndexedDB-clones the whole list for any change, and also changes `last` string copies in memory
- Severity: Medium. Status: Confirmed (`persistence.ts:112-126`); Measured stringify; write path Suspected.
- Evidence: `flush` iterates every entry and runs `serialized` (stringify) for each even when only `sales_query` changed (E12), then for changed entries `JSON.parse(json)` and `storageService.set` (`StorageService.set` `:30-33`) which does one IndexedDB `put` of `{data, keepOnClear, timestamp}` (structured clone of N items). `last` holds the previous JSON of each entry, about 2 MB per MB of state (about 2.6 MB resident at N=5000/P=1; strings are one-byte for ASCII). Mid-stream the 250 ms debounce expires whenever frames are more than 250 ms apart (cold server cache), so history is rewritten several times per cold stream.
- Keys and sizes (Confirmed names): `sales_data` (array of Sale, about 430 B/item), `sales_price_history` (array `{id, points[]}`), `sales_query` (about 100 B). All under the Ionic storage database (IndexedDB via localforage), envelope `{data, keepOnClear:true, timestamp}`. Written: after any mutation of the store, 250 ms trailing, plus once per completed stream (always, because of `scrapedAt`), plus per `markSeen`. Read: only in `$hydrate` (E1/E2), never on navigation.
- Root cause: change detection by serialisation; one record holds the entire collection.
- Fix (layers: persistence, StorageService): per-entry dirty flags driven by DSAL-1 revisions; write only dirty entries; store items as per-item or per-chunk records (`sales_item:<id>` / pages of 100) so a flag flip or a price update rewrites one record; drop `last` string retention.
- Effort: M. Risk: medium. Dependencies: DSAL-1, DSAL-4, DSAL-5.

##### DSAL-12: A hidden Sales page keeps recomputing and rendering the full list on every store change, and every item is a deep reactive proxy
- Severity: Medium. Status: Confirmed mechanism (Ionic keeps pages mounted, hidden by `display:none`), magnitude Suspected. Extends FE-6.
- Evidence: `SalesOverview.vue:130-164` computeds and `ItemsOverview.vue:321-331` watcher run regardless of visibility; a stream or flag change while the user is on another tab or a detail page fully re-renders a page nobody sees. `visibleSales`/`filteredSales` copy through the reactive proxy (`[...this.visibleSales]` creates N proxy reads), and `filteredItems` is data (deep reactive) so each recompute wraps N new objects. Memory: Dep/Link objects for every property for the persist watcher, computeds and render effects (Suspected 2 to 4 KB/item).
- Fix (layers: store, view, composable): immutable list as `shallowRef`/`markRaw` (DSAL-1 step 2); derive filtered/sorted lists in the store with caching on a revision key rather than in components; gate view re-derivation behind an `isActive` flag set in `ionViewWillEnter`/`ionViewDidLeave` so hidden pages mark themselves dirty and recompute once on entry.
- Effort: M. Risk: low to medium.

##### DSAL-13: Pull to refresh on a detail page re-streams the entire catalogue; detail entry has O(N) lookups
- Severity: Medium. Status: Confirmed.
- Evidence: `SalesDetails.vue:193-195` `refresh()` calls `reload(true)` which calls `load({force:true})` (whole stream, DSAL-2 cost) to update one sale; `ionViewWillEnter` `:137-139` triggers `load({force:false})` which starts a full stream if the snapshot is stale; `sales.ts:96-99` `byId` is an O(N) `find` per computed evaluation, and the `sale` computed depends on all N `id` properties, re-evaluating on any stream commit. `PriceHistoryChart.vue:56-122` is fine at P <= 30 (builds P+3 Intl objects per computation, about 0.2 ms).
- Fix (layers: backend + store + view): `GET /sales/:id` (single item and its history) once the server persists items (DSAL-6); until then detail refresh must not force a full stream; index by id (`Map`) in the store.
- Effort: S (store index), M (endpoint). Risk: low.

##### DSAL-14: Backend per-request costs (confirm SALES-1, 2, 5, 6 and small new items)
- Severity: Medium (High for SALES-1 already tracked). Status: Confirmed.
- Evidence: scraping runs in the request path through 31 page jobs (`FetchSalesOverview.ts:92-102`), limiter 8 plain and 2 Chromium (`:61-62`); `BaseScraper.fetchPage` `:78-136` has no in-flight map, so concurrent users each scrape on a cold key (SALES-2); page 1 awaits `checkFields`/image probes before returning and caching (`:129-131`, SALES-6); `ShopifyJsonStrategy.ts:68-73` pulls 250-product feeds (SALES-5); `health.record` does a synchronous better-sqlite3 read and write per page-1 scrape on the event loop (`SourceHealthTracker.ts:36-61`); `SseManager.chunkAndSend` stringifies each item twice (`:106`, `:126`); `Sale.fromRaw` computes sha1 and `new URL` per item per request (`Sale.ts:59-70,89-103`; 4.7 ms per 500, with the double stringify); tickets are only removed on validation, expired unused tickets are never swept (`sessions.ts:70-83`), bounded only by the per-user rate limit of 60 per window. No HTTP compression on the hijacked SSE reply.
- Fix: part of DSAL-6 (scheduler persists, request is a read). Small ones: single stringify (compute size from the one pass), sweep tickets with a timer or lazy prune on `create`.
- Effort: S for the small ones, L for the scheduler. Risk: low.

##### DSAL-15: Two serial round trips and an IndexedDB token read precede the first byte of every stream
- Severity: Low to Medium. Status: Confirmed. Confirms FE-5.
- Evidence: `apiUtils.ts:292` `POST /auth/ticket` (itself `performRequest` which awaits `getHeaders` and `TokenUtils.getToken()` from IndexedDB, `:110`, and again on a 401 `:198`), then `new EventSource` (`:299`). `session.token` already holds the token in memory.
- Fix (layers: `apiUtils`, `tokenUtils`): read the token from the session store (memory), and replace ticket plus `EventSource` with a `fetch` streaming read (Authorization header) or, after DSAL-6, a plain GET.
- Effort: S for the memory token, M for the transport. Risk: low.

---

#### 4. Areas verified fine (with evidence)

- Tab entry runs no data code: `SalesOverview.ionViewWillEnter` is a no-op unless an item was opened (`SalesOverview.vue:168-172`); nothing reads IndexedDB on navigation (`session.hydrate` returns early after the first call, `session.ts:74-78`).
- Stream de-duplication: `coalesced` shares one stream between concurrent callers (`resource.ts:21-30`, `sales.ts:115`). Failed or aborted streams leave `items` untouched (`sales.ts:129-134`). Refutes nothing from the earlier "ruled out" list on correctness, but see below on coalescing of UI work.
- SSE transport mechanics: back-pressure via `drain` (`SseManager.ts:124-132`), heartbeat (`:31-35`), abort detection (`sseEndpoint.ts:58-61`), one-time tickets (`sessions.ts:76-84`). Fine (earlier ruling confirmed), apart from the small items in DSAL-14.
- `newCount`, `sellers`, `byId`, `historyOf`: O(N) with tiny constants (newCount 0.05 ms and sellers 0.12 ms at N=5000, b3), so the tab badge computation is not a cost by itself; it only re-evaluates after items mutate.
- Filter modal: mounted only while open (`useMountWhileOpen`), price inputs only touch local `draft`/`priceText` (`SalesFilterModal.vue:54-72`), `sellers` is a short list.
- Scroll handling: `showScrollTop` assignment is idempotent between thresholds (`ItemsOverview.vue:273-275`).
- Router guard: `closeAllOpenModals` plus an already-resolved auth promise; cost independent of N.
- `PriceHistoryChart` and the lazy Chart.js chunk: at most 30 points, details route only (earlier ruling confirmed), apart from FE-1 preload.
- `optimistic.ts` is not used by the Sales store (grep: only `plants.ts` imports it).
- No visibility, resume, online or timer driven refetch for Sales (grep in `frontend/src`), so no hidden background churn beyond a stream the user started.
- Earlier "Client stream coalescing and skeletons: fine": REFUTED for the compute path. Coalescing exists for concurrent calls and skeleton UI is fine, but UI work is not coalesced across frames (DSAL-2).
- Earlier "Listener and timer hygiene": the persistence plugin creates and clears one `setTimeout` per mutation (`persistence.ts:131-135`), acceptable; no leaks found in Sales.

---

#### 5. Measurement hooks (what I would like you to take)

All against the large synthetic dataset; run each at N = 100, 500, 2000, 5000 and P = 2 and 30. Use 4x CPU throttle plus a real phone profile for the final numbers.

1. Persistence watcher cost (DSAL-1). In `persistence.ts` temporarily wrap the watcher source: `watch(() => { const t=performance.now(); const s = pinia.state.value[id]; traverse...` is not possible directly, so instead set `onTrigger` counters via `store.$subscribe` options or use Chrome Performance with "Bottom-up" filtered on `traverse` / `reactiveGetter`. Report: number of watcher job runs and total self time of `traverse` during (a) cold stream, (b) warm pull to refresh, (c) `markSeen` of one item, (d) `markAllSeen` with all items new, (e) boot hydrate.
2. Stream frame accounting (DSAL-2, DSAL-6). In `apiUtils.stream` `onmessage` log `{bytes: e.data.length, t: performance.now()}`; wrap with `performance.measure` the handler plus a `queueMicrotask`/`nextTick` mark after the render flush, to get per-frame main-thread time. Also record F, payload bytes uncompressed and as received (DevTools Network), and long tasks via `PerformanceObserver({type:'longtask'})` for the whole scenario.
3. Pipeline cost per recompute (DSAL-3). `console.time` around `filteredSales` getter body, `mappedSales`, ItemsOverview `items` watcher, and the render of ItemsOverview (Vue `app.config.performance = true` in a dev build gives component render and patch marks in the Performance panel). Report each at each N for E7, E12, E9.
4. Tab re-entry (DSAL-7, E4). Trace: tab switch Plants to Sales and back, 10 repetitions each at N=100/500/2000. Report Recalculate Style, Layout, Update Layer Tree, Paint, Composite durations and the count of nodes affected; also count IntersectionObserver callbacks and `ion-img` loads. Compare with `content-visibility:auto` applied to `li` through DevTools as a diagnostic (not as the fix).
5. DOM and instance census per card. In DevTools: `document.querySelectorAll('ion-page.sales li').length`, `li.querySelectorAll('*').length` (plus shadow roots of `ion-img` and `ion-icon`), total `document.querySelectorAll('*').length` before and after mounting the list; Vue devtools component count; heap snapshot retained size of the list at N=5000 (look for `Dep`, `Link`, `Proxy`, `ReactiveEffect` counts) before and after switching items to `shallowRef`.
6. IndexedDB (DSAL-11, DSAL-5). Application panel: byte size of `sales_data`, `sales_price_history`, `sales_query` in the Ionic storage database at each N,P; instrument `StorageService.get` and `set` with `performance.now()` for those keys (duration, called from which flush); count writes per scenario; confirm one write of `sales_data` after every refresh although prices did not change (expected: yes, due to `scrapedAt`).
7. Image requests (DSAL-8). Network panel filtered to images: count at Sales mount, after one search keystroke, after clearing the search, and after tab re-entry; note the `?size=128` requests and their statuses for hotlinked shop CDNs.
8. Search keystroke (DSAL-9). Performance trace of typing 5 characters then backspacing at N=500/2000; separate `baseSearchFilter` time from Vue patch/mount time.
9. Boot (DSAL-10). Trace app cold start with and without a populated Sales store; mark the time between `TabsPage.mounted` and `restore()` resolving, the long tasks in that window, and whether the first Plants render is delayed. Test a deep link to `#/tabs/sales` for the double-hydrate (two `$hydrate` calls, expected).
10. Server (DSAL-6, DSAL-14). `perf_hooks.monitorEventLoopDelay()` histogram while 1, 5 and 20 clients stream concurrently against a warm cache; time `FetchSalesOverview.execute` end to end; response bytes with and without `--compressed`; frame count F; time to first byte with a cold cache. Also the `SourceHealthTracker.record` duration on the event loop.
11. History growth (DSAL-5). Seed 26 000 history ids (N=500 x 52 weeks) and re-take hooks 1 and 6 to confirm the projected 0.9 s per mutation.
12. Verify the browser-scheduling assumption in E8/E9: are SSE `message` events delivered as separate tasks with a render between them (expected) or batched by the browser when a burst arrives in one TCP read? Count Vue flushes per stream.

---

#### 6. Suggested order (all root-cause, no band-aids)

1. DSAL-2 (S): commit once, stop exposing `incoming` to the derived chain. Immediate, large win for refresh and cold stream.
2. DSAL-3a (S): memoised formatters and collator.
3. DSAL-1 (M) with DSAL-4 (M) and DSAL-11 (M): persistence by revision, immutable list, separate seen state, dirty-entry writes. Biggest structural removal of N^2 behaviour; applies to all 8 persisted stores.
4. DSAL-7 + DSAL-8 + DSAL-9 (M to L): windowed grid, single lazy image request, search inside the query model.
5. DSAL-10, DSAL-13, DSAL-15 (S each): lazy hydrate with a persisted badge scalar, no full stream from a detail page, token from memory.
6. DSAL-6 + DSAL-5 + DSAL-14 with SALES-1 (L): server-side persisted catalogue and history, paginated conditional reads; the client stream, ticket handshake and local history disappear.


---

## Appendix C: Plants vertical (DPLA-n)

### Deep scaling audit: Plants vertical (DPLA-n)

Read-only audit. Baseline: working tree at `f11430d`. Earlier audit: `docs/performance-audit.md` (IDs FE-n, BE-n, DB-n, IMG-n, SALES-n).
Evidence labels: **Confirmed** = traced in code (file:line) and/or reproduced by a micro-benchmark I ran in plain Node against the real library versions (scripts in the scratchpad: `bench1.mjs` to `bench6.cjs`, `scale.cjs`, `explain.cjs`). **Suspected** = structural, magnitude needs your browser measurement (section 5).
All timings below are desktop Node 24 / V8 (same engine as Chrome). Mid-range phones are typically 3x to 6x slower; I flag thresholds on the desktop number and say so when the phone number matters.

Symbols: N = plants the user can see (own + every other user's public plants), O = own plants, W = watering records per plant, I = images per plant, S = substrates visible, G = cached care guides.

#### 0. Headline

1. The persistence plugin subscribes to every persisted store with a **deep, synchronous** watcher (`persistence.ts:128-139`, pinia `$subscribe` is `deep:true`, `pinia.js:1030`). Vue re-traverses the entire reactive state on EVERY single mutation, before the 250 ms debounce even starts. Measured: 13 us per watering record, so one mutation costs 310 to 370 ms at your 197 x 120 dataset, 0.9 to 1.1 s at 200 x 500, about 10 s at 2000 x 500. The cold N+1 fill (2 mutations per response) measured **35.8 s** of main-thread time at 197 x 120 (60 plants: 3.4 s, 20 plants x 50: 123 ms). This, not the network, is the dominant cost of the Plants tab, the watering round, "Water now", calendar edits and batch submit. (DPLA-1, Critical, Confirmed by benchmark.)
2. On top of it, `overviewItems` recomputes the watering status of every loaded plant for every arriving response: measured 3.7 s (197 x 120) and 17.8 s (200 x 500) of recompute alone (DPLA-2, Critical, Confirmed by benchmark).
3. Every ticked checkbox in the watering round recomputes the watering status of all plants (DPLA-4), and submitting the round re-downloads the full history of every ticked plant and pays two full-state traversals per response (DPLA-5): about 60 s of main-thread time for 100 ticked plants at 197 x 120 by the measured constants.
4. The server is not the problem at these sizes: measured SQL at N=2000, W=500, I=3 is 4.9 ms for the list query, 0.56 ms for one watering history, 8.9 ms for all embedding vectors. The cost is payload shape (unbounded, uncompressed, all users' public plants, full watering history per plant), client derivation and client persistence.

#### 1. Input / entry-event inventory

Hop notation: DOM -> handler -> computed/watcher -> store -> persistence -> HTTP -> route -> use case -> repository -> SQL -> serializer -> merge -> fan-out. "T1" below means the persistence watcher traversal (DPLA-1), "T2" the derived recompute (DPLA-2).

| # | Event | Trace | Complexity |
|---|---|---|---|
| E1 | Open /tabs/plants, first time, cold cache | `PlantOverview.ionViewWillEnter` (PlantOverview.vue:93) -> `plants.ensureLoaded` (plants.ts:80) -> `coalesced` -> `$hydrate` (persistence.ts:74-96: IDB get, `$patch`, then `serialized()` = JSON.stringify of the hydrated data, :89) -> `fetchAll` -> `GET /plants` -> `optionalAuthenticateToken` -> `GetAllPlantsUseCase` (PlantUseCases.ts:70-86: `findAllPublic` + `findAllByUser`, concat, dedupe) -> `plantRows()` LEFT JOIN species, substrates, images ORDER BY created_at DESC, upload_date, id (SQLitePlantRepository.ts:27-73) -> `groupRows` -> `toJSON` -> Fastify stringify, no compression (no `@fastify/compress` in app.ts) -> client `response.text()` + `JSON.parse` -> `PlantMapper` (Luxon per plant and per image) -> `items = ...` -> T1 -> debounce -> stringify + parse + IDB write | server O(N*I) rows + temp sort; client 3 passes over the payload + 1 persistence pass |
| E2 | Re-enter plants tab (tab switch, back from detail) | `ionViewWillEnter` -> `ensureLoaded` returns at once when `ready && !stale` (plants.ts:81) | O(1) at entry; hidden page keeps reacting (E8) |
| E3 | Cold N+1 for watering state | immediate `plants` watcher (PlantOverview.vue:161-168) -> `ensureRecordsFor(ids)` (watering.ts:96-112, 3 workers) -> `ensureRecords` (:82) -> 3x `$hydrate` race (:86-89) -> `GET /watering/plant/:id` -> `findByPlant` (innerJoin plants, leftJoin fertilizer_types, no ORDER BY, SQLiteWateringRepository.ts:43-49) -> JSON about 167 B/record (plant_name, owner_id repeated per row; measured 20 KB for 120, 84 KB for 500) -> `WateringMapper` (2 Luxon conversions per record, WateringMapping.ts:26-27) -> `byPlantId[id] = ...` (T1) and `loadedAt[id] = ...` (T1 again) -> `overviewItems` recompute for all loaded plants (T2) -> `ItemsOverview.items` watcher: filter + locale sort + keyed diff of the whole grid | N requests; main thread sum_{i<=N} i*W*(13 us T1 x2 + 3 us T2) = quadratic, DPLA-1/2/3 |
| E4 | Typing in the search box | `SearchBar` emits every keystroke (`:debounce="0"`, SearchBar.vue:6) -> `ItemsOverview.filterItems` (:294) -> `Utils.baseSearchFilter` (for-in, lower-case of every string field, utils.ts:65-79) -> `sortItems` with `a.name.localeCompare(b.name, locale)` (:302-312) -> `filteredItems` (deep reactive data) -> v-for diff | O(N*fields) + O(N log N) locale compares + O(N) diff per keystroke |
| E5 | Segment switch private/public | `handleSegmentChange` (:215) -> `showPublic` -> `plants` getter switch -> `overviewItems` (T2 for private) -> `warmWateringRecords` for all personal ids (cheap when fresh) -> `ItemsOverview.items` watcher -> sort + destroy/create all cards | O(N) component create/destroy |
| E6 | Pull to refresh / refresh button | `handleRefresh` -> `refreshPlants` -> `ensureLoaded({force:true})` -> full `GET /plants` again (no ETag, no delta). Watering records are not refetched (24 h cache), so refresh does not refresh watering state | O(N*I) bytes per pull |
| E7 | Add plant | `PlantAddingModal` -> `addPlant` (PlantOverview.vue:245) -> `plants.addPlant` (plants.ts:135; `substrateName` ensures the full substrates list) -> `optimisticUpsert` (3 scans + push: T1) -> `POST /plants` -> `CreatePlantUseCase` (substrate usable query, tx: `SpeciesResolver.load` reads the whole species table and runs Levenshtein against every species (SpeciesResolver.ts:71-99), insert; then `findById`) -> reconcile (T1) -> optional `POST /images/plant/:id` (E22) -> `fetchOne` (T1) | server O(species * len^2); client 3 x T1 (65 ms each at N=2000) |
| E8 | Any store mutation while a list page is covered | Ionic keeps pages mounted; `overviewItems`, `ItemsOverview` watcher and `WaterRound.rows` keep recomputing (FE-6) | full T2 per mutation |
| E9 | Edit plant | `editPlant` (plants.ts:177) -> `ensureLoaded` -> `optimisticUpsert` (T1 x2) -> `PATCH /plants/:id` -> `UpdatePlantUseCase`: `findById` (all images), update tx, `findById` again (PlantUseCases.ts:127-138) | 2 x findById O(I), T1 x2 |
| E10 | Delete plant | `optimisticRemove` (`structuredClone` of the plant incl. images, optimistic.ts:8) -> `DELETE /plants/:id` -> FK cascade of W records and I images (+ embeddings) -> `images.removeAll` (file unlinks) -> `dropPlant` (T1 x2) | O(W + I) |
| E11 | Open plant detail | push -> `PlantDetails.ionViewWillEnter` (:198) -> `loadPlantData` (`getPlant`, `byId` linear find) + `ensureSubstratesLoaded`; children mount: `WateringStatus` + `WateringRecords` -> `ensureRecords`, `ensureFertilizerTypes`; `MoreInfo.mounted` -> `ensureInfo` -> `POST /auth/ticket` + EventSource -> `GET /more-info` | 1 to 3 requests + 1 SSE; re-entry forces `GET /plants/:id` (FE-12) |
| E12 | Detail render with W records | `WateringStatus.lastWateredText/intervalText` (wateringStats.ts:5-16: map + `Math.max(...)`, W `toDayKey`, Set, sort, `new Date(iso)` per distinct day), `WateringRecords.mappedRecords` (W objects), `averageFertilizerUsage` (filter), `Calendar.datesByDay` (W spread copies, Calendar.vue:240-247), `weeks` (42 cells) | O(W) per record mutation, about 5 passes; DOM is O(1) (one month) |
| E13 | Water one plant (water now) | `WateringStatus.waterNow` -> `addRecord` (watering.ts:153) -> `optimisticUpsert`: push (T1), `POST /watering/:plantId` (`INSERT ... WHERE EXISTS`, then `findById`), replace (T1) -> flush: stringify + parse + IDB clone of ALL records | 2 x T1 (620 ms at 197 x 120, 2.2 s at 200 x 500) + flush (about 75 ms at 24k records, 315 ms at 100k) |
| E14 | Edit/delete record from the calendar | `Calendar.onDateChange` -> `records.find(toDayKey === day)` (W Date objects, WateringRecords.vue:217-225) -> popover -> modal -> `editRecord` (`ensureRecords`, optimistic) -> `PATCH /watering/:id` (UPDATE with `plant_id IN (SELECT id FROM plants WHERE user_id=?)`, then `findById`) or `DELETE` | same as E13 |
| E15 | Open watering round | `WaterRound.created` -> `load` (:321) -> `await ensureRecordsFor(ALL personal ids)` with a full-screen loading block until the last response -> `rows` computed -> `RoundList` (one `ion-button` + `<img loading=lazy src=full-size>` per row) | TTI = ceil(O/3) round trips + E3 main-thread; render O(O) web components |
| E16 | Tick a checkbox | `RoundList @change` -> `toggle` (`rows.find`, O(O)) -> `overrides[plantId] = ...` -> `rows` computed re-runs `buildRoundRows` (wateringStatus for every plant + locale sort + spread) because the overlay is applied inside the same computed (WaterRound.vue `rows`, waterRound.ts:22-41) | O(O*W) per tick: 37 ms desktop at 197 x 120 (about 150 ms phone), 180 ms at 200 x 500 |
| E17 | Type in round search | `onSearch` -> `visibleRows` (filter) + `hiddenCheckedCount` (Set) | O(O), fine |
| E18 | Submit round | `save` -> `addBatch` (watering.ts:240) -> `POST /watering/batch` (chunks of 200; `createMany` one tx, owned check, awaited INSERT loop, controller returns only ids) -> `refetchPlants(ticked ids)` = forced `GET /watering/plant/:id` for each ticked plant, 3 at a time, each response 2 x T1 + T2, all before `saving=false` and before the undo toast | T ticked plants: 1 + T requests, T x W records, 2T x T1 |
| E19 | Undo round | `removeBatch` -> `POST /watering/batch/delete` -> `refetchPlants` again | same as E18 |
| E20 | Snap: pick photo + match | `SnapButton.onChange` (accepts <= 10 MB, no downscale, imageValidation.ts:2) -> `RecognitionService.match` (raw file in FormData) -> `readUpload` (`toBuffer`) -> `MatchSnapshotUseCase` (MatchSnapshot.ts:29-47): sharp decode + rotate + resize 1024 + webp; `embedder.embed(webp)`: queue, then `toTensorData` decodes the webp AGAIN, resize 256, second sharp for the 224 crop (OnnxEmbedder.ts:21-50), ONNX `session.run`; `vectorsForUser` (all vectors of the user, SQLiteEmbeddingRepository.ts:18-33); `rankPlants`; write snapshot webp to tmp | upload 3 to 10 MB; 2 decodes; per request O(I_user*384) read + copy |
| E21 | Snap: confirm | `confirm` -> `ConfirmSnapshotUseCase` (ConfirmSnapshot.ts:41-57: create watering via `CreateWateringRecordUseCase`, copyFile, `images.create`, `embeddings.save` with the saved vector, no second inference) -> client `ensureRecords(force)` (full history) + `getPlant(force)` (`GET /plants/:id`) (WaterRound.vue `onPick`) | 2 full refetches for a 1-record change, T1 x4 |
| E22 | Upload a plant photo | `ImageUploadModal` -> `uploadPlantImage` -> `POST /images/plant/:id` (raw file) -> `processUpload` (EXIF parse of the buffer, sharp resize 1024 webp nearLossless, no `.rotate()`, LocalImageStorage.ts:117-138) -> `images.create` -> `onStored` -> `embedStored` fire-and-forget (second decode + ONNX) -> `fetchOne` | upload bytes + sharp CPU; embed may be rejected, DPLA-12 |
| E23 | Open care guide | `MoreInfo.mounted` (MoreInfo.vue:102) -> `ensureInfo` -> `runStream` (moreInfo.ts:102-182): per SSE event `renderMarkdown(whole text)` + `drafts[key] = ...` + `v-html`; on done `byKey[key]` -> persist `more_info_data` | stream bounded (max_tokens 1000, about 70 events), render cost small; persistence O(G) per completed guide, DPLA-13 |
| E24 | Calendar month nav / settings | `goToMonth` -> `weeks` (42 cells, new `Intl.DateTimeFormat(dateStyle:full)` per recompute, about 65 us) | O(1) |
| E25 | Hydration on first use of a store | `$hydrate` -> IDB get -> `$patch` -> `serialized()` (stringify of everything just hydrated) | O(cached bytes), once |

#### 2. Scaling table

Measured constants (desktop V8): deep traversal 13 us per watering record (8 fields); watering status 1.0 us per record plain, about 3 us under reactive proxies (bench2: 17.8 s / (200 x 100 avg plants x 500 x 200 recomputes) = 0.9 us per record-visit incl. the rest of the computed); Luxon mapping 3.6 us per record (bench2); `new Intl.RelativeTimeFormat().format` 15.7 us vs 0.5 us cached (bench6); sort 2000 names with `localeCompare(b, locale)` 11.7 ms vs `Collator` 1.7 ms (bench1); 100k records JSON stringify 62 ms + parse 113 ms + structuredClone 140 ms, 17.3 MB (bench1). Plants store traversal at N=2000, I=3: 65 ms per mutation; I=20: 300 ms (bench5).

Flags: ! > 16 ms, !! > 50 ms, !!! > 200 ms (desktop figure; phone about x4).

| Event | N=O=20, W=50 | N=O=200, W=120 (your dataset) | N=O=200, W=500 | N=O=2000, W=500 | N=O=2000, W=5000 |
|---|---|---|---|---|---|
| E3 cold fill, persistence T1 only (measured 123 ms / 35.8 s) | 123 ms !!! | 36 s !!! | about 150 s (extrapolated, quadratic) !!! | hours !!! | not viable !!! |
| E3 cold fill, T2 recompute only (measured 14 ms / 3.7 s / 17.8 s) | 14 ms ! | 3.7 s !!! | 17.8 s !!! | about 30 min (x100) !!! | not viable !!! |
| One mutation anywhere in watering store (T1) | 13 ms ! | 310 to 370 ms !!! | 0.9 to 1.1 s !!! | 9 to 10 s !!! | about 100 s !!! |
| E13 "Water now" (2 mutations + flush) | 30 ms !! | 0.7 s !!! | 2.5 s !!! | 20 s !!! | minutes !!! |
| E16 one tick in the round (T2 + sort) | 1 ms | 37 ms !! | 180 ms !! | 1.8 s !!! | 18 s !!! |
| E18 submit with T=half of O ticked (2T x T1) | 2 x 10 x 13 ms = 0.3 s !!! | about 60 s !!! (T=100) | about 200 s !!! | not viable | not viable |
| E4 one keystroke (filter 3 ms + sort + diff, N=O) | <1 ms | 3 ms | 3 ms | 15 ms + diff, phone 60 ms !! | same |
| E12 detail page recompute per record mutation (5 passes) | <1 ms | <1 ms | 3 ms | 3 ms | 15 ms ! (phone 60 ms) |
| E11 detail open, first load of one plant's history (parse + Luxon map + T1 over that plant) | 1 ms | 1 ms | 2 + 6 ms | same | 18 + 65 ms !! |
| E1 list first render (payload parse + Luxon per plant/image + cards at 0.3 to 0.8 ms each, Suspected) | 15 ms ! | 150 ms !! | 150 ms !! | 1.5 s !!! | 1.5 s !!! |
| E15 round TTI floor (network only, ceil(O/3) waves x 60 ms) | 0.4 s | 4 s | 4 s | 40 s | 40 s + 2 GB |
| E20 snap upload bytes (raw camera JPEG, independent of N) | 3 to 10 MB | 3 to 10 MB | 3 to 10 MB | 3 to 10 MB | 3 to 10 MB |
| E20 server `vectorsForUser` (8.9 ms at 3000 vectors, bench `scale.cjs`; 9 MB read + 9 MB copy) | 0.2 ms | 0.6 ms | 0.6 ms | 8.9 ms | 8.9 ms |
| Server `GET /plants` list SQL (measured 0.47 ms / 4.9 ms) | 0.1 ms | 0.5 ms | 0.5 ms | 4.9 ms (O=1000 of 2000) | same |
| Server `GET /watering/plant/:id` (measured 0.11 / 0.56 ms; JSON 20 / 84 KB; about 840 KB at W=5000) | 0.1 ms | 0.1 ms | 0.6 ms | 0.6 ms | 6 ms |

#### 3. Findings

##### DPLA-1 Deep synchronous persistence watcher re-traverses the whole store on every single mutation [Critical, Confirmed + measured]
- Evidence: `frontend/src/stores/persistence.ts:128-139` calls `store.$subscribe(cb, { detached: true, flush: "sync" })` (:128-137). Pinia's `$subscribe` builds `watch(() => pinia.state.value[$id], cb, { deep: true, ...options })` (`node_modules/pinia/dist/pinia.js:1030, 1161-1167`). A deep watcher's getter is `traverse(state)`; with `flush: "sync"` it runs on each mutation, before the debounce and before the `suppressed` check in the callback (:130). Every persisted store pays this: plants (plants.ts:46), watering (watering.ts:50), moreInfo (moreInfo.ts:41), plus the other stores.
- Measured (`bench3.cjs`, `bench4.cjs`, `bench5.cjs`, @vue/reactivity 3.5.43): one push or field set with all records loaded: 24k records 310 to 370 ms; 100k records 0.9 to 1.1 s; 1M records 8.8 to 10.4 s. Cold N+1 fill (`byPlantId[id] = ...` plus `loadedAt[id] = ...` per response): 20 x 50 = 123 ms, 60 x 120 = 3.4 s, 197 x 120 = **35.8 s**. Plants store N=2000, I=3: 65 ms per optimistic replace or push; I=20: 300 ms. The first traversal also allocates a Proxy for every record and keeps it in a WeakMap (24k to 1M proxies), so heap grows too.
- Root cause: change detection by deep observation of an unbounded collection, per mutation, synchronously. The debounce protects only the write, not the detection.
- Fix (root cause; layers: stores/persistence plugin + store actions): stop observing state. Detect change at the action boundary: `store.$onAction(({ after }) => after(schedule))` plus an explicit `store.$persist(entryKey?)` for the few non-action writers, so detection is O(1) per action. Combine with per-entity keys (DPLA-6) so the write is also proportional to what changed. Do not use `flush: "pre"/"post"` with `deep: true` as the fix: it only coalesces within one tick, the cold fill is one response per task, so the quadratic remains.
- Expected impact: E13 from 0.7 s to near zero at your dataset; E3 loses its 36 s term; E18 loses its 60 s term; plants store mutations from 65 ms to 0 at N=2000.
- Effort M. Risk medium: any code path that mutates persisted state outside an action (grep `\.items\s*=` in views, tests such as `plantsStore.test.ts`) would stop persisting; add a test that every persisted store field is written through an action or `$persist`.
- Dependencies: none; DPLA-2 and DPLA-6 compound with it. Extends and escalates FE-10 (first audit rated Medium and described the write cost, not the per-mutation traversal).

##### DPLA-2 Derived watering status is recomputed from full histories for every arriving response (quadratic), also while the page is hidden [Critical, Confirmed + measured]
- Evidence: PlantOverview.vue:131-158 (`overviewItems` reads `this.byPlantId[plant.id]` and calls `wateringStatus(records, now)` for every personal plant), wateringStats.ts:5-16 and 54-74 (per record: `toDayKey`, Set, sort, `new Date(iso)` per distinct day; `Math.max(...records.map(...))`), watering.ts:90 (`this.byPlantId[plantId] = ...` per response, a new key the computed already depends on, so every response invalidates it), PlantOverview.vue:161-168 (immediate watcher that starts the fetch storm). Vue records one dependency per record element and field read through the reactive proxies, so the computed holds O*W*k dependency entries for as long as the (never destroyed) tab page lives.
- Measured (`bench2.cjs`): 20 x 50: 14 ms total; 197 x 120: **3.7 s** over 198 recomputes (avg 18.5 ms, last about 37 ms); 200 x 500: **17.8 s** (avg 88 ms, last about 180 ms). Extrapolation: x100 for 2000 plants. Per recompute also: N spreads, N `relativeDaysText` calls that each construct `new Intl.RelativeTimeFormat` (15.7 us, wateringStats.ts:25-26; DPLA-8), N `t()` interpolations, then in `ItemsOverview` a full filter, `localeCompare(b, locale)` sort (11.7 ms at 2000) and keyed grid diff.
- Root cause: the list needs two numbers per plant (last watering day, average rhythm) but the client downloads and re-derives from the whole history, and the derivation is not memoised per plant.
- Fix (root cause; layers: backend repository + use case + serializer, store, views): (1) `GET /plants` returns per own plant `last_watered_at` and `watering_interval_days` (and `last_fertilized_at`), computed in one grouped query over `idx_watering_history` (`MAX(date)`, `COUNT(DISTINCT local day)` and `MIN/MAX` for the mean gap) or from a `plant_watering_summary` table maintained in the same transaction as record insert/update/delete (also needed by DPLA-5). (2) `wateringStatus(summary, now)` becomes O(1). (3) The per-plant history (`byPlantId`) is then used only by the detail page and calendar, and stops being loaded for the list and for the round. (4) The "calendar day" semantics (local day keys) must be fixed in the contract: store a local-day integer at write time using the client's offset, or send `tz` with the list request.
- Expected impact: E3 from O(N^2 W) to O(N) main thread and from 1+N requests to 1; E16 tick from 37 to about 1 ms; E8 hidden-page recompute vanishes (FE-6 becomes cheap by construction).
- Effort L (backend M, store M, views S). Risk medium: timezone semantics, cache migration. Dependencies: DPLA-5 should return/patch the same summary. Confirms FE-2, BE-1, FE-6 and adds the measured quadratic and dependency-footprint analysis.

##### DPLA-3 Watering history has no read model for the screens that use it: full, unbounded, uncompressed, per plant [High, Confirmed]
- Evidence: wateringController.ts:83-87 + SQLiteWateringRepository.ts:43-49 return every record of a plant with `plant_name` and `owner_id` repeated per row (167 B/record; measured 20 KB at W=120, 84 KB at W=500, about 840 KB at W=5000), no `limit`, no date window, no ORDER BY (index order only by accident of the plan), no ETag, no compression in the app server (`app.ts`: no compress plugin; nginx gzip only in the container path, `frontend/nginx.conf:26-28`). Consumers: calendar (needs one month), status card (needs 2 numbers), fertilizer ratio (1 number), round (2 numbers). Client mapping cost per record: 3.6 us Luxon (WateringMapping.ts:26-27: two `DateTime.fromMillis` and a formatted string that no watering screen reads) + proxy creation + T1 13 us.
- Root cause: one endpoint serves four different read models.
- Fix: `GET /watering/plant/:id?from=&to=` (calendar window, month +- 1) and `GET /plants/:id` embeds the summary (DPLA-2); drop per-row `plant_name`/`owner_id`; return epoch numbers only and format in the view; add `Cache-Control: private, no-cache` + `ETag` so the 24 h client cache can revalidate cheaply; enable response compression in the app server. Detail history beyond the window loaded on demand (infinite calendar months).
- Impact: detail open at W=5000: 840 KB -> about 10 KB; no W-proportional work on open; mobile data. Effort M, risk low/medium (calendar needs month-fetch logic). Extends DB-7, BE-5.

##### DPLA-4 Every tick in the watering round recomputes watering status for all plants [High, Confirmed]
- Evidence: WaterRound.vue `rows` computed: `buildRoundRows(this.personalPlants, id => this.byPlantId[id]).map(row => ({...row, ...this.overrides[row.plantId]}))`, waterRound.ts:22-41 (status per plant + sort with `localeCompare` without a shared collator), `toggle` writes `overrides[plantId]`. The overlay is read inside the same computed as the derivation, so any override invalidates all of it. `visibleRows`, `hiddenCheckedCount` (Set of O) and `checkedCount` also re-run per tick; `RoundList` receives O new row objects and patches O rows.
- Root cause: derivation and per-tap overlay share one computed; `checked` lives on the row object.
- Fix: `baseRows` computed from plants + status source (summary after DPLA-2), sorted once; keep `checked`/fertilizer overrides in a separate reactive `Map`/`Set` and let `RoundList` read per row (props `checkedIds`, `overrides`), so a tap re-renders one row; compute `checkedCount` incrementally. Use one `Intl.Collator` for the name tie-break.
- Impact: tick latency 37 to 180 ms (desktop) -> under 1 ms. Effort S/M, risk low. Confirms WaterRound part of FE-6/FE-11.

##### DPLA-5 Round submit, undo and snap-confirm re-download full histories and pay T1 twice per response [High, Confirmed]
- Evidence: watering.ts:258 (`await this.refetchPlants(...)` inside `addBatch`), :263-266 (`removeBatch`), :279-283 (`ensureRecordsFor(..., {force:true})`, 3 at a time), WaterRound.vue `save` awaits it before `saving=false` and the toast; `onPick` (WaterRound.vue) does `ensureRecords(plantId,{force:true})` + `getPlant(plantId,true)` after confirm. Backend returns only `{ ids }` (wateringController.ts:115-119; `createMany` SQLiteWateringRepository.ts:104-135), so the client cannot patch its cache.
- Cost: T ticked plants = 1 POST + T GETs of W records each (T=100, W=120: 2 MB, 34 waves) and 2T traversals of the full state (T1) = about 60 s of main-thread time at your dataset, plus the T2 recompute per response. The "Undo" repeats it.
- Fix: batch endpoints return the created records (one `SELECT ... WHERE id IN` in the same transaction; `createMany` can also use one multi-row INSERT) and the updated per-plant summary; the client appends locally and never refetches histories on the write path. Undo removes by id locally. A forced refetch stays only behind pull-to-refresh.
- Impact: submit time becomes one POST round trip. Effort M (backend S, store S), risk low. Dependencies: DPLA-1/2.

##### DPLA-6 Persistence granularity is the whole collection; the write path copies it twice more [High, Confirmed]
- Evidence: persistence.ts:112-126 (`JSON.stringify(entry.pick(state))` every flush, string compare, then `JSON.parse(json)` and `storageService.set` = IDB structured clone), watering.ts:50-60 (`pick: byPlantId`, one IDB value for every record of every plant; `timestamp` is the max `loadedAt`, `apply` sets every plant to that timestamp), plants.ts:46-58 (all plants incl. other users' public ones with all images), moreInfo.ts:41-55 (all guides), hydrate (persistence.ts:74-96) re-serialises everything it just read.
- Measured (bench1): 100k records = 17.3 MB, stringify 62 ms + parse 113 ms + structured clone 140 ms = about 315 ms on the main thread per flush (phone about 1.3 s), every time any record changes. 24k records: about 75 ms.
- Fix: per-entity keys (`watering:<plantId>`, `plant:<id>` or paged chunks) written only for dirty entities (dirty set filled by the actions, see DPLA-1), pass the picked object directly (no `JSON.stringify` + `JSON.parse` round trip; compare by a version counter rather than a string), per-entry timestamps instead of a global max, and an eviction policy (LRU or max count) for guides. After DPLA-2 the list no longer needs `byPlantId` persisted at all.
- Impact: flush cost proportional to the change; no unbounded single IDB value. Effort M, risk medium (key migration). Extends FE-10, FE-13.

##### DPLA-7 `GET /plants` is unbounded: every public plant of every user plus all images, one array for two tabs [High at multi-user scale, Confirmed]
- Evidence: PlantUseCases.ts:70-86 (`findAllPublic()` has no owner filter or limit, plus `findAllByUser`, merged and deduped), SQLitePlantRepository.ts:27-73 (LEFT JOIN images, `ORDER BY p.created_at DESC, img.upload_date, img.id`), `EXPLAIN QUERY PLAN` on the dev copy (`explain.cjs`): user list = `SCAN p` + `USE TEMP B-TREE FOR ORDER BY`; public list = `SEARCH p USING INDEX idx_plants_list (is_public=?)` + temp b-tree; `idx_plants_list(is_public, user_id)` cannot serve `WHERE user_id=?` sorted by `created_at`, and `ANALYZE` never runs (DB-4), so SQLite does not skip-scan it. Client: `publicPlants`/`personalPlants` getters filter the one array (plants.ts:64-68), persistence stores all of it, `ItemsOverview` renders all of the active segment, the round picker and `WaterRound` use `personalPlants` of the same array.
- Measured: SQL is cheap (4.9 ms at 3000 rows) so the cost is payload (about 580 B per plant with 3 images, 7.5 MB at N=2000, I=20), `JSON.parse`, per-image Luxon (7 us), proxy memory, T1 (65 ms per mutation at N=2000), and rendering.
- Fix: `GET /plants?scope=mine|public&limit=&cursor=` (keyset on `(created_at, id)`), list payload carries only `cover_image_url` + `image_count`, `images[]` only on `GET /plants/:id` (also removes IMG-12 and the per-plant image map), server-side `q` for the public scope; indexes `idx_plants_user_created(user_id, created_at DESC)` and `idx_plants_public_created(is_public, created_at DESC)`; run `PRAGMA optimize` on open/close (DB-4). The private tab keeps a full local list (it is the user's own data) but not other users'.
- Impact: payload and client work O(page) for the community; private tab independent of community size. Effort L, risk medium (3 consumers: PlantOverview, WaterRound, PlantPickerModal use `scope=mine`). Confirms and extends BE-2, DB-1, IMG-12.

##### DPLA-8 Hot paths construct Intl/Luxon objects and sort with locale-argument comparisons per item [Medium, Confirmed + measured]
- Evidence and measurements: `relativeDaysText` builds `new Intl.RelativeTimeFormat(locale, ...)` on every call (wateringStats.ts:25-26), called per plant per `overviewItems` recompute (15.7 us vs 0.5 us cached, bench6; 31 ms per recompute at N=2000); `ItemsOverview.sortItems` and `buildRoundRows` and `PlantPickerModal.filtered` sort with `localeCompare(b, locale)` or `localeCompare(b)` (ItemsOverview.vue:302-312, waterRound.ts:41, PlantPickerModal.vue:53; 11.7 ms at N=2000 vs 1.7 ms with a shared `Intl.Collator`; the picker re-sorts on every search keystroke because the sort sits in the same computed as the filter); `WateringMapper.mapWateringRecord` and `PlantMapper`/`ImageMapper` call Luxon twice per item (`Utils.convertDateMillis` + `convertToMillis`, 3.6 us/record, 87 ms for 24k records, 18 ms for 5000) to produce a formatted `date` string that no watering view reads (`record.date` is never used outside the mapper/store; `WateringRecords` uses `date_millis` + `formatDisplayDate`); `Calendar.weeks` builds `Intl.DateTimeFormat(dateStyle:"full")` (65 us) per recompute.
- Root cause: formatters created at the call site; derived display strings produced eagerly in the mapping layer.
- Fix: module-level cached formatter/collator factories keyed by locale (one in `localizationService`), map to epoch numbers only and format at the edge (`formatDisplayDate`), sort once in a computed that does not depend on the query. Effort S, risk low.

##### DPLA-9 Care guide: auto-start on every detail visit, no abort on leave, no server-side in-flight dedup, unbounded persisted blob [Medium, Confirmed]
- Evidence: MoreInfo.vue:102-104 (`mounted -> load()`), no `stopInfo` in `beforeUnmount` (:105-108 only bumps the token), so browsing N plants keeps N SSE streams and N OpenAI calls running after the user left; per-user limits `MAX_AI_STREAMS: 20` per 15 min and `MAX_TICKETS: 60` (constants.ts:52-58) therefore get consumed by passing through plant pages. Server: `OpenAIPlantClient.streamPlantCare` (OpenAIClient.ts:58-61, 115) caches only after completion, in an in-process `NodeCache` (lost on restart), with no in-flight map, so two concurrent opens of the same plant name call OpenAI twice; 7 link searchers run per stream (PlantLinkSearchers.ts:272-316), each cached 24 h per name, also without in-flight dedup. Client store: `more_info_data` persists the whole `byKey` map (moreInfo.ts:41-55), rewritten in full per completed guide, timestamp = max of all keys so old guides never expire individually, no size cap.
- Measured/verified fine: markdown rendering per chunk is bounded (max_tokens 1000, about 70 events), so the quadratic claim in FE-7 is real in shape but small in magnitude (Low).
- Fix: load the guide on explicit tap (or when the card scrolls into view) and abort the stream on unmount; server: `Map<cacheKey, Promise>` single-flight for AI and for each searcher; persist guides per key with LRU cap and per-key timestamps (DPLA-6); cache in SQLite or Redis if restarts matter. Effort S/M, risk low. Refines FE-7 (downgrade the render cost, keep the auto-start), BE-6.

##### DPLA-10 List and round rendering are unwindowed; every card loads two full-size images [High at N >= 1000, Confirmed structure, magnitude Suspected]
- Evidence: ItemsOverview.vue:95-141 (one `li` + `ProgressiveImage` component + `ion-icon`s per item for all N, no windowing or `content-visibility`), ProgressiveImage.vue (two `new Image()` per card at mount, `?size=128` is ignored by `/uploads` so both are the full 1024 px file; IMG-1/IMG-2), RoundList.vue (per row `ion-button`, `ion-icon`, `<img src=full-size loading=lazy>`), `filteredItems` is deep-reactive `data()` (:250) so each card creates proxies and per-field dependencies. N=2000: 4000 simultaneous image requests from the list, the same origin as the API under HTTP/1.1 (6 connections), so API calls wait for connection slots (Suspected, `frontend/nginx.conf` shows no http2 listen).
- Fix: render a window (`ion-infinite-scroll` chunks of 40, or a virtual list), `shallowRef` for `items`/`filteredItems` (immutable snapshots), `<img loading="lazy" decoding="async" width height>` thumbnails from a sized variant (IMG slice), computed instead of mutated `filteredItems`, search debounce 120 ms. Effort M, risk low/medium. Confirms FE-11, IMG-2; adds the round list and the picker.

##### DPLA-11 Snap to log uploads the raw camera file, decodes it twice on the server, and loads vectors with a system-wide scan [High on mobile data, Medium on server, Confirmed]
- Evidence: SnapButton.vue:57-65, imageValidation.ts:2 (up to 10 MB, no resize), MatchSnapshot.ts:32-40 (first decode+resize), OnnxEmbedder.ts:21-50 (second decode of the webp, then a third pipeline for the crop), SQLiteEmbeddingRepository.ts:18-33. `EXPLAIN` (explain.cjs) for `vectorsForUser`: `SEARCH i USING COVERING INDEX idx_images_lookup (entity_type=?)` then `e` and `p` by primary key, i.e. it walks EVERY plant image of EVERY user and filters on `p.user_id` last; there is no index on `image_embeddings.model` or on the user. Each vector is copied again (`b.buffer.slice`, :6). Per request cost O(all plant images in the system) rows + O(I_user) copies; measured 8.9 ms at 3000 user vectors.
- Also unbounded concurrency before the embed queue: `sharp(file.buffer)` with default `limitInputPixels` (268 MP) runs for every concurrent request (the 8-slot queue only covers inference), so N parallel matches hold N x 10 MB buffers plus decode memory (a 10 MB PNG can describe 268 MP); the embed path sets 64 MP, the first pipeline does not (MatchSnapshot.ts:32, LocalImageStorage.ts:128).
- Fix: (a) client resizes before upload (`createImageBitmap(file, {resizeWidth: 768})` to canvas to JPEG/WebP quality 0.8; 40 to 100 KB instead of 3 to 10 MB; also for E22 plant photos); (b) one sharp pipeline server side: `rotate().resize(256)` then crop to the 224 tensor and produce the snapshot webp from the same decode via `clone()`; (c) per-user in-memory `Float32Array` matrix + `plantId[]`, invalidated by `embeddings.save` and image/plant deletes (or at least a query that starts from `plants WHERE user_id=?`); set `limitInputPixels` once on every sharp call; bound sharp concurrency with the same limiter as the embed queue. Effort M, risk low/medium. Confirms BE-13 and extends it.

##### DPLA-12 Embeddings of new photos are fire-and-forget through a bounded queue; startup backfill is unthrottled [Medium, Confirmed]
- Evidence: recognition/index.ts:41-45, EmbedImages.ts:14-23 (failure is only logged, image never embedded until the next restart), OnnxEmbedder.ts:12, 64-66 (`MAX_PENDING_EMBEDS = 8` rejects), recognitionRoutes.ts:22-26 (`backfill` at every start: `plantImagesMissing` scan, then one inference per missing image serially, competing with request traffic for sharp/ONNX threads).
- Impact: burst uploads silently drop matches; model change at 6000 images means 10 to 15 minutes of one core at boot.
- Fix: treat "image without embedding for the active model" as the job queue; one low-priority worker drains it (also after each upload and on a timer), `match` gets priority over backfill, expose queue length in health. Effort M, risk low.

##### DPLA-13 Re-entry and refresh policies force full refetches and let caches go stale [Low/Medium, Confirmed]
- Evidence: PlantDetails.vue:198-203 + plants.ts:120-125 (every re-entry forces `GET /plants/:id`, FE-12 confirmed; no per-plant `fetchedAt`); `ensureLoaded({force:true})` on pull-to-refresh reloads all N but not watering records (E6); watering.ts:56-58 and 82-93 (3 concurrent `$hydrate` calls race, per-plant freshness collapses to the blob's max timestamp, FE-13 confirmed); plants list `isStale` is 24 h in production (utils.ts:21-23), so public plants of other users never refresh without a manual pull.
- Fix: per-entity `fetchedAt`, `If-None-Match` revalidation (needs ETag), delta endpoint `GET /plants?updated_since=`, single `coalesced(this,"hydrate")`. Effort M, risk low.

##### DPLA-14 Write path does redundant reads and ownership via subquery [Low, Confirmed]
- Evidence: UpdatePlantUseCase 2 x `findById` with full image join (PlantUseCases.ts:127-138); `CreateWateringRecordUseCase` reads the record back by id after insert (WateringUseCases.ts:146); `watering_records` update/delete use `plant_id IN (SELECT id FROM plants WHERE user_id = ?)` (SQLiteWateringRepository.ts:89, 98; plan shows `LIST SUBQUERY` over a skip-scan of `idx_plants_list`, which materialises all owned plant ids per edit), `SpeciesResolver` reloads the species table and runs Levenshtein against all species per create/update (SpeciesResolver.ts:71-109, rebuilt per call in plantsRoutes.ts:17, BE-8 confirmed).
- Fix: `UPDATE ... RETURNING` / `INSERT ... RETURNING` with the join in one statement; ownership as `EXISTS (SELECT 1 FROM plants WHERE id = watering_records.plant_id AND user_id = ?)`; keep the species index in a process-level cache invalidated on insert. Effort S, risk low. Measured impact is sub-millisecond at N=2000; listed for scale and cleanliness.

##### DPLA-15 Remaining scaling hazards, smaller [Low]
- `TempSnapshotStore` has no per-user or total cap (TempSnapshotStore.ts:29-36, TTL 10 min, sweep 60 s): a client can park unlimited 1 MP webp files in `os.tmpdir()`.
- `PlantPickerModal.filtered` sorts all plants per keystroke and renders all rows with full-size `<img>` (PlantPickerModal.vue:51-55).
- Substrate `<ion-select>` renders all S visible substrates (including other users' public ones) as `ion-select-option` (SelectField.vue:20-25, PlantAddingModal.vue); needs search/paging at S >= 500.
- `Calendar.onDateChange` only handles the first record of a day (WateringRecords.vue:217-225, correctness at multiple waterings per day); `datesByDay` copies the bucket array per record (Calendar.vue:244, quadratic only inside one day).
- `latestWateringMillis` uses `Math.max(...array)` (wateringStats.ts:6); safe to about 100k arguments, irrelevant at W=5000 but replace with a loop.

#### 4. Areas verified fine (re-verified in this slice)

- SQL execution at scale (synthetic copy of the dev DB, `analyze` run, scale.cjs): plant list 0.47 ms (300 rows) and 4.9 ms (3000 rows); public list 1.7 ms; one watering history 0.11 and 0.56 ms; vectors 3000 rows 8.9 ms; no query is slow enough to matter before the payload and client costs.
- `idx_watering_history(plant_id, date DESC)` serves the per-plant history (`SEARCH wr USING INDEX idx_watering_history (plant_id=?)`), and ON DELETE CASCADE of plants uses it.
- Batch write endpoints are bounded (max 200 entries, schema-validated), all-or-nothing in one transaction, ownership checked with one `IN` query (SQLiteWateringRepository.ts:104-153).
- `coalesced` (resource.ts:21-30) correctly deduplicates concurrent ensure calls per key for plants; optimistic helpers snapshot only the touched item (optimistic.ts).
- Calendar renders one month (42 cells) regardless of W; `MenuCalendar` and `CalendarSettingsModal` are local-only (no network), cost O(reminders).
- Modals are mounted only while open (`useMountWhileOpen`), forms are small; `FormComponent.errors` is per field.
- ONNX inference does not block the event loop (`session.run` is async), is serialised and bounded to 8 pending; `toTensorData` loop is 150k iterations (about 1 ms); snapshot confirm reuses the stored vector (no second inference); dot-product ranking of 6000 x 384 is about 3 ms.
- Chart.js is not used on the plants list or the round; the only chart on the plant detail page is the substrate pie (`SubstrateContainer`), O(components).
- Listener hygiene in this slice: `SearchBar` observer disconnected, `Calendar` theme watcher stopped, `WaterRound` timer cleared, object URLs revoked (`UploadField`), no polling. Exception: `MoreInfo` does not stop the stream on unmount (DPLA-9).
- Auth per request is a JWT verify without a DB hit (`authenticateToken`, auth.ts:19-27), so the N+1 does not add DB load beyond the queries; there is no API rate limit that the N+1 can trip (BE-17), only the AI-stream and ticket limiters.
- Scroll handler `handleScroll` assigns a boolean (no re-render when unchanged).

#### 5. Measurement hooks (please run these; I did not run the app)

Use a seeded account with 197 plants x about 110 records (your dataset), plus a second run at about 2000 x 500 if you can generate it.

1. **Cold Plants tab with DevTools Performance (CPU 4x slowdown), clear IndexedDB first.** Expect long tasks dominated by Vue `traverse` called from the pinia `$subscribe` watcher (persistence.ts:128). Report: total scripting time, number of long tasks, time to "all status lines visible". Then repeat with `persist` disabled for the watering store (comment out its `persist` block locally) to isolate DPLA-1 from DPLA-2.
2. **Counters** (temporary `console.count`): inside `PlantOverview.overviewItems`, inside the persistence `$subscribe` callback, inside `persistence.flush`; plus `performance.measure` around `wateringStatus` summed per recompute. Expect about N recomputes and about 2N callbacks in a cold fill.
3. **Flush cost:** in `persistence.flush` log `json.length`, and time `JSON.stringify`, `JSON.parse`, and `storageService.set` (await it) separately for `watering_records_data`, `plants_all`, `more_info_data`. Also read `navigator.storage.estimate()` and the IDB value sizes in Application > IndexedDB.
4. **"Water now" tap profile** on a plant detail page with the full store loaded: expect two traversal blocks (optimistic push, reconcile) of the size from hook 1 and one flush about 250 ms later.
5. **Round tap profile:** open `/tabs/plants/water`, record one checkbox tap: expect `buildRoundRows` + `wateringStatus` for every plant. Also record "tap to toast" for submitting 100 ticked plants (watch Network: 100 forced `GET /watering/plant/:id` after the POST).
6. **Network waterfall of the cold list:** requests, bytes, `Content-Encoding` in dev (expect none) and behind nginx (expect gzip), time spent queued behind image requests (Timing tab "Stalled"), connection ids to see whether images starve API calls under HTTP/1.1.
7. **Render cost:** after the list settles at N=200 and N=2000, record `document.querySelectorAll('*').length`, Layout/Recalculate Style/Paint time for the first render and for one search keystroke, JS heap (a heap snapshot filtered for `Proxy`/`Object` counts shows the tracking footprint of DPLA-1/2).
8. **Mapper cost:** `console.time` around `WateringMapper.convertToWateringRecords` for a W=5000 response and around `PlantMapper.convertToPlants` for N=2000.
9. **Detail page at W=5000:** trace opening a plant, then adding one record; check `WateringStatus` computeds, `mappedRecords`, `Calendar.datesByDay` and the traversal block.
10. **Snap:** record bytes sent by `POST /recognition/match` from a real phone camera, and server stage timings (add temporary timers around sharp 1, `embedder.embed` queue wait, `toTensorData`, `session.run`, `vectorsForUser`, `rankPlants`), `process.memoryUsage()` before and after, and RSS with 5 parallel matches. Run `EXPLAIN QUERY PLAN` for `vectorsForUser` on the production DB after `ANALYZE`.
11. **Event loop lag:** `perf_hooks.monitorEventLoopDelay()` on the server while `GET /plants` (N=2000), a snap match and a care-guide stream run together.
12. **Care guide:** walk through 20 plant detail pages quickly and count open SSE connections, `POST /auth/ticket` calls, OpenAI calls and when the first 429 appears.
13. **Server payload:** `GET /plants` and `GET /watering/plant/:id` response sizes, with and without `Accept-Encoding: gzip`, at N=2000 and W=5000.

#### 6. Corrections and confirmations of the first audit (by ID)

| ID | Verdict |
|---|---|
| FE-2 / BE-1 | Confirmed (High). Magnitude was under-stated: with the persistence traversal and the derived recompute the cold N+1 costs main-thread time that is quadratic in N (measured 36 s + 3.7 s at 197 x 120), not just N requests. Escalate to Critical. |
| FE-10 | Confirmed but the real cost is not the write, it is the deep sync watcher run per mutation (DPLA-1). Escalate Medium to Critical. |
| FE-6 | Confirmed; quantified in DPLA-2 (hidden pages pay the full recompute per mutation). Resolved by DPLA-2 rather than by gating pages on activity. |
| FE-7 | Partly refuted: markdown re-render per chunk is bounded by `max_tokens: 1000` (about 70 events), cost is small (Low). The auto-start on mount is confirmed and has a larger effect through the AI quota and the missing abort (DPLA-9). |
| FE-11 | Confirmed; extended to `RoundList` and `PlantPickerModal` (DPLA-10). |
| FE-12 | Confirmed (Low, DPLA-13). |
| FE-13 | Confirmed (Low, DPLA-13); the freshness collapse also makes a partial refetch extend the life of stale data for every plant. |
| BE-2 / DB-1 | Confirmed with plans: user list is `SCAN p` + temp b-tree, public list is an index range + temp b-tree; `ANALYZE` never runs. Server time is small (4.9 ms at 3000 rows), so the priority is payload and contract (DPLA-7), indexes are a cheap add-on. |
| BE-8 | Confirmed (Low, DPLA-14). |
| BE-13 | Confirmed and extended: system-wide image scan for vectors, double decode, raw upload (DPLA-11, DPLA-12). |
| DB-7 | Confirmed: no ORDER BY, output order depends on the plan. |
| Section 7 "plants query itself is fine" | Partly refuted: fine in SQL time, but unbounded (all users' public plants, all images) and sorted through a temp b-tree (DPLA-7). |
| Section 7 "listener and timer hygiene fine" | True for this slice except MoreInfo's missing abort on unmount (DPLA-9). |
| Section 7 "no loops with awaited queries" | True; `createMany` awaits one INSERT per entry inside one transaction (at most 200), acceptable, can be a multi-row insert. |

#### 7. Suggested order for this slice

1. DPLA-1 (persistence detection by action, no deep watcher): removes the dominant cost everywhere, small and contained.
2. DPLA-2 + DPLA-5 + DPLA-3 together (summary in the plants contract, batch returns records, month-windowed history): removes N+1 and the quadratic derivation; backend and store change in one wave.
3. DPLA-4, DPLA-8 (cheap client wins, independent).
4. DPLA-7 + DPLA-10 (scoped paged plants list + windowed rendering), then DPLA-6 per-entity persistence.
5. DPLA-11, DPLA-12 (snap pipeline), DPLA-9 (guide), then DPLA-13 to 15.


---

## Appendix D: Substrates and Components (DSUB-n)

### Deep scaling audit: Substrates and Components (DSUB-n)

Read-only. Baseline `main` at `f11430d`. Evidence labels: **Confirmed** = traced in code (file:line) and/or measured on a synthetic in-memory SQLite database or node micro-benchmark; **Suspected** = estimate from constants, needs your measurement (see section 5).
Paths are relative to `frontend/src` (FE) or `backend/src` (BE) unless absolute.

Variables: S = substrates visible to the user (all public substrates of every user plus own, the server merges them), C = components per substrate, K = catalogue size (components in total), I = images per substrate, P = plants.

Synthetic measurements I ran (scratchpad `sqlbench.cjs`, `sql2.cjs`, `bench.js`; schema copied from `0001_baseline.ts`, better-sqlite3 12.10, node 24, desktop CPU; mobile is typically 3 to 6 times slower):

| Scenario (S total, half public) | SQL rows returned | SQL ms (sync, blocks event loop) | `groupRows` ms | JSON.stringify ms | Response size |
|---|---|---|---|---|---|
| S=10, C=4, I=1 | 20 | 0.1 | <0.1 | <0.1 | 4 KB |
| S=100, C=7, I=2 | 700 | 1.2 | 0.25 | 0.15 | 43 KB |
| S=1000, C=7, I=2 | 7,000 | 14 | 2.6 | 3.6 | 436 KB |
| S=1000, C=30, I=3 | 45,000 | 75 | 19 | 4.5 | 1,604 KB |
| S=1000, C=30, I=10 | 150,000 | 452 | 129 | 7.2 | 1,795 KB |

The table is for ONE of the two queries of the list call (public half). `GET /substrates` runs it twice (public, then own), so double the SQL and grouping for a user who owns a comparable number.

---

#### 1. Input / entry-event inventory and traces

Pages stay mounted in `ion-router-outlet`, so "re-entry" runs only `ionViewWillEnter` (cheap when the stores are fresh, see E1). The expensive events are first entry per session, invalidation (24 h in production, `utils/utils.ts:21-23`), and every mutation of a store that a mounted (possibly hidden) page subscribes to.

| # | Event | Trace (hop by hop) | Cost model |
|---|---|---|---|
| E1 | Tab switch / re-enter Substrates | `SubstrateOverview.vue:119-122` `ionViewWillEnter` -> `fetchSubstrates` + `fetchAvailableComponents` -> `ensureLoaded` (`stores/substrates.ts:69`) returns at once when `status==='ready' && !stale`; same for components (`stores/components.ts:71`) | O(1) when fresh. When stale (24 h): `coalesced` -> full `GET /substrates` and full `GET /components`, skeleton shown because `items` is replaced only after the response (no stale-while-revalidate) |
| E2 | First entry in a session | `ensureLoaded` -> `$hydrate()` (`stores/persistence.ts:74-98`): `storageService.get` (IndexedDB structured-clone read of the whole list) -> `$patch` -> `serialized()` = `JSON.stringify` of the whole list again (line 91) -> if fresh render, else `fetchAll` | O(S x (C+I)) read + O(S x (C+I)) stringify; then ItemsOverview mounts S cards (E4) |
| E3 | Cold fetch / pull to refresh / retry | `ItemsOverview.vue:281-287` `handleRefresh` -> `refreshSubstrates` -> `ensureLoaded({force})` -> `fetchAll` (`stores/substrates.ts:77-90`) -> `ApiUtils.get('/substrates')` -> `authenticateToken` -> `GetAllSubstratesUseCase` (`SubstrateUseCases.ts:84-93`) -> `findAllPublic` + `findAllByUser` (2 joins, `SQLiteSubstrateRepository.ts:21-48,60-66`) -> `groupRows` (:128-165) -> JSON (uncompressed, no ETag) -> `SubstrateMapper.convertToSubstrates` (S objects, `ImageMapper` per image, `Utils.convertDateMillis` per substrate = Luxon `DateTime` per substrate, `SubstrateMapping.ts:25`) -> `this.items = ...` replaces every object identity -> persist subscriber (E9) -> `publicSubstrates`/`privateSubstrates` getters -> `ItemsOverview` `items` watcher (sort) -> re-render of all S cards | Server O(S x C x I) rows, O(S x C x I x (C+I)) in the `.find` dedupe; client O(S x (C+I)) mapping, O(S log S) sort, O(S) cards diff; `isRefreshing` toggles twice, each a full ItemsOverview render |
| E4 | List mount / segment switch (public/private) | `OverviewHeader` `ionChange` -> `SubstrateOverview.handleSegmentChange` (:167-170) -> `showPublic` -> `substrates` computed -> new `items` prop -> `ItemsOverview.vue:321-331` watcher -> `sortItems` -> `filteredItems` -> keyed `v-for` (:96-141): unmount old cards, mount new cards | Per card: 1 `li` + button + 2 spans + `ProgressiveImage` (3 Vue instances when it shows the placeholder: ProgressiveImage, PlantPlaceholder, Art; `ion-img` after load) + about 25 SVG nodes, 2 `new Image()` loaders. O(S) mount, nothing windowed |
| E5 | Search typing in the overview | `SearchBar.vue:67-70` `ionInput` (debounce 0, line 6) -> `emit('search')` -> `ItemsOverview.filterItems` (:294-298) -> `Utils.baseSearchFilter` (`utils/utils.ts:65-80`, `for in` over a reactive proxy, `toLowerCase` of every string field incl. `imageUrl`, `created_at`) -> `sortItems` (copy + `localeCompare(b,locale)` per comparison) -> `filteredItems` -> re-render; the delta mounts or unmounts cards | Per keystroke O(S x fields) + O(S log S) + O(S) vnode diff + O(delta) mount/unmount. Backspace re-mounts the cards that were removed |
| E6 | Open add modal (Substrates) | `openAddModal` (:172-177) -> `showAddingModal=true`; `availableComponents` was already computed at parent render (:109-117) -> `SubstrateFormModal` mounts the `IonModal` (`useMountWhileOpen`) -> step 1 `FormComponent` | Step 1: O(1) fields. `availableComponents` costs O(K) map + O(K log K) sort before the modal is even opened |
| E7 | Step 1 typing (name) / visibility radio / file pick | `InputField` `v-model` -> `FormComponent` `v-model="item[...]"` -> reactive `form` in `SubstrateFormModal` -> re-render of FormComponent and of SubstrateFormModal (reads `form.name` for `delete-label`, :31). `isDirty` is not read in the template, so `formSnapshot` does not run per key | O(fields), constant. Verified fine (section 4) |
| E8 | Step 2: open component picker | `goToComponents` -> `ComponentSelection` mounts: `filteredComponents` (sort K with 2 `includes(S)` per comparison, `ComponentSelection.vue:111-126`), one `li`, one `ion-checkbox` (Stencil web component), `part-meta` per catalogue entry | O(K) mount, O(K log K x S) sort. Nothing windowed |
| E9 | Step 2: type in the component search | `SearchBar` -> `filterComponents` -> `searchQuery` -> `filteredComponents` recompute (`baseSearchFilter` over K plain objects + sort) -> re-render list | O(K x fields) + O(K log K x S) + O(K) diff + mount/unmount delta |
| E10 | Step 2: tick / untick a component | `ionChange` -> `toggleSelectedComponent` -> parent `toggleComponent` (`SubstrateFormModal.vue:240-248`, `indexOf`/`splice`) -> `selectedComponentIds` changes -> `filteredComponents` recompute (selected float to the top) -> row moves in the DOM, a `ion-input` mounts | O(K log K x S) + O(K) diff + keyed move; row jumps under the finger |
| E11 | Step 2: type a part value | `ionInput` -> `updatePart` -> `update-part` -> `setPart` (`componentParts[id]=value`) -> the child render function reads `componentParts[id]` for each selected row (`ComponentSelection.vue:32`) so the whole child re-renders; `selectionValid` recomputes (O(S) `parsePart`) | O(K) vnode creation and diff per keystroke (the filtered list is cached; the render function is not) plus O(selected) `formatNumber` (`new Intl.NumberFormat`) for numeric initial values in edit mode (`displayPart`, :128-130) |
| E12 | Save (add) | `handleSubstrateSave` (:178-240) -> `addSubstrateWithComponents` (`stores/substrates.ts:137-157`): POST /substrates (insert + read-back join) -> POST /substrates/:id/components (transaction, per-row insert, read-back join) -> optional `uploadSubstrateImage` (POST multipart, then GET /substrates/:id) | 3 to 4 sequential round trips; 3 `upsert` calls, each producing a new array -> E3-style re-sort and re-render of the list |
| E13 | Save (edit) | `SubstrateDetails.handleSubstrateUpdate` (:199-230) -> `Promise.all` [PATCH /components (upsert, never deletes), PATCH /substrates/:id] -> each answers with a full read-back join -> two `upsert` | 2 parallel requests, 2 re-renders; removal of a component is never sent (DSUB-9) |
| E14 | Delete substrate | `handleSubstrateDelete` -> `DELETE /substrates/:id` -> `repo.delete` (cascade `substrate_components`, plants SET NULL scans `plants`) -> `images.removeAll` -> store `items.filter` (new array) -> list re-render | Server: O(C) cascade + O(P) scan for `plants.substrate_id`; client O(S) |
| E15 | Image upload (substrate/component) | `UploadField` preview (`URL.createObjectURL`, full-size decode for a 48 px thumb) -> `ImageService.uploadImage` (raw file up to 10 MB, `utils/imageValidation.ts:2`) -> sharp resize to 1024 webp (async, off main thread) -> `images` insert -> `fetchOne`/`getComponent(id,true)` | Upload bytes dominate; then one more GET and one list re-render |
| E16 | Open Substrate details | `SubstrateDetails.ionViewWillEnter` -> `reload` -> `getSubstrate` (`stores/substrates.ts:114-119`): `await ensureLoaded()` of the WHOLE list first, then cache lookup; plus `ensureComponentsLoaded()` (whole catalogue) | Cold or stale: S-sized and K-sized downloads to show one substrate. Fresh: O(S) `find` |
| E17 | Details render / mutate | `availableComponents` computed (:139-148: O(K) spread + O(K log K) `localeCompare(locale)`) evaluated at every render of the page because it is a prop of the closed modal (:70); `SubstrateContainer.components` (sort C, one `Intl.NumberFormat`), `partsLabel` per row per render (3 Intl constructions per row), `PieChart` (`slices`, `summary`, deep `data` watcher -> `applyTheme` -> 7 `getComputedStyle` reads + new options -> `chart.update`) | O(K log K) + O(C) with about 3C Intl constructions (about 25 us each in node) twice (container + PieChart) |
| E18 | Component search typing in SubstrateContainer (C > 5) | `SearchBar` -> `filterComponents` -> `visibleComponents` -> re-render of the rows incl. `partsLabel` per row | O(C) with 3 Intl constructions per row per keystroke |
| E19 | Open Components overview | same as E1 to E4 with kind=component; `mapToOverviewItems` (:86-93) creates K objects per recompute, `finenessLabel` per item | O(K) map + O(K log K) sort + O(K) cards |
| E20 | Open Component details | `ComponentDetails.reload` -> `getComponent` (`await ensureLoaded()` of the whole catalogue) + `ensureSubstratesLoaded()` (whole substrate list) -> `usingSubstrates` (:137-144: O(S x C) `some` + sort S_matching) | A single component detail forces the full S-sized substrate payload; recomputed on any substrate store change |
| E21 | Edit / delete a component (admin) | `saveComponent`/`removeComponent` -> PUT/DELETE /components/:id -> server cascade on `substrate_components` -> client updates only the components store (`stores/components.ts:125-160`); the substrates store (and IndexedDB `substrates_all`) keep the embedded names and the deleted component for up to 24 h | Server cascade 0.8 to 2.4 ms at S x C = 30,000; client stale data (DSUB-8) |
| E22 | Plant forms open the substrate picker | `PlantAddingModal.vue:91`, `PlantEditingModal.vue:96`: one `ion-select-option` per visible substrate, unsorted, no search | O(S) option elements in one alert/popover |
| E23 | Pull to refresh on detail pages | `PullRefresher` -> `reload(true)` -> `getSubstrate(id,true)` -> `ensureLoaded()` (no-op when fresh) + `GET /substrates/:id` | O(C x I) rows server side for one substrate; fine |
| E24 | Hidden-page recompute | Any store write while Substrates/Components pages sit in other tabs (e.g. `PlantDetails` `loadSubstrate`, ComponentDetails) re-runs `publicSubstrates`/`privateSubstrates` and the hidden `ItemsOverview` watcher and render | O(S log S) + O(S) diff for a page nobody sees (confirms FE-6 for these pages) |
| E25 | Logout | `storageService.clear()` (`services/general/StorageService.ts:64-76`) reads the full value of every key to test `keepOnClear` | O(total persisted bytes), includes the S-sized snapshot |

---

#### 2. Scaling table (estimates, desktop / mobile with 4x CPU throttle; constants stated)

Constants used (all **Suspected**, replace with your measurements): card mount 0.2 ms desktop (about 5 component instances plus 45 DOM nodes, 2 `Image()`), card patch (vnode diff only) 0.01 ms, card unmount 0.05 ms, `ion-checkbox` row mount 0.3 ms plus `ion-input` 0.3 ms when selected, vnode diff 1 us per vnode (about 15 vnodes per row), IndexedDB structured clone 100 ns per byte, JSON.stringify 3 ns per byte, `new Intl.NumberFormat` 29 us, `new Intl.PluralRules` 22 us (measured), sort and filter numbers measured in `bench.js` (e.g. K=5000: `localeCompare` sort 7 ms without locale argument, 1.7 ms with, selected-first sort with 30 selected 12 ms, `baseSearchFilter` 0.65 ms on plain objects).

##### 2.1 Substrates list (S = substrates visible; C=7, I=2 unless stated)

| Entry event | S=10 | S=100 | S=1,000 | S=10,000 | Over 16 / 50 / 200 ms |
|---|---|---|---|---|---|
| E2/E4 first mount of cards (mount only) | 2 / 8 ms | 20 / 80 ms | 200 / 800 ms | 2 / 8 s | desktop >200 ms at S=1,000; mobile >50 ms at S=100, >200 ms at S>=250 |
| E5 one keystroke, narrowing | <2 ms | 4 / 16 ms | 20-50 / 80-200 ms (filter 1 ms, sort 0.7 ms, unmount delta, vnode diff 10 ms) | 0.3-0.5 / 1.2-2 s | mobile >50 ms at S=500, >200 ms at S=2,000 |
| E5 backspace re-mounting removed cards | <2 / 8 ms | 10 / 40 ms | 100-200 / 400-800 ms | seconds | mobile >200 ms from S about 300 |
| E3 refresh, client part (map + sort + diff + persist) | 2 ms | 8 / 30 ms | 80 / 300 ms (+ persist 20 / 80 ms) | 0.8 / 3 s | mobile >200 ms at S=1,000 |
| E3 refresh, server part (SQL + group + JSON), C=7,I=2 | 0.2 ms | 3 ms | 36 ms (2 queries x 14 ms + group 5 + JSON 4) | 360 ms | blocks the Node event loop, whole API stalls; >50 ms at S=1,000 |
| E3 server part, C=30, I=3 | 0.5 ms | 8 ms | 200 ms (2 x 75 + 2 x 19 + JSON) | 2 s | >200 ms at S=1,000 |
| E3 server part, C=30, I=10 | 1 ms | 30 ms | 1.0 s (2 x 452 + 2 x 129 + JSON) | 10 s | event loop blocked for seconds |
| E3 network payload (uncompressed) C=7,I=2 / C=30,I=3 | 4 / 6 KB | 43 / 160 KB | 436 KB / 1.6 MB (public half; own overlaps) | 4.4 / 16 MB | 4G throttled: 1.6 MB about 1.5 s |
| E1 re-entry (fresh store) | 0 | 0 | 0 | 0 | fine |
| E24 hidden recompute per store write | <1 | 2 / 8 ms | 15 / 60 ms | 150 / 600 ms | mobile >50 ms at S=1,000 |
| E14 delete substrate, server cascade + plants scan (P=3,000) | 0.4 ms | 0.4 ms | 0.4 ms (P=3 x S) | grows with P | measured 0.43 ms at P=3,000 |

##### 2.2 Component picker in the substrate form (K = catalogue size)

| Entry event | K=50 | K=500 | K=5,000 | Over 16 / 50 / 200 ms |
|---|---|---|---|---|
| E6 `availableComponents` (spread + sort) at parent render | 0.1 ms | 0.8 ms | 8-12 ms desktop, 30-50 mobile | mobile >16 ms at K=5,000 |
| E8 open step 2 (mount K rows) | 15 / 60 ms | 150 / 600 ms | 1.5 / 6 s (also 5,000 custom elements) | mobile >200 ms from K about 350 |
| E9 search keystroke | 2 / 8 ms | 15 / 60 ms | 100-150 / 400-600 ms | mobile >50 ms from K about 450 |
| E10 tick a component (re-sort 12 ms at K=5,000 + diff + row move) | 3 ms | 15 / 60 ms | 120 / 480 ms | mobile >50 ms at K=500 |
| E11 one part keystroke (full child re-render, O(K) vnodes) | 1 / 4 ms | 8 / 30 ms | 80 / 300 ms | mobile >50 ms at K about 800; >200 ms at K about 3,000 |

##### 2.3 Components overview and component details

| Entry event | K=10 | K=100 | K=1,000 | K=5,000 |
|---|---|---|---|---|
| E19 mount cards | 2 / 8 ms | 20 / 80 ms | 200 / 800 ms | 1 / 4 s, about 225,000 DOM nodes |
| E5 keystroke | <2 ms | 3 / 12 ms | 20-50 / 80-200 ms | 100-250 / 0.4-1 s |
| `GET /components` server (measured at K=5,000, 1 image each) | <0.1 ms | 0.3 ms | 1.5 ms | 5.7 ms, 750 KB JSON |
| E20 open details, `usingSubstrates` (S x C `some`) | n/a | n/a | S=1,000, C=30: 30,000 compares about 0.3 ms desktop; the cost is the S-sized download that gates it | |
| E21 delete a component used by 1,000 substrates | server 0.8 ms (skip-scan, only if `ANALYZE` was run) or 2.4 ms (plain scan, the production case, no `ANALYZE` anywhere in `backend/src`) | | | |

##### 2.4 Substrate details (C components)

| Event | C=4 | C=7 | C=30 |
|---|---|---|---|
| E17 per render (container rows + PieChart): 3C + 3C Intl constructions | 0.3 ms | 0.5 ms | 2-3 ms desktop, 10-12 ms mobile per render |
| E18 keystroke in the in-page search (rows re-render) | not shown (<=5) | 0.3 ms | 3 / 12 ms |
| PieChart `applyTheme` on every substrate store change | 7 `getComputedStyle` reads + `chart.update` | same | same + 30 arcs |

---

#### 3. Findings

##### DSUB-1 (High, Confirmed): The substrate list query is a cartesian join, run twice, and blocks the event loop

- **Evidence.** `BE modules/substrate/infrastructure/SQLiteSubstrateRepository.ts:21-48`: `substrates LEFT JOIN substrate_components LEFT JOIN components LEFT JOIN fineness_levels LEFT JOIN images` and `.orderBy('img.upload_date').orderBy('img.id')`. Components and images are independent one-to-many branches of the same substrate, so each substrate yields C x I rows (7,000 rows for 500 substrates with C=7,I=2; 45,000 for C=30,I=3; 150,000 for I=10, measured above). `EXPLAIN QUERY PLAN` shows `SCAN s`, `USE TEMP B-TREE FOR ORDER BY` over the full cartesian product (the ordering is on the image columns only, so it sorts the whole product for no consumer). `groupRows` (:128-165) then de-duplicates with `s.components.find(...)` and `s.images.find(...)` per row: O(rows x (C+I)), 19 ms at 45,000 rows and 129 ms at 150,000 (measured). `UseCases :84-93` runs `findAllPublic` and `findAllByUser` and dedupes in JS, so a user's own public substrates are queried and grouped twice. better-sqlite3 is synchronous (`core/database/db.ts:12-14`), so every millisecond above is a millisecond in which no other request is served.
- **Root cause.** One flat row shape for two independent child collections, plus an OR expressed as two queries.
- **Fix (root cause).** Repository layer only: (a) one WHERE `s.is_public = 1 OR s.user_id = ?` query for the base rows; (b) fetch components with `WHERE sc.substrate_id IN (...)` (or `json_group_array` per substrate) and images with the same pattern, grouping in JS with a `Map` keyed by id (O(rows)); (c) drop the meaningless ORDER BY on the joined table, order images inside their own query (`ORDER BY entity_id, upload_date, id`, served by `idx_images_lookup` plus a trailing sort on tiny groups). Rows become S + S x C + S x I instead of S x C x I. The use case then calls one repository method (`findVisibleTo(userId|null)`), removing `filterDuplicatesById`.
- **Layers.** `modules/substrate/domain` (port), `infrastructure` repository, `application` use case; the same restructuring applies to `SQLiteComponentRepository.componentRows` (components x images is one-to-many only, so no cartesian there).
- **Impact.** At S=1,000, C=30, I=3: SQL 2 x 75 ms + group 2 x 19 ms becomes about 2 to 5 ms total. At I=10: 1 s becomes about 10 ms. Removes event-loop stalls that today hit every endpoint during a substrate refresh.
- **Effort/risk.** S/M, low (wire contract unchanged; existing repository tests cover the shape).
- **Dependencies.** None. Combine with DSUB-2 if the list DTO changes.
- **Earlier audit.** Confirms and quantifies BE-3 (substrate cartesian join); BE-2 (unbounded lists returning all images) confirmed.

##### DSUB-2 (High, Confirmed): The list endpoint ships every public substrate of every user with all components and images, uncompressed, and the client persists all of it

- **Evidence.** `BE SubstrateData` (`domain/Substrate.ts:19-29`) carries `images[]` and `components[]` (4 fields each) on the list; `GET /` has no query, limit, cursor or conditional request (`substrateRoutes.ts:19`); no compression or ETag at the app level (`backend/src/app.ts`, no `compress`/`etag`; consistent with BE-5). Measured 436 KB (S_public=500, C=7, I=2) and 1.6 MB (C=30, I=3) per list, and the user's own page repeats public ones. FE: `stores/substrates.ts:77-90` replaces `items` wholesale, `persist` writes the whole list (:39-52). The overview only needs `id, name, userId, isPublic, createdAt, cover image`; the add/edit forms need only `id, name` (`PlantAddingModal.vue:91`).
- **Root cause.** One DTO serves list, picker, detail and "used in" lookups, so the list is as heavy as the heaviest consumer.
- **Fix (root cause).** Split the contract: `GET /substrates` returns a summary (`id, userId, name, isPublic, createdAt, coverImageUrl, componentCount`), `GET /substrates/:id` returns the detail (components, images) as it does today. The cover image comes from a single scalar subquery or a `ROW_NUMBER()` window over `images` (`idx_images_lookup`), not a join. Add `?query=&limit=&cursor=` (keyset on `id`) when S exceeds a few hundred, and `ETag`/`If-None-Match` plus compression (BE-5) so a refresh costs a 304 when nothing changed. Frontend: `Substrate` summary type in the store, detail merged on demand (`fetchOne` already exists), `byId` returns a summary until detail is loaded. "Used in" for components moves to its own endpoint (`GET /components/:id/substrates`, an indexed query on `substrate_components(component_id)`).
- **Layers.** backend repository/use case/controller/route, `docs/api-reference.md`, frontend `types/substrateTypes.d.ts`, `SubstrateMapping.ts`, `stores/substrates.ts`, `ComponentDetails.vue`, `PlantDetails.vue` (already uses `getSubstrate` for the composition).
- **Impact.** Payload 1.6 MB to about 150 KB at S=1,000/C=30; persisted snapshot shrinks the same; mapping, persist (DSUB-7) and hydrate shrink with it.
- **Effort/risk.** M/L, medium (contract change; stores must distinguish summary from detail).
- **Dependencies.** DSUB-1 (cheap to do together), DSUB-6, DSUB-7.
- **Earlier audit.** Extends BE-2; corrects the earlier "Plants query itself fine" framing for the substrate list (that note was about plants, the substrate list is not fine).

##### DSUB-3 (High, Confirmed render / Suspected magnitude): Overview cards are never windowed; search, segment switch and refresh mount and unmount all of them

- **Evidence.** `components/overview/ItemsOverview.vue:96-141`: plain `v-for` over `filteredItems`, each card built inline in the parent render (so one parent render re-creates all S card vnode trees, even for unchanged cards), plus `ProgressiveImage` (`ProgressiveImage.vue:61-117`: two `new Image()` loaders created on mount, placeholder shown first, then replaced by `ion-img`) and `PlantPlaceholder` with a 25-node SVG (`placeholder-art/*.vue`). `SearchBar.vue:6` `:debounce="0"`; `filterItems` (:294-298) runs `baseSearchFilter` + `sortItems` per keystroke; `sortItems` calls `localeCompare(b.name, locale)` per comparison (:302-313). `watch.items` (:321-331) re-sorts on every new array identity, and the store getters (`stores/substrates.ts:56-60`) return a new array on every item change (E24). Same component serves Components and Plants/Sales.
- **Root cause.** The shared list component renders the whole collection and recomputes it on any change; there is no stable per-card component, no incremental rendering, and no precomputed search index.
- **Fix (root cause).** In `ItemsOverview`: (a) extract a `OverviewCard` component with primitive props so unchanged cards skip their patch (`shouldUpdateComponent`), (b) render a window (first 24 to 48 cards, grow by an `IntersectionObserver` sentinel or an `ion-infinite-scroll`) so mount cost is O(window), (c) precompute per item a lowercased `searchText` (name + description) once per `items` change instead of scanning all string fields per keystroke (also fixes false matches on `imageUrl` and the date string, DSUB-13), (d) sort once with a cached `Intl.Collator` and keep the sorted/filtered result in a `computed` that depends on `items` and `query` only, (e) `useDeferredSearch` (a `requestIdleCallback`/`startTransition`-style ref update) so typing never waits on a render. This is a shared-component fix that also serves Plants and Sales (FE-11, SALES-10).
- **Layers.** `components/overview/ItemsOverview.vue`, new `OverviewCard.vue`, `utils/utils.ts` search helper; views unchanged.
- **Impact.** Mount at S=1,000: 200 ms (desktop) to 10 ms; keystroke O(window); backspace stops costing hundreds of ms; hidden-page recompute (E24) drops to the sort.
- **Effort/risk.** M, low to medium (visual regression risk on grid; test `Options API` rule applies).
- **Dependencies.** IMG-2 (lazy loaders) removes the per-card image cost the window would otherwise only postpone.
- **Earlier audit.** Confirms FE-11 (full render, deep reactivity, per-keystroke filter+sort) and FE-6 (hidden pages recompute) for Substrates and Components; the per-card component count (5 instances, 45 DOM nodes) is new.

##### DSUB-4 (High, Confirmed render / Suspected magnitude): The component picker in the substrate form renders the whole catalogue, rebuilds it on every part keystroke, and re-sorts on every tick

- **Evidence.** `components/substrates/ComponentSelection.vue:10-50` one `li` + `ion-checkbox` + `p` per catalogue entry, always all of them (no window, no server search). The render function reads `componentParts[component.id]` (:35) and calls `isSelected` (`includes`, :132-134), `partError`, `finenessLabel` per row, so each part keystroke (`SubstrateFormModal.vue:237-239` `setPart`) re-renders K rows (`filteredComponents` itself stays cached, the render does not). `filteredComponents` (:111-126) sorts "selected first" with two `includes` per comparison, so ticking a row (`SubstrateFormModal.vue:240-248` `toggleComponent`) re-sorts O(K log K x S) (12 ms at K=5,000, S=30, measured) and moves the row to the top under the finger. `displayPart` (:128-130) builds a `new Intl.NumberFormat` per selected numeric row per render (29 us each). The search (:146-148) runs on every keystroke with `debounce=0` and, via `baseSearchFilter`, also matches `imageUrl` and `description`.
- **Root cause.** One monolithic list render, with ordering that depends on selection state, fed by an unbounded client-side catalogue.
- **Fix (root cause).** (a) Extract `ComponentPartRow` (props: `component`, `selected`, `part`, `error`), so a part keystroke patches one row, not K; (b) stable alphabetical order, with the current selection shown in a separate compact "Selected (n)" block above the list (O(S) rows, no re-sorting, no jumping rows); (c) window the catalogue list or move to a server query (`GET /components?query=&limit=50`, indexed `components(name COLLATE NOCASE)`) once K exceeds a threshold, keeping the cached full list for offline; (d) module-level cached `Intl.NumberFormat` per locale in `utils/enumLabels.ts` (`formatNumber`, `partsLabel`), see DSUB-11; (e) precomputed `selectedSet` (`Set<number>`) instead of `includes` per row.
- **Layers.** `ComponentSelection.vue`, new row component, `SubstrateFormModal.vue` (pass a Set), `stores/components.ts` (optional remote search), backend `components` repository and route if (c) remote.
- **Impact.** K=5,000: open 1.5 s to about 30 ms (window of 50), part keystroke 80 ms to under 1 ms, tick 120 ms to under 5 ms; K=500: open 150 ms to 30 ms.
- **Effort/risk.** M, low.
- **Dependencies.** DSUB-5 (move derivation off the view).
- **Earlier audit.** New (the earlier audit did not trace the substrate form).

##### DSUB-5 (Medium, Confirmed): `availableComponents` is derived eagerly in two views for a modal that is usually closed, duplicated with different sort rules, and the whole catalogue is fetched to open any substrate page

- **Evidence.** `views/substrates/SubstrateOverview.vue:118-126` and `views/substrates/SubstrateDetails.vue:139-148`: each maps K catalogue objects (spread) and sorts them. It is passed as a prop (`SubstrateOverview.vue:41`, `SubstrateDetails.vue:70`), so the computed is evaluated on the parent render although `SubstrateFormModal` unmounts while closed (`useMountWhileOpen`, `BaseFormModal.vue`). The Overview sort has no locale argument (`localeCompare` default), the Details sort passes `localizationService.getLocale()`, so the two lists can order the same names differently. `ionViewWillEnter` (`SubstrateOverview.vue:119-122`, `SubstrateDetails.vue:157-159`) triggers `ensureComponentsLoaded()` on every entry although the catalogue is needed only by the modal (K=5,000: 750 KB JSON, 5.7 ms server SQL, persisted again).
- **Root cause.** View-level derived data that belongs to the components store; eager prop evaluation of modal-only data.
- **Fix (root cause).** Add `selectableComponents` (sorted once with a cached `Intl.Collator`, fineness label resolved) as a getter in `stores/components.ts`, shared by Add and Edit modals; `SubstrateFormModal` reads it itself (and calls `ensureLoaded` on open) so views stop passing it. Remove the catalogue fetch from `ionViewWillEnter` of both pages.
- **Layers.** `stores/components.ts`, `SubstrateFormModal.vue`, the two views, `SubstrateAddingModal`/`SubstrateEditingModal` (drop prop).
- **Impact.** Removes O(K log K) per page render and a K-sized request from the first Substrates/Details entry for users who never open the modal; unifies sort order.
- **Effort/risk.** S, low.
- **Dependencies.** None.
- **Earlier audit.** New; related to FE-12 (re-entry fetch) pattern.

##### DSUB-6 (Medium, Confirmed): Opening one substrate or one component forces download of the whole other collection

- **Evidence.** `stores/substrates.ts:114-119` `getSubstrate`: `await this.ensureLoaded()` (full S-sized list, hydrate or `fetchAll`) before looking up the id, and only then `fetchOne`. `PlantDetails.vue:269-271` and `SubstrateDetails.vue:174-186` go through it, so a cold open of a plant with a substrate pulls every public substrate of every user (DSUB-2 sizes). `stores/components.ts:98-110` `getComponent` likewise loads the whole catalogue; `ComponentDetails.vue:137-144,168-181` needs the whole substrate list to compute "used in" and awaits `ensureSubstratesLoaded()` for it.
- **Root cause.** Detail access is coupled to "list is loaded" instead of "id is cached".
- **Fix (root cause).** `getSubstrate(id)`: hydrate if idle, return the cached detail when present, else `fetchOne` only (list loading stays the overview's job); same for `getComponent`. "Used in": dedicated endpoint (DSUB-2).
- **Layers.** `stores/substrates.ts`, `stores/components.ts`, `ComponentDetails.vue`, backend components module (new read endpoint).
- **Impact.** Cold detail open goes from one S-sized (up to 1.6 MB) plus one K-sized request to one small request.
- **Effort/risk.** S for the store change; M with the endpoint. Low.
- **Dependencies.** DSUB-2 (summary vs detail distinction in the store).
- **Earlier audit.** Extends FE-12.

##### DSUB-7 (Medium, Confirmed): Whole-collection persistence runs stringify, parse and structured clone for any change, including pure status flips

- **Evidence.** `stores/persistence.ts:112-127` `flush`: `JSON.stringify(entry.pick(state))` (always), compare with `last`, then `JSON.parse(json)` and `storageService.set` (structured clone of the full object into IndexedDB, `StorageService.ts:35-38`). The subscriber (:128-140) fires on every mutation including `this.status = "loading"` / `"ready"` (`stores/substrates.ts:78,86`), so a refresh that changes nothing still stringifies the full list (3.6 to 4.5 ms desktop at 436 KB to 1.6 MB, 15 to 20 ms mobile) after the 250 ms debounce. `$hydrate` stringifies again after apply (:91). Measured sizes in the table above (S=1,000, C=30: about 1.6 MB twice in memory: `last` string + parsed copy).
- **Root cause.** Persistence is keyed on "something changed" and snapshots the whole collection through a JSON round trip; no per-entry dirty tracking.
- **Fix (root cause).** In `l2Persistence`: skip subscriber events whose mutation touches only non-picked keys (compare `mutation.events.key` against picked roots or add `PersistEntry.watch: (state) => unknown` returning a cheap version token such as `fetchedAt` + `items.length`); persist the string (`json`) instead of `JSON.parse(json)` and parse on hydrate (one copy instead of three); with the DSUB-2 summary DTO the payload also shrinks 10x. For incremental stores, write per-item keys.
- **Layers.** `stores/persistence.ts` (affects all stores), store `persist.entries`.
- **Impact.** Removes the "refresh with no changes" stringify; halves peak memory of the snapshot; about 10 to 25 ms mobile per mutation burst at S=1,000.
- **Effort/risk.** M, medium (shared infrastructure; tests exist).
- **Dependencies.** DSUB-2.
- **Earlier audit.** Confirms FE-10 and quantifies it for these stores.

##### DSUB-8 (Medium, Confirmed): Editing or deleting a component leaves the substrates store (and its IndexedDB snapshot) stale for 24 h

- **Evidence.** `stores/components.ts:140-160` `editComponent`/`deleteComponent` update only the components store; substrates embed `component_name` and `component_fineness` (`SubstrateMapping.ts:21-33`, `ComponentMapping.ts:32-39`). The server deletes the junction rows via `ON DELETE CASCADE` (`0001_baseline.ts:80-81`) but the client never learns it. `ComponentDetails.vue:201-216` navigates away after delete; `substrates_all` in IndexedDB still lists the deleted component until `isStale` (24 h, `utils/utils.ts:21-23`), and `usingSubstrates` (`ComponentDetails.vue:137-144`) of other components keeps working on stale data. Correctness plus scale: the more substrates reference a component, the more stale rows.
- **Root cause.** Denormalised embedded names in the substrate payload with no invalidation edge between the two stores.
- **Fix (root cause).** Normalise: the substrate detail carries `[{ componentId, parts }]`, names/fineness resolve through the components store getter (one source of truth; the payload also shrinks). Minimum viable alternative: `deleteComponent`/`editComponent` call `useSubstratesStore().invalidate()` (sets `fetchedAt = null`), so the next entry refetches.
- **Layers.** `stores/components.ts`, `stores/substrates.ts`, `SubstrateContainer.vue`, mapping; backend DTO optionally.
- **Impact.** Correct data after component edits at any S; avoids refetch of the full list on timer.
- **Effort/risk.** S (invalidate) / M (normalise). Low.
- **Dependencies.** DSUB-2.
- **Earlier audit.** New.

##### DSUB-9 (High correctness, Confirmed): Unticking a component in the edit modal is never sent, so removal silently fails

- **Evidence.** `views/substrates/SubstrateDetails.vue:259-290` sends `saveSubstrateComponents` with only the selected components, and `saveSubstrate({name,isPublic})` without `removedComponents`. `stores/substrates.ts:169-180` calls `PATCH /substrates/:id/components`; the backend `upsertComponents` is `INSERT OR REPLACE` only (`SQLiteSubstrateRepository.ts:101-120`), `UpsertSubstrateComponentsUseCase` (`SubstrateUseCases.ts:156-168`) never deletes. `removedComponents` exists in `UpdateSubstrateSchema` (:31) and `deleteComponents` (:122-130) but grep shows no client caller (`frontend/src` only declares the type). The response (full substrate) is upserted, so the UI shows the component again.
- **Root cause.** Client and server disagree on whether the components PATCH is "replace set" (the store doc comment says "Replaces the component mix") or "merge".
- **Fix (root cause).** Make `PATCH /substrates/:id/components` a true replace inside one transaction (`DELETE ... WHERE substrate_id=? AND component_id NOT IN (...)` + upsert), and let the edit flow use a single request (also fixes DSUB-10 for edits). Keep `removedComponents` or drop it.
- **Layers.** `SQLiteSubstrateRepository.upsertComponents`, use case, api docs, test.
- **Impact.** Data correctness; not a performance win.
- **Effort/risk.** S, low.
- **Dependencies.** None.
- **Earlier audit.** New (found while tracing the edit flow).

##### DSUB-10 (Medium, Confirmed): Create is three to four sequential round trips, edit is two parallel read-back joins, and each response re-renders the list

- **Evidence.** `stores/substrates.ts:127-146` POST substrate (insert + `findById` join, `SubstrateUseCases.ts:115-122`) then POST components (transaction + `findById` join, :144-153), then `uploadSubstrateImage` (`SubstrateOverview.vue:219-232`: upload then `fetchOne`). Each `upsert` (`stores/substrates.ts:93-97`) produces a new `items` array -> E24/E3 re-sort and re-render; three per create. On a 150 ms RTT mobile link that is 4 x 150 ms + payloads before the modal closes (the modal stays in `isLoading`).
- **Root cause.** Resource-by-resource REST composition for what the user sees as one action.
- **Fix (root cause).** Accept `components` in `POST /substrates` (one transaction, one read-back), and in `PATCH /substrates/:id` (replace semantics, DSUB-9); optionally allow an image part in the same multipart request via the existing images use case. Frontend: one store action, one `upsert`.
- **Layers.** `CreateSubstrateSchema`/use cases, `SQLiteSubstrateRepository` (transactional create with components), store action, `SubstrateOverview.handleSubstrateSave`.
- **Impact.** Create 3 to 4 RTT -> 1 (+1 for the image); 3 list re-renders -> 1.
- **Effort/risk.** M, medium (API contract; keep old endpoints for compatibility).
- **Dependencies.** DSUB-9.
- **Earlier audit.** New.

##### DSUB-11 (Medium, Confirmed): `partsLabel` and `formatNumber` construct Intl objects per call; SubstrateContainer and PieChart multiply them by C per render

- **Evidence.** `utils/enumLabels.ts:32-42`: `new Intl.NumberFormat` per `formatNumber` call, `partsLabel` = `new Intl.PluralRules` + `formatNumber` (measured 22 and 29 us each in node, 5x on mobile). `SubstrateContainer.vue:43` calls `partsLabel(item.parts)` per row in the template (re-run on every render, incl. each keystroke of the in-page search, :18-23), `PieChart.vue:62-73` calls it per slice in `slices` and builds the `summary` string even when `showLegend` is false. `chartData` (`SubstrateContainer.vue:114-119`) is a new array whenever `components` recomputes, which triggers the deep watcher (`PieChart.vue:88-94`) and `applyTheme` (7 `getComputedStyle` reads, new `chartOptions`, `chart.update`). At C=30: about 90 Intl constructions per render in the container plus 60 in the chart = 3 to 4 ms desktop, 12 to 16 ms mobile per render.
- **Root cause.** No formatter reuse; per-row work in render functions.
- **Fix (root cause).** Module-level `Map<locale, Intl.NumberFormat | PluralRules>` caches inside `enumLabels.ts` (invalidated by locale); compute `partsText` once in the `components` computed and hand `slices` precomputed to the chart; guard `applyTheme` so it only runs when the numeric data or the theme actually changed.
- **Layers.** `utils/enumLabels.ts`, `SubstrateContainer.vue`, `PieChart.vue`.
- **Impact.** Detail render and search keystroke at C=30: about 12 ms to under 1 ms mobile.
- **Effort/risk.** S, low.
- **Dependencies.** None.
- **Earlier audit.** New (FE-1 only covered Chart.js loading).

##### DSUB-12 (Medium, Confirmed structure / Suspected magnitude): Plant forms list every visible substrate in an unsorted `ion-select` without search

- **Evidence.** `components/plants/PlantAddingModal.vue:86-95` and `PlantEditingModal.vue:91-100` build one option per substrate (public of everyone + own); `SelectField.vue:17-23` renders one `IonSelectOption` each with no filter; the server order is the order of the image-sorted join, i.e. by first image date (`SQLiteSubstrateRepository.ts:48`), so the list is not alphabetical. At S=1,000 this is an `ion-alert`/popover with 1,000 radio rows.
- **Root cause.** Pick-one-of-N modelled as a native select.
- **Fix (root cause).** Reuse the searchable picker pattern (`components/water/PlantPickerModal.vue`) as a `substrate-picker` field type backed by the (windowed) summary list and the store's server search; sort by name.
- **Layers.** `formcomponent/fields` (new field type), the two plant modals.
- **Impact.** Opens in O(window); usable at S>200.
- **Effort/risk.** M, low.
- **Dependencies.** DSUB-2 (summary list), DSUB-3 (windowing helper).
- **Earlier audit.** New.

##### DSUB-13 (Low, Confirmed): The shared search matches every string field and runs per keystroke without an index

- **Evidence.** `utils/utils.ts:65-80` iterates `for (const key in item)` and lowercases each string, including `imageUrl` and `created_at` (`SubstrateMapping.ts:25,27`). Typing "upl", "webp", "2026" or "/" matches every item with an image or a date. Cost measured 0.65 ms at K=5,000 plain objects, about 3 to 5x through reactive proxies.
- **Fix.** Per-item `searchText` projection built once per `items` change (see DSUB-3c).
- **Effort/risk.** S, low. **Earlier audit.** New.

##### DSUB-14 (Low/Medium, Confirmed): Missing indexes and no `ANALYZE`/`PRAGMA optimize`

- **Evidence.** Migrations (`0001` to `0005`) create only `idx_plants_list`, `idx_images_lookup`, `idx_watering_history` (`0001_baseline.ts:101-103`). `substrate_components` is `WITHOUT ROWID` with PK `(substrate_id, component_id)` (:75-82), so a lookup by `component_id` is a full scan: `EXPLAIN QUERY PLAN DELETE FROM components WHERE id=?` shows `SCAN substrate_components` without stats (2.4 ms at S x C = 30,000, measured) and a skip-scan (0.8 ms) only after `ANALYZE`; no `ANALYZE` or `PRAGMA optimize` anywhere in `backend/src`. `plants.substrate_id` (FK `ON DELETE SET NULL`, `0001_baseline.ts:52`) has no index, so deleting a substrate scans `plants` (0.43 ms at P=3,000; grows linearly with P). `substrates` has no index on `user_id` or `is_public` (`EXPLAIN` shows `SCAN substrates`), and `substrates.user_id` has no `ON DELETE` rule (:35-41, so user deletion fails when substrates exist, confirming DB-3).
- **Fix.** Migration `0006`: `CREATE INDEX idx_substrate_components_component ON substrate_components(component_id)`, `idx_plants_substrate ON plants(substrate_id)`, `idx_substrates_owner ON substrates(user_id)`, `idx_substrates_public ON substrates(is_public)` (or partial `WHERE is_public=1`); run `PRAGMA optimize` on close and periodically. Decide the `user_id` delete rule (cascade) as part of DB-3.
- **Impact.** Constant-time component deletes and "used in" lookups; negligible at today's data, linear degradation avoided.
- **Effort/risk.** S, low. **Earlier audit.** Confirms DB-1/DB-2 for these tables and DB-3.

##### DSUB-15 (Low, Confirmed): Component list returns image arrays the client discards

- **Evidence.** `SQLiteComponentRepository.ts:11-26,95-103` returns `images[]` per component; `ComponentMapping.ts:15-22` keeps only `imageUrl`. At K=5,000 this is part of the 750 KB payload; `ORDER BY c.name` (:30) is binary collation and unindexed while the client sorts again (`ItemsOverview.sortItems`).
- **Fix.** List DTO without `images`, detail with them; optionally `components(name COLLATE NOCASE)` index when paging.
- **Effort/risk.** S, low. **Earlier audit.** Extends BE-2.

##### DSUB-16 (Low, Confirmed): Dead accordion components

- **Evidence.** `components/accordion/Accordion.vue` and `AccordionList.vue` are referenced only by `tests/motionCss.test.ts`; no view imports them (grep). No runtime cost; keep in mind when counting bundle weight and test surface.
- **Fix.** Remove or leave; S, no risk. **Earlier audit.** New.

##### DSUB-17 (Low, Confirmed): Linear `find`/`findIndex` store lookups and fragile ordering

- **Evidence.** `stores/substrates.ts:61-65,93-97`, `stores/components.ts:63-67,91-97`: `byId` and `upsert` are O(S). They run inside computed props (`SubstrateDetails.substrate`, `ComponentDetails.component`) that re-evaluate on any item write: about 0.1 ms at S=10,000. Not a bottleneck; a `Map` index is only warranted if S grows to 10k+ with the summary DTO.
- **Fix.** Optional id index getter. S, low.

##### DSUB-18 (Low, Confirmed): Raw 10 MB uploads and full-size local preview

- **Evidence.** `UploadField.vue:100-107` previews through `URL.createObjectURL` into a 48 px `img` (full decode of up to 10 MB / 12 MP, transient memory spike on mobile); `ImageService.uploadImage` sends the raw file (`services/ImageService.ts:7-17`, limit `utils/imageValidation.ts:2`); server downsizes to 1024 webp (`LocalImageStorage.ts:127-131`). Belongs to IMG; listed because it is the only upload entry in this slice. Fix: client-side downscale to 1600 px before preview/upload (canvas/`createImageBitmap`), IMG-7 for the server side. S/M, low.

---

#### 4. Areas verified fine (re-verified, not taken from the earlier audit)

- **FormComponent keystroke path** (`FormComponent.vue`, `fields/InputField.vue`, `BaseFormModal.vue`, `SubstrateFormModal.vue`): per key O(fields). `isDirty`/`formSnapshot` (`utils/formState.ts`) are read only in `requestClose`/`canDismissModal`, not in templates, so they do not run per keystroke. `errors` computed is O(fields). `fieldErrors` deep watch is on a tiny object. The `v-if="mounted"` plus `useMountWhileOpen` keeps closed modals out of the DOM (`useMountWhileOpen.ts:13-41`).
- **Tab re-entry** when stores are fresh: `ensureLoaded` returns immediately (`stores/substrates.ts:62`, `stores/components.ts:77`), `coalesced` dedupes concurrent callers (`stores/resource.ts`), no timers/polling.
- **Substrate-by-id read** (`findById`): a single indexed substrate's C x I rows (e.g. 7 x 2 = 14 rows), fine.
- **Deleting a component used by many substrates**: the DB cascade is O(rows of the junction table) = 0.8 to 2.4 ms at 30,000 junction rows, no per-row application loop, the image cleanup is `Promise.all` over that component's own files (`ImageCleanupService.ts:22-30`). Fine; the problem is the stale client (DSUB-8) and, for the user, the lack of "used in N substrates" in the confirmation.
- **Image access policy** (`ImageAccessPolicy.ts`, `SQLiteImageEntityLookup.ts`): one primary-key lookup per request.
- **Transactions** for component add/upsert use a single better-sqlite3 transaction with prepared inserts; C=30 loops are microseconds (`SQLiteSubstrateRepository.ts:78-120`).
- **Upload processing**: sharp runs on the libuv pool, not the event loop (`LocalImageStorage.ts:127-131`).
- **PieChart / SearchBar observers**: both disconnect in `beforeUnmount` (`PieChart.vue:99-102`, `SearchBar.vue:46-49`).
- **`SubstrateFormModal.created -> resetDraft`** is O(C) and runs once per modal instance; `substrate.id` watcher is guarded.
- **Pull to refresh on detail pages** refetches one entity, not a list.
- **`ComponentEditingModal.created -> ensureFinenessLevels`**: once per session (`stores/components.ts:113-126`).

---

#### 5. Measurement hooks (what I would like you to take)

M1. **Overview mount cost per card.** Seed S = 10, 100, 1,000, 5,000 substrates (C=7, I=2; half without photo) and K = 100, 1,000, 5,000 components. In Chrome Performance (4x CPU, Fast 4G): record "first entry to Substrates tab" and "Components tab"; report scripting + rendering + painting ms, DOM node count (`document.getElementsByTagName('*').length`), JS heap, number of `Image` loaders (`performance.getEntriesByType('resource')` count of `?size=128` + full).
M2. **Search keystroke profile.** Same data. Record typing "p", "pe", "per", then backspace x3 in the Substrates overview search; per keystroke: `filterItems` duration (`console.time` around `ItemsOverview.vue:204-208`), Vue patch time (Performance "Vue" tracks or `app.config.performance = true`), mounted/unmounted card counts (instrument `ProgressiveImage` `created`/`beforeUnmount`).
M3. **Component picker.** In the add modal go to step 2 with K = 50, 500, 5,000: time `goToComponents` -> first paint (Performance), DOM node count, then per part keystroke and per tick: time of `ComponentSelection` render (`onRenderTriggered`/`onRenderTracked` or `console.time` around the template via a temporary `updated` hook), and the long-task list. Also check whether `ion-checkbox` hydration is the dominant cost (Performance "Evaluate script" within `defineCustomElement`).
M4. **Server list call.** For the two data sets in section 1 (S=1,000 with C=7,I=2 and C=30,I=3 and C=30,I=10): time `GET /api/v2/substrates` as grower (own + public) with the production build; capture server timing around `findAllPublic`, `findAllByUser`, `groupRows` (temporary `performance.now()`), response size raw and gzip, and the event-loop lag during the call (`perf_hooks.monitorEventLoopDelay`, run a parallel `GET /api/v2/health` loop at 20 ms and chart its latency).
M5. **Persist cost.** In DevTools, wrap `storageService.set` and `JSON.stringify` in `persistence.ts` flush with `performance.measure`: log duration and byte length for the `substrates_all` key after (a) fetchAll, (b) pull to refresh with unchanged data, (c) one upsert. Also the `$hydrate` duration (IndexedDB read + `$patch` + stringify) on cold start with S=1,000.
M6. **Cold detail open.** Clear IndexedDB, deep-link to `/tabs/plants/details/<id>/0` of a plant with a substrate, and to `/tabs/components/details/<id>/1`: record the request waterfall (counts and sizes for `/substrates`, `/components`, `/substrates/:id`).
M7. **Intl costs on the detail page.** Substrate with C=30: Performance recording of `SubstrateDetails` render + PieChart; count `Intl.NumberFormat`/`PluralRules` constructions (temporary counters around `new Intl.*` in `enumLabels.ts` and the two components) per render and per in-page search keystroke.
M8. **Create/edit latency.** Throttle to Fast 4G with 150 ms RTT; time "Save" to modal closed for create with 7 components and a photo (expect 4 sequential requests) and for edit changing components; also verify DSUB-9 by unticking a component in edit and reloading.
M9. **Component delete with many referrers.** S=1,000 substrates, C=30, delete one component used by about 600 of them; measure server `DELETE /components/:id` wall time (with and without `ANALYZE`), then open Substrate details of an affected substrate to confirm the stale component (DSUB-8) before and after refresh; run `EXPLAIN QUERY PLAN DELETE FROM components WHERE id=?` against a copy of the dev DB.
M10. **Plant form substrate select.** With S=1,000 open "Add plant": time from tap to the select alert rendering and DOM node count (DSUB-12).
M11. **Hidden-page recompute.** With the Substrates tab mounted and S=1,000, open a plant detail (triggers `fetchOne` upsert) and record whether the hidden `ItemsOverview` watcher and render run (Vue devtools "Performance" or `console.count` in `watch.items`); repeat for Components after editing a component.


---

## Appendix F: State, persistence, API client (STA-n)

### Deep audit, slice STATE (prefix STA): frontend data layer

Scope: `frontend/src/stores/*`, `services/general/StorageService.ts`, `utils/apiUtils.ts`, `requestFeedback.ts`, `network.ts`, `tokenUtils.ts`, `mapping/*`, session restore and refresh, Pinia plugins, logout/login switching, Profile flows.
Read-only. Static trace plus synthetic micro-benchmarks run in plain Node 24 against the project's own `vue@3.5.43` reactivity (scripts in the scratchpad: `bench-sta.cjs`, `bench-plants.cjs`, `bench-mem.cjs`, `bench-luxon.cjs`). Benchmark numbers are DESKTOP V8 numbers; budget 3x to 5x for a mid-range phone. Everything marked "measured (synthetic)" came from those scripts, everything marked "estimate" is arithmetic on those constants.

#### 0. Headline

One mechanism dominates the whole data layer and explains "slow every time, and it will get worse with more content":

**`persistence.ts:128-138` subscribes every persisted store with `$subscribe(cb, { detached: true, flush: "sync" })`. Pinia implements `$subscribe` as `watch(() => state, ..., { deep: true, flush: "sync" })` (`pinia.js` `$subscribe`, `$subscribeOptions = { deep: true }`). A deep watcher re-runs `traverse()` over the ENTIRE store state on every single mutation (`@vue/reactivity` `watch` job: `effect.run()` -> `getter = () => traverse(baseGetter())`), before our callback (and its `suppressed` guard) is even consulted.** So one mutation costs O(size of the whole store), not O(1). Measured (synthetic): sales store N=1000 -> 23 ms per mutation, N=10000 -> 450 ms; plants N=1000 -> 32 ms, N=10000 -> 443 ms; watering 5000 records -> 56 ms, 50000 -> 590 ms. A plain mutation without the watcher is 0.003 ms.

Every loop that mutates per item (sales stream, markAllSeen, watering N+1, optimistic upserts, hydrate `$patch`) therefore becomes O(N^2) or O(P^2*M). Synthetic stream of N sales with one `addPricePoint` mutation per sale (exactly `sales.ts:149,192-198`): N=100 129 ms, N=500 3.4 s, N=1000 9.5 s of pure main-thread work (desktop, store mutations only, no rendering).

Second mechanism: the flush path (`persistence.ts:112-126`) stringifies through reactive proxies (8x to 15x slower than raw), for EVERY entry of the store on EVERY flush even when only an unrelated field changed, then `JSON.parse`s the string again, then IndexedDB structured-clones it a third time into ONE shared object store, so every token read of every API request can queue behind a multi-megabyte write.

#### 1. Input / entry-event inventory (data-layer trace)

Notation: N sales/plants/substrates/components, P plants whose watering records are loaded, M records per plant, R = P*M total records, K images per item, H = priceHistory entries (grows without bound), T_s(N) = cost of ONE deep-sync-watcher traversal of the store (STA-1). "Mut" = store mutations that each trigger T_s.

| # | Entry event | Trace (DOM -> handler -> store -> persistence -> HTTP) | Complexity |
|---|---|---|---|
| E1 | App cold start / reload | `main.ts:56-85` `applyInitialTheme` (1 IDB read) -> `connectSessionToTransport` -> mount; router `beforeEach` (`router/index.ts:168-198`) -> `closeAllOpenModals` -> `session.ensureAuthenticated` -> `hydrate` (1 IDB read of token, `session.ts:74-78`); if no token -> `refresh(1)` (POST). `App.vue:46-47` hydrates layout + snapSettings (2 IDB reads, 2 `$patch`). `TabsPage.mounted` (`TabsPage.vue:86-94`) -> `sales.restore()` -> `$hydrate` (`persistence.ts:74-96`): 3 IDB reads in parallel (sales_data, sales_price_history, sales_query), structured-clone deserialisation of each, then per entry `$patch(apply)` + `serialized()` for `last` | O(N+H) IDB read + deserialise; 5 x T_s(N+H) (3 mutations for items entry, 1 for history, 1 for query); 3 x proxy JSON.stringify of the entries |
| E2 | Route enter Plants tab (`PlantOverview.ionViewWillEnter` `:93`) | `ensureLoaded` (`plants.ts:80-86`): fresh -> no-op; idle -> `$hydrate` (1 read, 3 Mut + proxy stringify) -> else `fetchAll` (`:88-99`): `status=loading`, `items=`, `fetchedAt=`, `status=ready` = 4 Mut. Then `plants` watcher (`:162-167`, immediate) -> `warmWateringRecords(all ids)` -> `ensureRecordsFor` (3 workers) | list refresh: 4 x T_s(N*(11+4K)); mapping O(N*(1+K)) Luxon calls (STA-12) |
| E3 | Plants warm-up of watering records (N+1) | per plant `ensureRecords` (`watering.ts:82-93`): not fresh -> `coalesced` per plant id -> if `Object.keys(byPlantId).length===0` -> `$hydrate()` (3 workers do it concurrently, FE-13) -> `fetchRecords` (GET) -> `byPlantId[id]=` (Mut) and `loadedAt[id]=` (Mut). `PlantOverview.overviewItems` (`:131-160`) depends on the whole `byPlantId`, so it recomputes and re-renders the grid after each completion | per plant: 2 x T_s(R_so_far); total sum_p 2*T_s(p*M) ~ O(P^2*M); plus P x O(P) recompute of overviewItems |
| E4 | Pull to refresh Plants | `refreshPlants` -> `ensureLoaded({force})` -> `fetchAll` (4 Mut) -> list identity changes -> `plants` watcher -> `warmWateringRecords` again (cheap if fresh) | 4 x T_s(plants) + 1 flush (stringify proxy + parse + clone of plants blob) |
| E5 | Open plant details | `PlantDetails.ionViewWillEnter` (`:198`) -> `getPlant(id, force=hasEntered)` -> `fetchOne` -> `items[index]=plant` (1 Mut); `WateringStatus.mounted` (`:75-82`) and `WateringRecords` (`:113`) -> `ensureRecords(id)` (hit if fresh) | 1 x T_s(plants) per re-entry (FE-12) + O(N) `byId` find (`plants.ts:69-73`, not memoised) |
| E6 | Water one plant (tap "water now") | `WateringStatus.waterNow` (`:116-120`) -> `watering.addRecord` -> `optimisticUpsert` (`optimistic.ts:21-51`): `list().find`, `structuredClone` snapshot (only when existing), push (1 Mut), POST, `reconcile` replace (1 Mut). `$subscribe` timer reset on each; flush 250 ms after last Mut: `serialized` for BOTH entries (records blob and fertilizer types), compare, `JSON.parse`, `storageService.set` (whole `byPlantId`) | 2 x T_s(R) + 1 flush of whole records blob; 2 flushes if the POST takes more than 250 ms |
| E7 | Undo watering / edit / delete record | `optimisticRemove` (1 Mut) or `optimisticUpsert` (2 Mut) + flush | same as E6 |
| E8 | Watering round open (`WaterRound.load` `:321-331`) | `ensureLoaded()` + `ensureFertilizerTypes()` + `ensureRecordsFor(all personal plant ids)` (E3 when not fresh) | as E3 |
| E9 | Watering round submit (batch) | `addBatch` (`watering.ts:240-260`): POST in chunks of 200, then `refetchPlants` (`:279-283`) -> `ensureRecordsFor(ids, force)`: per plant GET + 2 Mut | 2K x T_s(R) for K plants in the round; one flush at the end if responses are less than 250 ms apart |
| E10 | Snap to log (`WaterRound.onPick` `:424-`) | confirm POST -> `ensureRecords(id, force)` (2 Mut) + `getPlant(id,true)` (1 Mut) | 2 x T_s(R) + 1 x T_s(plants) + 2 flushes |
| E11 | Route enter Sales tab, first time in session | `SalesOverview.mounted` (`:165-167`) -> `load({force:false})` (`sales.ts:113-119`): ready+fresh -> return; idle -> `coalesced` -> `$hydrate` (a second hydrate when `restore` is still running, SALES-11) -> fresh? done : `runStream` | fresh: 0 extra; stale (24 h prod, 6 h dev, `utils.ts:19-22`): stream (E12) |
| E12 | Sales stream (stale cache, pull to refresh, first install) | `ApiUtils.stream` (`apiUtils.ts:284-356`): POST `/auth/ticket` (token read IDB + request) -> EventSource. Per SSE frame: `JSON.parse`, `SaleMapper.convertToSales`, `{...sale,isNew}`, `incoming.push(...fresh)` (1 Mut), then per sale `addPricePoint` (`sales.ts:149,192-198`) = 1 Mut each. `visibleSales`/`filteredSales` recompute per frame (SALES-4). At `done`: `items=`, `fetchedAt=`, `status=`, `incoming=[]`, `streaming=false` = 5 Mut, then flush | (N + frames + 5) x T_s(growing); quadratic: measured 129 ms at 100, 3.4 s at 500, 9.5 s at 1000 sales (desktop) |
| E13 | Sales sort / filter change | `setQuery` (`sales.ts:173-175`) = 1 Mut; flush after 250 ms stringifies `items`, `priceHistory` and `query` (unchanged ones are compared after being serialised) | T_s(N+H) + proxy stringify of everything, only `query` is actually written |
| E14 | Return from sale details | `SalesOverview.ionViewWillEnter` (`:169-173`) -> `markSeen(id)` (1 Mut if it was new) -> flush rewrites the whole `sales_data` list for one boolean | T_s(N+H) + stringify items+history + parse + structured clone of whole list |
| E15 | "Mark all seen" | `markAllSeen` (`sales.ts:186-189`): one Mut per new item, no batching | N_new x T_s(N+H): measured 185 ms at N=100 (all new), 41 s at N=1000 (dev build, all new) |
| E16 | Open sale details | `SalesDetails.ionViewWillEnter` (`:130-132`) -> `load({force:false})` no-op when fresh; getters `byId` O(N) scan | O(N) |
| E17 | Care guide stream (`moreInfo`) | per `ai_chunk` SSE event: `raw.ai += value`, `renderMarkdown(whole text)` (FE-7), `drafts[key]=` (1 Mut) | per chunk T_s(moreInfo) (small unless many cached guides) + O(len) markdown; completion: `byKey[key]`, `fetchedAtByKey[key]`, `streaming`, `drafts` = 4 Mut + flush of whole `byKey` |
| E18 | Substrate / component lists | `ensureLoaded` same shape as plants (3-4 Mut, flush whole list); details re-enter `fetchOne` -> `upsert` (1 Mut) | 4 x T_s(N*(8+4*components)) |
| E19 | Admin health (`TabsPage.mounted` for admins, `AdminDashboard`, `ScraperHealth`) | `adminHealth.load` -> GET `/sales/health`, `sources=` (not persisted, small) | O(S), S = sources (about 20); repeated per mount (FE-16) |
| E20 | Every API call (`ApiUtils.get/post/...`) | `performRequest` (`apiUtils.ts:172-205`) -> `getHeaders` -> `TokenUtils.getToken` -> `storageService.get` -> `await ready` -> localforage `getItem` (IDB readonly txn on the single `_ionickv` store) -> `fetch` (no timeout, no abort) -> `handleResponse` `text()` + `JSON.parse` -> mapping | 1 IDB txn per request, queued behind any pending readwrite txn (STA-6) |
| E21 | Access token expiry (every 15 min, `backend/src/core/config/env.ts:74`) | first request gets 401 -> `TokenUtils.getToken()` again (`:198`) -> `handleNoAuth` -> `session.refresh` (single flight `session.ts:141-146`) -> POST `/auth/refresh-token` -> `storeToken` (IDB write) -> retry | +2 round trips and 1 wasted request per concurrent in-flight request (STA-10) |
| E22 | App resume / visibility / online / offline | only `networkState` flag + `OfflineBanner` (`network.ts`). No refetch on resume, no queue for failed mutations | O(1), nothing revalidates (see STA-10) |
| E23 | Login / guest login | `session.login` -> POST -> `storeToken` (state + IDB write) -> router replace; stores untouched (they were reset by the reload at last logout) | O(1) |
| E24 | Logout / session death | `localLogout` (`session.ts:126-134`): `resetAllStores` (each store `$reset` = `assign` of every state key = many Mut, each T_s on a shrinking state) -> `clearToken` -> `storageService.clear()` (reads EVERY stored value to check `keepOnClear`, `StorageService.ts:64-76`) -> `clearRuntimeCaches` -> `router.replace` + `window.location.reload()` (`main.ts:63-67`) | O(total stored bytes) deserialised in parallel; `window.location.reload` re-pays E1 |
| E25 | Profile open | `Profile.vue`: session getters only (`username`, `role`, `isAdmin` from cached `identity` computed, `session.ts:53`) | O(1) |
| E26 | Profile edit submit | `editProfile` (`Profile.vue:152`) -> `session.editProfile` PATCH `/auth/me` -> modal closes; user is "signed out soon": no immediate local session teardown, next 401 -> refresh fails -> `localLogout` (E24) | O(1) + E21 + E24 later |
| E27 | Profile delete | `deleteProfile` -> DELETE `/auth/me` -> `storageService.clearAll()` -> `localLogout` (E24) | O(1) + E24 (clear on an already emptied DB) |
| E28 | Dark mode / calendar / layout / snap setting | `darkMode.ts:18-21` direct IDB set; calendar/layout/snapSettings through persistence (`calendar.ts:50-69`) | O(1) per write; 5 separate IDB keys for calendar |
| E29 | Account A -> logout -> account B | reload clears memory; persisted non-`keepOnClear` keys removed by `clear()`; `keepOnClear` keys survive (sales, price history, calendar, layout, query) | see STA-11 for the in-flight race |

#### 2. Scaling table

Constants (measured, synthetic, desktop Node 24, vue 3.5.43 production mode): deep-sync traversal about 1.3 us per reactive property read (sales item has 10 props, plant with K=3 images about 27 reads, watering record 8 reads). Proxy `JSON.stringify` about 8x to 15x raw `JSON.stringify`. Sizes: sale 0.4 KB, plant with 3 images 0.55 KB, watering record 0.17 KB, price history 1 entry about 0.4 KB (2 points).

Per-mutation cost T_s (ms, measured; N=10 is extrapolated):

| State | N=10 | N=100 | N=1000 | N=10000 |
|---|---|---|---|---|
| sales store (items N + priceHistory N entries) | 0.2 | 2.2 | 23 | 452 |
| plants store (K=3 images) | 0.4 | 3.5 | 32 | 443 |
| watering store, R = records loaded (R = N here) | 0.1 (R=10) | 0.6 (R=100) | 5.6 (R=1000) | 56 (R=5000) / 590 (R=50k) / 2290 (R=200k) / 5490 (R=500k) |
| write-path single flush: proxy stringify + parse + structured clone, sales items only | 0.1 | 1.0 | 8.0 | 100 |
| same, plants | 0.1 | 1.3 | 14 | 141 |
| same, watering R=5000 / 50k / 200k | 30 (R=5000: 24+1.9+4.4) / 340 (R=50k) / 1600 (R=200k) | | | |

Estimated main-thread time per entry event (desktop ms; multiply by 3 to 5 for phone). "Over 16/50/200" marks the first N where it passes the threshold on desktop.

| Event | N=10 | N=100 | N=1000 | N=10000 | Crosses 16 ms | 50 ms | 200 ms |
|---|---|---|---|---|---|---|---|
| E1 sales hydrate at TabsPage mount (5 x T_s + 3 proxy stringify + IDB deserialise) | 2 | 20 | 190 | 2800 | N=100 | N=300 | N=1000 |
| E2 plants hydrate or refresh (4 x T_s + mapping + flush) | 3 | 30 | 270 | 3500 | N=70 | N=200 | N=1500 |
| E3 plant list N+1, P plants x M=50 (sum 2 x T_s(p*M)); P=10 / 100 / 1000 | 10 | 5500 | 550000 (not finishing) | n/a | P=20 | P=35 | P=60 |
| E6 water one plant, state R records (2 x T_s(R) + flush) | 1 | 3 | 25 | 250 (R=5000 about 140 + 30) | R=2000 | R=4000 | R=7000 |
| E9 watering round of K plants, R=5000 loaded: 2K x T_s | K=10: 1100 | K=100: 11000 | | | K=1 | K=1 | K=2 |
| E12 sales stream commit, per-sale Mut | 1 | 129 | 9500 | about 950000 (extrapolated N^2) | N=15 | N=40 | N=100 |
| E13 sales sort/filter change (T_s + stringify items+history) | 1 | 4 | 35 | 620 | N=400 | N=1500 | N=5000 |
| E14 markSeen after details (same as E13 + parse+clone+IDB write 4 MB at 10k) | 1 | 4 | 40 | 650 | N=400 | N=1500 | N=5000 |
| E15 markAllSeen, all new | 2 | 185 | 23000 | n/a | N=10 | N=30 | N=70 |
| E17 care guide chunk (T_s(moreInfo) small, FE-7 dominates) | <1 | <1 | 1 (50 cached guides) | | | | |
| E20 every request: IDB token read | 0.5 to 2 each; blocked for the duration of any pending readwrite txn on the single object store (a flush of the 8 MB watering blob can hold it for 100s of ms) | | | | | | |
| E24 logout `clear()`: IDB read+deserialise of all stored bytes (sales 0.4 MB/1000, plants 0.5, watering 0.17 KB x R) | 5 | 15 | 60 | 600 | N=3000 | N=8000 | N=15000 |

Phone factor: E1 at N=1000 is about 600 ms of blocked main thread on a phone right after login, before the Sales tab is even opened (TabsPage restores it for every user).

#### 3. Findings

##### STA-1 Deep synchronous Pinia `$subscribe` re-traverses the whole store on every mutation (Critical, Confirmed + measured synthetic)
- Evidence: `frontend/src/stores/persistence.ts:128-138` (`store.$subscribe(..., { detached: true, flush: "sync" })`, the `suppressed` check at `:130` runs inside the callback, after the traversal already happened). Pinia 4.0.3 `dist/pinia.js:1030` `$subscribeOptions = { deep: true }` and `:1155-1167` (`watch(() => pinia.state.value[$id], cb, assign({}, $subscribeOptions, options))`). Vue `@vue/reactivity@3.5.43` `reactivity.esm-bundler.js:1895-1898` (`getter = () => traverse(baseGetter(), depth)`) and `:1916-1922` (job always calls `effect.run()` first). Gating by `isSyncListening` (`pinia.js:1162`) only skips the callback, not the traverse; so `$patch`, `$reset`, hydrate and `suppressed` writes pay it too.
- Mutation sites that multiply it: `sales.ts:149` + `:195` (one per sale), `sales.ts:187` (one per item), `watering.ts:90-91` (2 per plant), `optimistic.ts:31-32,38-39,44-47`, `plants.ts:93-97` (4 per fetch), hydrate `apply` bodies (3 per entry for sales/plants/substrates/components), `$reset` (`session.ts:127`, `pinia.ts:18-20`).
- Root cause: change detection for persistence is done by watching the data tree instead of by signalling that an action changed a persisted slice. A deep watcher is O(size of state) per trigger and Pinia cannot batch it for sync flush.
- Fix (root cause): replace the deep subscription with action-boundary signalling. In `persistence.ts` use `store.$onAction(({ after, onError }) => after(() => schedule()))` (plus `$patch` callers go through actions already) and let each `PersistEntry` declare `dirtyOn: ["fetchAll", "markSeen", ...]` or default to "any action finished". The debounce stays. Persisted state that is replaced wholesale (lists) additionally becomes shallow (STA-4/STA-13) so neither Vue nor Pinia ever tracks per-field. Layers: `stores/persistence.ts` (plugin), `PersistEntry` type, store tests; no store action changes needed for the default behaviour.
- Impact: removes T_s from every mutation: markAllSeen 23 s -> under 1 ms at N=1000, stream commit 9.5 s -> about 5 ms at N=1000 (measured without watcher: 4 ms), hydrate 190 ms -> about 15 ms, watering round and N+1 become linear. Also removes about 13x memory overhead of the per-property deps (measured 28.6 MB extra for 10000 sales vs 2.1 MB raw).
- Effort M. Risk Medium: a mutation outside an action (tests, `$patch` from components) would no longer persist; guard with a lint/test that views never assign store state, and keep an explicit `store.$persistNow()` escape hatch. Dependencies: none; STA-2 and STA-4 build on it.

##### STA-2 Flush path serialises everything through reactive proxies, three times, on every change (High, Confirmed + measured)
- Evidence: `persistence.ts:66-67` (`JSON.stringify(entry.pick(state))` on the reactive proxy), `:112-126` (loops ALL entries on every flush, stringifies each before the equality check at `:118`, then `JSON.parse(json)` at `:121`, then `storageService.set` which structured-clones again, `StorageService.ts:35-38`; localforage `store.put(value, key)` at `localforage/src/drivers/indexeddb.js:661`). `last` Map (`persistence.ts:68-72,119`) keeps the full JSON string of every entry resident for the whole session. Hydrate repeats a proxy stringify per entry (`:89`).
- Examples: sales `sort` change stringifies `items` and `priceHistory` (and `Object.entries(...).map` allocation, `sales.ts:61`) although only `sales_query` changed; `markSeen` rewrites the whole list; every watering record rewrites `watering_records_data` (all plants).
- Measured (synthetic): proxy stringify vs raw: sales 10000 items 77 ms vs 7.9 ms, watering 50000 records 269 ms vs 20 ms; price history entry list 96 ms at 10000; parse 7 ms; structured clone 16 ms.
- Root cause: dirty detection by string comparison, one blob per store, plus a JSON round trip used only to strip Vue proxies.
- Fix (root cause): (1) dirty tracking per entry from STA-1 (no stringify, no `last` strings). (2) Snapshot with `structuredClone(toRaw(value))` or hand IDB the raw array (Vue stores raw targets inside reactive containers, so `toRaw` of the root is proxy free; `optimistic.ts:5-12` already relies on this); list state stored as shallow/raw (STA-13) makes this trivially safe. (3) Split large collections into keyed records: watering `watering:<plantId>` and sales per page or per shop, extend `PersistEntry` with `keys(state)` / `pickKey` so a flush writes only dirty keys through `storageService.setMultiple` (already exists, `StorageService.ts:89-92`). (4) Never write unchanged entries.
- Layers: persistence plugin, `StorageService`, `watering.ts` and `sales.ts` persist definitions. Impact: E6/E13/E14 flush from 30 to 340 ms down to under 5 ms; memory drops by the `last` strings (about 4 MB at 10000 sales, 8 MB at 50000 records, doubled for two-byte strings). Effort M. Risk Medium: storage layout migration (read old key once, write new keys, delete old). Dependencies: STA-1, STA-6.

##### STA-3 Watering warm-up is quadratic and loads every plant's full history for a list screen (High, Confirmed code path, magnitude measured synthetic)
- Evidence: `PlantOverview.vue:162-167` (immediate watcher on `plants` -> `ensureRecordsFor` for all ids), `watering.ts:96-112` (3 workers), `:82-93` (two mutations per plant: `byPlantId[plantId]=` `:90`, `loadedAt[plantId]=` `:91`), `:86-89` (hydrate per worker, FE-13), `PlantOverview.vue:131-160` (`overviewItems` reads the whole `byPlantId`, so every completion rebuilds P rows and re-diffs the grid), `WaterRound.vue:326` (same loop for the round). This is FE-2/BE-1 seen from the store: even if the HTTP side is fixed the store design (full records per plant in one deep reactive object) keeps each completion O(R).
- Model: total cost = sum over p of 2*T_s(p*M) about 11 us * M * P^2 (desktop). P=100, M=50: 5.5 s blocked; P=1000: not finishing. Plus P recomputes of `overviewItems` (about 3 us per row, estimate: P=1000 gives 3 s) plus P grid patches (suspected, measure).
- Root cause: a list screen needs one derived scalar per plant (days since last watering) but the store materialises and persists the complete record history for every plant, one request and two deep-reactive mutations at a time.
- Fix (root cause): backend list returns `lastWateredAt` / `lastFertilizedAt` per plant (BE-1); `Plant` model carries them; `watering` store only holds full records for plants whose details/calendar/round editor is open (`byPlantId` stays small, or becomes a bounded LRU); `PlantOverview` reads the scalar from the plant. Watering round uses the same field plus one `GET /watering/recent?ids=` if needed. After a record mutation, patch the plant's scalar locally (one mutation) instead of refetching. Layers: backend query/DTO, `types`, `PlantMapping`, `plants` store, `watering` store, views. Impact: removes P requests, the O(P^2*M) loop, the 8 MB blob; plant list entry cost becomes O(N). Effort L (cross-layer, coordinated with BE-1). Risk Medium. Dependencies: BE-1; makes STA-1 less critical for watering but does not replace it.

##### STA-4 Sales store commits per item instead of per snapshot (High, Confirmed)
- Evidence: `sales.ts:148-149` (`incoming.push(...fresh)` then `fresh.forEach(addPricePoint)`), `:192-198` (one `priceHistory[id]=` write per sale, each an STA-1 trigger and each allocating a fresh array), `:186-189` (`markAllSeen` one write per item), `:158-163` (5 separate writes at `done`), `:81-85,87-89` (`visibleSales` builds a `Set` of all items and `filteredSales` copies+filters+sorts per frame, SALES-4 confirmed). `items`, `incoming`, `priceHistory` are deeply reactive (`:32-36`) though items are immutable except `isNew`.
- Root cause: item-level reactive mutation used for data that is replaced as a snapshot; NEW state kept as a boolean on each item instead of one "seen ids" set.
- Fix (root cause): items live in shallow state (`shallowRef` or `markRaw` list replaced wholesale); `isNew` derived as `!seenIds.has(id)` (persist `seenIds` only, a few KB); `markAllSeen` = replace `seenIds` once; price points computed in ONE pass at `done` (`const history = nextHistory(prev, items)`, assign once); streaming keeps its frame buffer outside Pinia state and publishes at most once per animation frame. Prune history (STA-8). Layers: `stores/sales.ts`, `Sale` type, `SalesOverview` (isNew source), `salesQuery.ts` (filter by `seenIds`). Impact: E12/E15 from seconds to milliseconds even without STA-1; no persisted list rewrite for markSeen. Effort M. Risk Low-Medium (NEW semantics must stay identical; there is a test file for it). Dependencies: supersedes SALES-8; complements SALES-1 (server-side first_seen_at later replaces `seenIds`).

##### STA-5 Cold-start hydrate of the whole sales cache runs on the critical path for every user (High, Confirmed)
- Evidence: `TabsPage.vue:86-94` calls `restoreSales()` on every mount (every logged-in user, even if they never open Sales) for the tab badge (`newCount`, `sales.ts:95`); `$hydrate` (`persistence.ts:74-96`) is not memoised (SALES-11): `restore` (`sales.ts:108-110`) and `load` (`:116`) can both run it; per entry `$patch(apply)` triggers STA-1 3+1+1 times and a proxy stringify (`:89`). Also `watering.ensureRecords` x3 workers (`watering.ts:86-89`), `plants.ensureLoaded` and `substrates.ensureLoaded` each hydrate their own blob serially when first used.
- Measured (synthetic): see E1 row: about 190 ms at N=1000, about 2.8 s at N=10000 on desktop (almost entirely STA-1 + proxy stringify, not IDB).
- Root cause: eager deserialise + deep-reactive wrap of a multi-hundred-KB list to compute one integer; hydrate is not idempotent.
- Fix (root cause): persist a tiny `sales_summary` entry (`newCount`, `fetchedAt`) separately so the badge needs no list; hydrate the list lazily on first Sales route entry; make `$hydrate` memoise its in-flight promise per store inside the plugin (fixes SALES-11, FE-13 at once); schedule non-visible hydrates after first paint (`requestIdleCallback`). Layers: persistence plugin, sales store, TabsPage. Effort S-M. Risk Low. Dependencies: STA-1/STA-4 reduce the unit cost, this removes the call from the boot path.

##### STA-6 Token read from IndexedDB per request, on a store that also carries multi-MB writes (Medium, Confirmed; contention Suspected)
- Evidence: `apiUtils.ts:109-122` (`getHeaders` awaits `TokenUtils.getToken()` for every request), `:198` (again on every 401), `tokenUtils.ts:7-9` -> `StorageService.ts:46-49`. Every key shares ONE database and ONE object store (`@ionic/storage/esm/index.js:10` `storeName: '_ionickv'`). IndexedDB serialises a readonly transaction behind any earlier overlapping readwrite transaction, so a flush of the watering/sales/plants blob (STA-2) delays the token read of the next request until the write commits. Confirms FE-5 and adds the contention mechanism.
- Root cause: transport depends on the persistence layer for hot-path state; all data classes share one store.
- Fix (root cause): keep the access token in memory in the session module (set by `hydrate`, `storeToken`, `localLogout`), expose `getToken()` on `AuthBridge`, and have `StorageService` open two localforage instances (small `kv` store for token, theme, flags; `cache` store for data blobs) so small reads never queue behind large writes. Layers: `apiUtils`, `session`, `StorageService`, `tokenUtils`. Effort S-M. Risk Low. Dependencies: none.

##### STA-7 Logout deserialises the entire storage to find what to keep (Medium, Confirmed)
- Evidence: `StorageService.ts:64-76` (`keys()` then `get(key)` for every key in parallel, only to test `val.keepOnClear`), called from `session.ts:129`; `getSizeInBytes` (`:112-125`) stringifies every value again (only used by `Debug.vue`).
- Root cause: retention policy lives inside each value envelope, so it can only be discovered by reading the value.
- Fix (root cause): retention by location: `keepOnClear` entries go to the `kv` store (STA-6), account data to the `cache` store; logout is `cache.clear()`, a single IDB `clear`. `PersistEntry.keepOnClear` selects the instance. Layers: `StorageService`, `persistence.ts`. Impact: logout and account deletion O(1) JS work instead of O(stored bytes) with all blobs resident in memory simultaneously. Effort S. Risk Low (migration: old keys read once).

##### STA-8 Unbounded growth of persisted and in-memory state (Medium, Confirmed in code; magnitude Suspected)
- Evidence: `sales.ts:192-198` adds a `priceHistory` entry for every sale id ever seen (cap of 30 points per sale, no cap on ids, no removal when a sale disappears); persisted with `keepOnClear` and `allowExpired` (`:56-65`) so it survives logout and expiry forever; flushed whole and traversed whole (STA-1/2). `moreInfo.ts:35-36,171-172` keeps every guide ever opened (HTML), one shared `timestamp` for the blob (`:46`) and expires the blob as a unit; `watering.ts:55-58` and `moreInfo.ts:46-51` give every key the SAME max timestamp on hydrate, so expiry bookkeeping is coarse and a stale plant looks fresh. `Math.max(0, ...Object.values(state.loadedAt))` (`watering.ts:55`) spreads P arguments on every flush; throws RangeError beyond about 120k keys.
- Root cause: caches without eviction policy keyed by unbounded domains.
- Fix (root cause): history pruned against the latest list at stream commit (keep ids in the current list plus a time-to-live of N days), `moreInfo` as a bounded LRU with per-key timestamps, per-key `loadedAt` persisted with the keyed records (STA-2), replace the spread by a reduce or a maintained max. Effort S-M. Risk Low.

##### STA-9 No request timeout or abort; a hung request pins the coalesced promise forever (Medium, Confirmed)
- Evidence: `apiUtils.ts:179-185` fetch without `signal` unless the caller passes one (no caller does; grep for `AbortController` in `src` finds none outside tests), `resource.ts:21-29` stores the promise in `inflight` until it settles, so every later `ensureLoaded`/`load` call for that owner/key returns the same never-settling promise; `isLoadingList` (`PlantOverview.vue:105`) then spins until reload. SSE `stream` has no idle timeout (`apiUtils.ts:299-348`). Retries exist only for the refresh call (`session.ts:148-190`, up to 3 attempts with 1 s delay, all concurrent requests wait on it).
- Root cause: transport has no deadline concept, state layer trusts promises to settle.
- Fix (root cause): `AbortSignal.timeout(ms)` combined with caller signal in `performRequest`, per-request timeout config by kind (GET 20 s, upload 120 s), SSE idle timer that closes and reports an error, and a store-level `AbortController` swapped on logout (STA-11). Layers: `apiUtils` only plus session. Effort S. Risk Low.

##### STA-10 No proactive token refresh: every 15 minutes the first requests pay two extra round trips (Medium, Confirmed)
- Evidence: access token lifetime 15 min (`backend/src/core/config/env.ts:74`), no timer or resume hook (grep: no `visibilitychange`, no interval in `src`), `session.ts:53` decodes the token but ignores `exp`, `router/index.ts:173-181` treats any token as authenticated. A stale token yields 401 on each concurrent request (3 in the watering N+1, plus the SSE ticket POST for Sales), each then waits for `refresh` (`apiUtils.ts:192-202`, `session.ts:141-146` single flight is correct) and is replayed. App resume after background (mobile) hits this every time.
- Root cause: refresh is reactive-only; expiry known but not used.
- Fix (root cause): read `exp` in `decodeToken`; `AuthBridge.ensureFresh()` called in `getHeaders` (synchronous check against in-memory token, STA-6) that triggers the existing single-flight refresh when less than 60 s remain; also on `visibilitychange` and `online`. Layers: `session`, `apiUtils`. Effort S. Risk Low (keep the 401 path as safety net). Impact: removes 1 wasted request per in-flight call and 2 RTT latency spike after every idle period (the "slow when I come back" pattern).

##### STA-11 Logout leaves in-flight work that can repopulate and persist the previous account's data (Medium, Suspected)
- Evidence: `session.ts:126-134` resets stores and clears storage but cancels nothing; `persistence.ts:98-110` only suppresses writes during the reset call itself; any request or SSE stream that resolves afterwards (E3 N+1, `sales.runStream` which is never stopped on reset, `plants.fetchAll`) mutates the reset store, which schedules a flush (`persistence.ts:128-137`) after `clear()` has run, writing e.g. `watering_records_data` / `plants_all` for the old user. `redirectToLogin` reloads the page only afterwards, and the 250 ms debounce may or may not have fired. Keys are not scoped by user id (`plants.ts:49`, `watering.ts:53`), and hydrate (`persistence.ts:74-96`) never verifies ownership, so a leak is picked up by the next account on that device.
- Root cause: no session epoch; async work holds store references past the session.
- Fix (root cause): a session epoch token incremented in `localLogout`; `coalesced` and every action capture it and drop results of an older epoch; global `AbortController` for HTTP and `EventSource.close()` registered by `stream`; key prefix with user id for account data (also makes STA-7 trivial). Layers: `session`, `resource.ts`, `apiUtils`, `persistence`. Effort M. Risk Medium. Needs a measurement first (hook M9).

##### STA-12 Mapping formats display dates eagerly per item and per image, persists the strings (Low-Medium, Confirmed + measured)
- Evidence: `PlantMapping.ts:36`, `SubstrateMapping.ts:25`, `ImageMapping.ts:9-10` (2 Luxon conversions per image), `WateringMapping.ts:26-27` (2 per record). Measured: `convertDateMillis` 2.2 us, `fromISO`+`toMillis` 3.3 us, `fromMillis` 0.3 us per call. Estimate: 10000 plants with 3 images about 100 ms on desktop; 50000 records about 125 ms; per refresh and again at every hydrate-apply of nothing (strings are persisted, so the formatted `date` is frozen in the locale/format of the day it was fetched).
- Root cause: presentation formatting executed in the DTO mapper; both formatted text and epoch kept, doubling payload and persisted bytes.
- Fix (root cause): models keep epoch millis only; one cached `Intl.DateTimeFormat` per locale in a `formatDate` util used by views (or a lazy getter on first read). Layers: mapping, types, views that read `.date`/`.created_at`. Effort M (type ripple, grep `.date` consumers). Risk Low. Impact: smaller persisted blobs (about 20% of a record), no per-item Luxon work, locale switch correct.

##### STA-13 Reactive depth and derived-list policy: everything deep, derived lists recomputed whole (Medium, Confirmed)
- Evidence: all collection state is deep reactive (`plants.ts:42`, `substrates.ts:35`, `components.ts:31`, `sales.ts:32-36`, `watering.ts:43`); getters copy: `plants.ts:64-67` (two filters), `substrates.ts:56-59`, `sales.ts:81-94`, `byId` closures do an O(N) `find` per call (`plants.ts:69-73`, `substrates.ts:61-64`, `components.ts:63-66`, `sales.ts:96-99`) and register N dependencies each inside computeds. Measured: reactive+watcher memory is 13x raw (28.6 MB extra for 10000 sales; plants with images estimated about 3x more). `byId` find 1.5 ms at 10000 plants (desktop).
- Root cause: server snapshots modelled as mutable reactive documents.
- Fix (root cause): collections as shallow state replaced wholesale (a `shallowRefList` helper in `resource.ts`), plus an `idIndex` getter (`Map<id, item>` computed once per list identity) used by `byId`; optimistic updates become replace-with-new-array (copy-on-write is O(N) per action but N pointer copies, microseconds) instead of in-place proxy mutation, which also removes the need for `structuredClone` snapshots in `optimistic.ts:5-12`. Layers: stores, `optimistic.ts`. Effort M. Risk Medium (views that rely on in-place proxy identity, tests). Dependencies: pairs with STA-1/2/4.

##### STA-14 Store-level loads repeated and unbounded fetch of lists (Low, Confirmed, mostly refutes/extends earlier items)
- `adminHealth.load` (`adminHealth.ts:60-67`) has no TTL or coalescing (FE-16 confirmed); `store()` re-sorts and re-assigns the list per recheck (`:148-153`) which is tiny (S about 20).
- `plants.fetchAll/substrates.fetchAll/components` all fetch every item with no cursor or `If-None-Match` (BE-2, BE-5 confirmed from the client side): each stale entry re-downloads and re-maps everything and rewrites the whole blob even when nothing changed (flush compares strings, so the write is skipped only after paying stringify). Fix lives with BE-5 (ETag/304) plus STA-2 (skip write when server returned 304). Effort S once ETag exists.

##### STA-15 Profile flows (Low, Confirmed fine, one note)
- `Profile.vue` and `ProfileEditingModal.vue` are O(1): no list work, `identity` decode cached in a getter (`session.ts:53`), modal mounts on open. Note: after `editProfile` the UI states "you will be signed out again soon" (`Profile.vue:172`) and relies on the next 401 to tear down the session: that costs one failed request plus a failed refresh retry sequence (`session.ts:148-190` retries non-401 failures up to 3 times with 1 s sleeps) before `localLogout`. Cheap fix: call `localLogout()` directly after a successful credential change (server already revoked). Effort S.

#### 4. Areas verified fine (re-verified, with evidence)

| Area | Verdict |
|---|---|
| Refresh single flight | `session.ts:36-37,141-146` correct: one in-flight promise, cleared in `finally`; retries only on non-401 (`:182-186`). Worst case latency is bounded at 3 x (request + 1 s) |
| `coalesced` semantics | `resource.ts:21-30` correct for dedupe, but see STA-9 for the hang case |
| Stream mechanics | `apiUtils.ts:284-356`: ticket then EventSource, cleanup closes, single error handler; one extra RTT (ticket) per stream is inherent to the one-time-ticket design |
| Response handling | `handleResponse` reads the body once (`:72`), single `JSON.parse`; no double parse |
| Toast storms | N failed requests do not produce N toasts: `ToastService.ts:71,164-165` dedupes by colour+text |
| `requestFeedback.ts` | pure functions, `quietDepth` counter is balanced by `finally` (`:21-28`); no per-item cost |
| `network.ts` | tiny `reactive`, two listeners, unsubscribed by `OfflineBanner`; no polling anywhere (`grep setInterval` empty) |
| Session identity | `identity` getter caches the decode; `userId`/`role` getters are cheap (`session.ts:53-69`); decode runs only when the token changes |
| Admin store | state not persisted, size bounded by the number of sources (about 20) |
| Profile view/modal | see STA-15 |
| Mapping complexity | all mappers are O(n) single pass, no nested searches; cost is the Luxon calls (STA-12) |
| `optimisticUpsert/Remove` logic | correct and local to the item; cost is inherited from STA-1 and the O(N) `findIndex` x3 (about 3 x 0.3 ms at N=10000) |
| Layout/snap/calendar stores | scalar or small arrays, a handful of keys; calendar writes 5 independent keys (negligible) |
| Debounce policy itself | 250 ms trailing is appropriate once the per-flush work is cheap |

#### 5. Corrections and confirmations of the first audit

| First audit ID | Verdict |
|---|---|
| FE-5 token from IDB per request | Confirmed, plus contention mechanism (STA-6) |
| FE-10 persistence layer cost | Confirmed and under-stated: the dominant cost is not the flush but the deep sync traversal per mutation (STA-1), which the first audit did not identify; its fix "write only dirty keys" is right but insufficient alone |
| FE-11 deep reactivity | Confirmed, now quantified (13x memory, STA-13) |
| FE-13 watering hydrate race | Confirmed (`watering.ts:86-89`, 3 concurrent hydrates, each with 2 Mut + proxy stringify) |
| FE-16 admin health repeated | Confirmed (STA-14) |
| SALES-8 persistence/reactivity on large list | Confirmed and raised from Low-Medium to High: with STA-1 it is quadratic, not "overhead" |
| SALES-11 double hydrate | Confirmed; fix generalised in STA-5 (memoised `$hydrate`) |
| First audit section 7 "Listener and timer hygiene ... no polling" | Confirmed (no intervals, one resize listener). But "no per-request DB lookup for auth" is a backend statement; on the client every request reads IDB (STA-6) |
| First audit "Plants query itself no N+1" (backend) | Not my slice; client side N+1 amplification is worse than described (STA-3 is O(P^2*M) on the main thread, not just P requests) |
| First audit measured "3 long tasks totalling 942 ms while 36 items streamed" (SALES-4) | Plausible cause now identified: per-sale STA-1 traversal (36 mutations x growing state) rather than only re-sorting |

#### 6. Measurement hooks (what I want you to take)

All with a production build (`pnpm build` + preview) unless stated; the dev build adds Pinia `onTrigger` bookkeeping (`pinia.js:1032-1037`) and Vue dev checks and would exaggerate everything.

| # | Hook | Scenario | What to record |
|---|---|---|---|
| M1 | Count and time deep traversals | Temporarily wrap `traverse` is not possible; instead in `persistence.ts` log `performance.now()` at entry of the `$subscribe` callback and increment a counter (callback fires only when not suppressed). Better: Chrome Performance panel, record, look for `traverse` self time under `job`/`effect.run` | Sales cold start with 1000 and 5000 synthetic sales in IDB: total time in `traverse`, number of `job` runs; expected 5 runs on hydrate |
| M2 | Sales stream commit cost | Large synthetic dataset, pull to refresh on Sales, performance trace | Long tasks (count, longest), time in `traverse` vs `visibleSales`/`filteredSales` vs render; compare with `addPricePoint` stubbed out to confirm STA-4 |
| M3 | markAllSeen | Sales with all items new (fresh profile), tap "Mark all seen" with N=200, 500, 1000 | Click-to-paint latency, `traverse` count |
| M4 | Write path | In `persistence.flush` wrap with `performance.now()` around `serialized`, `JSON.parse`, `storageService.set` (await) and log entry key + byte length; scenarios: water one plant at R=1000/5000/20000 records, sales sort change, markSeen | stringify ms, parse ms, set ms (until `transaction.oncomplete`), bytes; writes per user action (count `storageService.set` calls per action) |
| M5 | IDB contention | While a 5 MB flush is pending (trigger markSeen on N=10000) fire `TokenUtils.getToken()` repeatedly (console snippet using `performance.now()`); also log `apiUtils.getHeaders` duration | token-read latency idle vs during/after a big write; expected jump from about 1 ms to the commit time |
| M6 | Watering N+1 | Account with P=100/300/1000 plants, M=20/50, clear IDB `watering_records_data`, open Plants tab | Time to last record loaded, longest task, count of `$hydrate` calls (log in plugin: expected 3), `overviewItems` recompute count (add a temporary counter) and total scripting time |
| M7 | Memory | Heap snapshot (or `performance.measureUserAgentSpecificMemory`) after loading Sales with N=10000, Plants with N=5000 with K=3, and watering R=50000 | Retained size grouped by `Dep`, `Link`, `Proxy`, and the size of `last` strings; compare with markRaw items experiment (my synthetic: 28.6 MB vs 2.1 MB for 10000 sales) |
| M8 | Cold start | Reload with sales cache N=1000 / 5000 stored, CPU 4x throttle, trace from navigation start | Time from `TabsPage.mounted` to `restore` resolved, number of `traverse` runs, IDB read duration, main thread blocking before first interaction; repeat with `restoreSales` commented out to see the boot cost of STA-5 |
| M9 | Logout race | Log in, open Plants (throttle network 3G so N+1 runs long), log out mid-load, then inspect IDB `plants_all` / `watering_records_data` after reload and log in as another user | Whether stale previous-account keys exist and whether they hydrate for the second account |
| M10 | Token expiry | Set `JWT_EXPIRATION=1m` on the dev backend, leave the app idle for 2 minutes, then open Plants | Network panel: number of 401s before first success, added latency; check that all parallel requests got 401 |
| M11 | Logout cost | With IDB holding sales 10000, plants 5000, watering 50000: time `storageService.clear()` and peak memory | ms and peak heap during `clear` |
| M12 | Mapping | Time `PlantMapper.convertToPlants` for 1000/10000 plants with K=3 and `convertToWateringRecords` for 50000 records on the target phone | ms per call (my desktop constant: 2.2 us per date) |
| M13 | Flush frequency | Count `storageService.set` calls and bytes written while: streaming sales, running the watering round for K=20 plants, adding one plant with an image | writes per user action (my static estimate: 1 to 2 per action, 5 for the watering round if responses are more than 250 ms apart) |
| M14 | Request timeout | DevTools offline/blackhole one `/watering/plant/:id` request then navigate away and back to Plants | Whether the list recovers (expected: stays loading, STA-9) |

#### 7. Suggested order inside this slice

1. STA-1 (plugin swap to action-boundary signalling, plus `$persistNow` escape hatch). Biggest effect per line of change, unblocks everything else.
2. STA-4 and STA-13 (shallow collections, one-pass commit, `seenIds`) together with STA-5 (memoised hydrate, lazy sales hydrate, summary entry).
3. STA-2 and STA-7 and STA-6 together (storage layout: two stores, keyed records, raw snapshots).
4. STA-3 (with BE-1 on the backend).
5. STA-10, STA-9, STA-11, STA-8, STA-12, STA-14, STA-15.


---

## Appendix G: Rendering, media, infrastructure (REN-n)

### Deep audit, slice RENDER (REN-n): rendering, media, CSS, motion, infrastructure, backend image path

Read-only. Baseline `main` at f11430d. Paths are relative to the repo root; frontend files are under `frontend/src`, backend under `backend/src`.
Labels: Confirmed = traced in code (file:line). Suspected = depends on browser behaviour or data not measured. Numbers marked "bench" were measured with a node micro benchmark of the exact function body (V8, desktop CPU); numbers marked "est" are my model constants and must be replaced by your measurements (see section 5).
Earlier IDs (IMG-n, FE-n, SALES-n, BE-n) are confirmed, refuted or extended inline.

#### Glossary used here
- Card: one `li > button.tag-card` rendered by `components/overview/ItemsOverview.vue:96-140`.
- Hidden page: an Ionic page with class `ion-page-hidden` (`display:none !important`, verified in `@ionic/core/css/core.css`).
- Flush: one Vue scheduler flush (re-render pass).
- N: items in a list. R: watering records per plant. K: photos per entity. M: DOM nodes.

---

#### 1. Input / entry event inventory (render slice view)

Trace is DOM event -> handler -> computed/watcher cascade -> store -> (persistence) -> HTTP -> ... -> re-render. Only the render-relevant hops are expanded; data-layer hops are cross-referenced.

| # | Entry event | Trace (render path) | Complexity |
|---|---|---|---|
| E1 | First mount of a list tab (plants, substrates, components, sales) | `ion-router-outlet` mounts page -> view `computed` builds item view-models (`PlantOverview.vue:131`, `SalesOverview.vue:150`, `ComponentOverview` map, `SubstrateOverview.vue:~120`) -> `ItemsOverview` watcher `items` immediate (`ItemsOverview.vue:321-331`) sorts a copy -> `filteredItems` (deep reactive data) -> `v-for` mounts N cards, each with `ProgressiveImage` (+ `PlantPlaceholder` + art component until the image arrives) -> Stencil `ion-img` + `ion-icon` upgrade | O(N) view-model, O(N log N) sort, O(N x ~14..40) elements, 2 Stencil components and 1..3 IntersectionObservers per card |
| E2 | `SearchBar` mounted (first time the list is non-empty) | `SearchBar.vue:36-43` `mounted -> emitSearch()` -> `ItemsOverview.filterItems("")` (`:294-298`) -> second sort + second assignment of `filteredItems` with a new array identity | One extra O(N log N) sort and one extra full-list patch right after E1 |
| E3 | Tab switch to an already mounted list | Ionic removes `ion-page-hidden` -> Blink must style and lay out the whole N-card subtree again (it was `display:none`) -> page transition animates the result. `ionViewWillEnter` handlers run in parallel (`PlantOverview.vue:93`, `SubstrateOverview.vue:~118`) | O(N) style + layout on every re-entry |
| E4 | Back from a detail route (Sales) | `SalesOverview.vue:168-172` `ionViewWillEnter -> markSeen(id)` -> store mutation -> `filteredSales` getter (`stores/sales.ts:87-89`, copies N and re-sorts) -> `mappedSales` recomputes N x (2-3 `Intl.NumberFormat` constructions) -> `ItemsOverview` watcher -> sort -> patch N cards. Runs at the START of the back transition. | O(N) at ~100 us per sale (bench) + O(N) patch |
| E5 | Pull to refresh / refresh button | `ItemsOverview.vue:281-293` toggles `isRefreshing` twice (data in the list component, so the whole list re-renders twice), plus whatever the store does | 2 x full-list patch + data layer |
| E6 | Search keystroke (SearchBar `:debounce="0"`) | `ionInput` -> `SearchBar.onInput` -> emit -> `filterItems` -> `Utils.baseSearchFilter` (`utils/utils.ts:65-80`: every string field of every item, `toLowerCase` allocation each) -> sort -> assign -> keyed patch, cards unmount/mount | O(N x fields) filter + O(N log N) sort + patch of surviving cards; mount of cards that reappear |
| E7 | Clear search | Cards removed by the filter mount again, each re-running `ProgressiveImage.processImage` (two new `Image()` loaders, placeholder first) | O(removed cards) full card mount |
| E8 | Scroll | `ion-content` `:scroll-events="true"` fires `ionScroll` each frame (`ItemsOverview.vue:2,273-275`); crossing scrollTop 300 toggles `showScrollTop` (data) which re-renders the whole list component; N IntersectionObservers (ion-img) evaluated per frame | O(1) per event except at the threshold: O(N) patch; IO cost O(#live observers) per frame (Suspected) |
| E9 | Image load completes (per card) | `new Image().onload` -> `currentSrc` set (render 1: placeholder -> `ion-img`) -> second loader `onload` -> `currentSrc`, `isLoading` (render 2) -> Stencil `ion-img` `srcChanged` re-creates its IntersectionObserver each time (`img.js:20-22,34-56`) | 2..3 component renders + 2 observers + 2 decodes per card, N times |
| E10 | Sales sort / filter change | `ion-select ionChange` -> `setQuery` -> `filteredSales` (copy + sort/filter N) -> `mappedSales` (Intl x N) -> watcher -> patch | O(N) at ~100 us/sale + patch |
| E11 | Sales SSE frame | store `incoming` grows -> `visibleSales` rebuilds a `Set` of N and copies (`stores/sales.ts:81-85`) -> `filteredSales` -> `mappedSales` -> list patch | Per frame O(N); total O(N x frames) (see SALES-4) |
| E12 | Plant list warm-up of watering state | `PlantOverview.vue:161-168` watcher -> `ensureRecordsFor` (3 workers) -> each response mutates `byPlantId[id]` -> `overviewItems` (`:131-158`) recomputes for ALL plants: `wateringStatus` + `Intl.RelativeTimeFormat` per plant -> new items -> sort -> patch N cards | One flush per response: N flushes x O(N x R) = O(N^2 x R) total |
| E13 | Round (`WaterRound.vue`) tick / fertilizer override | `RoundList @change` -> `toggle` (`rows.find` O(N)) -> `overrides[plantId] = ...` -> `rows` computed (`WaterRound.vue:269-273`) rebuilds: `buildRoundRows` (`wateringStatus` per plant + sort) + spread per row -> `visibleRows`, `hiddenCheckedCount` (Set of N), `checkedCount`, `saveLabel` -> `RoundList` patches N rows (new row objects) | O(N x R) + O(N log N) + O(N) patch per tap |
| E14 | Round search | `onSearch` -> `visibleRows` filter | O(N) + patch |
| E15 | Picker modal open / search (`PlantPickerModal`) | `useMountWhileOpen` mounts the modal -> `filtered` copies and sorts all plants on every keystroke (`:49-52`), 150 ms debounce | O(N log N) per keystroke, N li mounted at open |
| E16 | Gallery render / enlarge (`HorizontalGallery`) | `enlargeImage` sets `enlargedImage` (data) -> gallery re-renders K tiles -> `altFor`/`captionFor` build `Intl.DateTimeFormat` per call (2 per tile) | O(K) Intl constructions (64 us each, bench) per open/close |
| E17 | Photo upload | `UploadField` object URL preview (full bitmap decode) -> multipart POST of the original file (<=10 MB) -> `readUpload` buffers it (`multipartUpload.ts:38`) -> EXIF parse -> sharp decode+resize+encode (`LocalImageStorage.ts:121-134`) -> DB row -> `onImageStored` -> ONNX embedding (`recognition/index.ts:41`) | Per upload: 10 MB x ~3 copies in memory, decode of source resolution |
| E18 | Dark mode toggle | `darkMode.ts:9-16` class toggle on `html`, then `getComputedStyle` (forces a synchronous style recalc) | O(M visible) restyle |
| E19 | Locale switch | `localizationService.locale` ref read by every `t()` call (`LocalizationService.ts:253`) -> every component that called `t` re-renders, `mappedSales` / `overviewItems` recompute | O(N) per mounted list |
| E20 | App boot / SW install | `registerSW` -> precache of every JS/CSS/woff2 (2.3 MB, `vite.config.ts:18`) | one-off, 79 files |
| E21 | Image GET (every card) | page -> SW `CacheFirst` (`vite.config.ts:25-36`) -> miss -> nginx `/uploads/` -> Node `@fastify/static` -> disk | per image, 2 per card today |

---

#### 2. Scaling table (main thread, desktop 1x; multiply by about 4 for the mobile 4x CPU profile)

Per-card constants (est, to be replaced by hooks H1..H6): mount of a card with photo 0.30 ms (Vue 0.10, Stencil 2 comps 0.08, style+layout 0.06, observers+listeners 0.02, placeholder create+destroy 0.04); full patch of an unchanged card 0.025 ms; style+layout only (re-show) 0.06 ms; `mappedSales` formatting 0.10 ms per sale (bench: NumberFormat currency 33 us, percent about 30 us, a discounted sale builds 3).

| Event | N=10 | N=100 | N=1000 | N=10000 | Over 16 / 50 / 200 ms |
|---|---|---|---|---|---|
| E1 first mount | 3 ms | 30 ms | 300 ms | 3.0 s | 16: N>=60; 50: N>=170; 200: N>=700 |
| E3 re-show (style+layout only) | 0.6 ms | 6 ms | 60 ms | 600 ms | 16: N>=270; 50: N>=830; 200: N>=3300 |
| E4/E10/E11 Sales recompute + patch (per event) | 1.3 ms | 13 ms | 125 ms | 1.25 s | 16: N>=130; 50: N>=400; 200: N>=1600 |
| E6 search keystroke, plants (filter ~1 us/item + sort bench 0.8 ms @1000, 4 ms @5000 + patch) | 0.3 ms | 3 ms | 28 ms | 280 ms | 16: N>=600; 50: N>=1800; 200: N>=7000 |
| E8 scroll threshold crossing (patch only) | 0.3 ms | 3 ms | 25 ms | 250 ms | same as E6 |
| E12 plant list, per watering response (R=30: wateringStatus 30 us bench + RTF 21 us bench + patch 25 us) | 0.8 ms | 8 ms | 80 ms | 800 ms | and it repeats N times: total about 0.1 s / 0.8 s / 80 s / 8000 s of main thread |
| E13 round tick (R=50: 45 us per plant bench + sort + patch 12 elements per row) | 0.8 ms | 8 ms | 80 ms | 800 ms | 50: N>=600; 200: N>=2500 |
| E15 picker keystroke (sort bench 4 ms @5000 + N li patch) | <1 ms | 2 ms | 20 ms | 200 ms | 50: N>=2500 |
| E16 gallery (K tiles, 2 DateTimeFormat each, 128 us per tile) | 1.3 ms | 13 ms | 130 ms | 1.3 s | K realistically <=100: fine |
| E9 image completion, total CPU spread over loading | 0.4 ms | 4 ms | 40 ms | 400 ms | spread, not a single task |

Memory model (est): DOM per card with photo about 17 nodes (14 light + shadow of ion-img and ion-icon), without photo about 38 to 70 nodes (SVG art, see REN-5). N=1000: 17k to 70k nodes; N=10000: 170k to 700k nodes, which is past the point where Chrome style/layout invalidations stay interactive. Decoded bitmaps: only intersecting `ion-img` set `<img src>` (img.js:60-68), so decoded memory is bounded by viewport, but the encoded bytes of ALL N images were already fetched by the eager `new Image()` loaders (IMG-2), at 2 requests per card.

Key reading of the table: the dominant per-navigation costs are linear in N at roughly 0.03 to 0.3 ms per card, with three super-linear amplifiers (E12, E13, E4/E11) that turn linear into quadratic or repeat the linear cost per event. Fixing paint-level things (`content-visibility`, lazy attrs) addresses E3 and part of E1 only; the amplifiers need data-flow fixes.

---

#### 3. Findings

##### REN-1 (High, Confirmed, structural): every list renders all N items; no paging contract exists at any layer
- Evidence: `ItemsOverview.vue:95-141` single `v-for` over `filteredItems`; `PlantOverview.vue:127-129`, `SubstrateOverview.vue:~117` and `SalesOverview.vue:150` pass whole collections; no `ion-infinite-scroll`, no `content-visibility`, no windowing (grep: none in `src`). IMG-14 and FE-11 say "only consider virtual scroll past about 500"; my numbers (section 2) put the 50 ms line at N of about 170 for mount and 400 for sales events, and the 200 ms line at N of about 700, so that threshold is too late.
- Root cause: list size is an unbounded function of user data at the API (BE-2), the store (whole-collection state), the persistence layer (FE-10) and the view; nothing in the chain has a notion of a page.
- Root-cause fix, end to end (one design for plants, substrates, components and sales):
  1. API: cursor pagination on every list endpoint: `GET /plants?cursor=&limit=50&q=&sort=` returning `{ items, nextCursor, total }` with `q`, sort and filter server side (SQLite `LIKE`/FTS on indexed columns, DB-1/DB-2). For Sales the query runs against the persisted sale table that SALES-1 introduces.
  2. Store: a generic `usePagedResource` helper next to `stores/resource.ts` holding `items` (shallow, frozen), `nextCursor`, `status`, `query`; `loadMore()`; a query change resets the list. Persistence stores only the first page per query.
  3. View: `ItemsOverview` gets `hasMore` and emits `load-more`; render `ion-infinite-scroll` below the grid; search and sort emit a query change (debounced 250 ms) instead of filtering locally. DOM is bounded by pages loaded; trim the window (keep at most about 200 cards) only if users scroll deep.
  4. CSS: `content-visibility:auto; contain-intrinsic-size:auto 260px` on `li` cards for the loaded window (this part alone is the fix for E3 re-show cost at moderate N and costs one rule).
- Layers: backend repositories/routes/DTOs, `stores/*`, `ItemsOverview`, view components, mappers.
- Expected impact: E1/E3/E6/E8 become O(page) (about 50 cards: about 15 ms mount on desktop); the data layer stops shipping and persisting N items for a tab that shows 50.
- Effort L, risk medium (contract change, search semantics move to server, public/private segments and offline behaviour need a decision). Depends on DB-1/DB-2 indexes, SALES-1 (persisted sales).
- Do not do first: client-only virtualization. It leaves E4/E11/E12 (data flow) untouched, fights `ion-content` and the auto-fill grid, and keeps the unbounded payload.

##### REN-2 (High, Confirmed mechanism / Suspected magnitude): every tab re-entry restyles and re-lays-out the whole list
- Evidence: Ionic hides left pages with `.ion-page-hidden{display:none !important}` (`@ionic/core/css/core.css`; applied in `@ionic/vue/dist/index.js:1469,1572`), pages are kept mounted. Showing a `display:none` subtree again requires full style recalc and layout of every descendant (Blink keeps no computed style for `display:none` subtrees). `ion-page` has `contain: layout size style` (core.css), which bounds the damage to the page but not to its N cards. `ItemsOverview` has no containment on cards (`.tag-card` at `:411-426`, `li` has none).
- Why this matches "navigating into Sales is a bit slow EVERY time": it is the one cost that is paid on every entry, needs no network, grows with N, and lands before the first transition frame because Ionic's animation needs a laid-out entering page.
- Root-cause fix: bound the subtree (REN-1) and make off-screen cards free: `content-visibility:auto` + `contain-intrinsic-size` on `li` (skipped contents get no style or layout work until near the viewport), `contain: content` on `.tag-card`. Because `.ion-page-hidden` is global Ionic behaviour, do not fight it.
- Verify with H3 before and after. Effort S for the CSS, but only coherent together with REN-1 (intrinsic size must match the real card height, the card height varies with 1..2 name lines and the price block; use `auto <height>` so the browser remembers real sizes).
- Impact: E3 from 60 ms to about 5 ms at N=1000 (est). Risk: scroll position jumps if intrinsic size is far off.

##### REN-3 (High, Confirmed): the list component is one big render function with deep-reactive state; any flip re-patches all cards
- Evidence: `ItemsOverview.vue:96-140` renders cards inline (no card component); `data()` holds `filteredItems` (`:250`, deep reactive), `isRefreshing` (`:257`), `showScrollTop` (`:258`), `currentSearch` (`:249`). Any of them changing re-runs the render and diffs N x about 14 vnodes. `showScrollTop` flips on scroll through 300 px (`:273-275`), `isRefreshing` flips twice per refresh (`:281-293`). The view-model objects are rebuilt on every upstream change (`SalesOverview.vue:150-163`, `PlantOverview.vue:131-158` spread `...plant`), so every card receives a new object and Vue re-creates reactive proxies and dependency records for N x about 10 properties per rebuild. `SearchBar.vue:36-43` emits `search("")` on mount, so the list sorts and assigns twice when it first appears (E2). Dual state (`items` prop -> watcher -> `filteredItems` data, `:321-331`) means the copy is made even when no search is active.
- Root cause: presentation and state are fused in the list component; view-models are mutable reactive objects rebuilt wholesale.
- Fix: (a) extract `OverviewCard.vue` taking the primitives it renders (or one frozen view-model), so a list re-render skips unchanged cards through props equality; (b) build view-models as `Object.freeze`d plain objects in the mapping layer (Vue does not proxy non-extensible objects), or hold the list in a non-reactive field; (c) `filteredItems` becomes a `computed` of `items` + `query` (no watcher, no second copy, no duplicate emission); (d) move `showScrollTop` and `isRefreshing` out of the list's render (small child components or the existing `ion-fab` in its own component); (e) `v-memo` only if (a) proves insufficient.
- Layers: `ItemsOverview`, new `OverviewCard`, mapping/view-model builders in the three views. Impact: E5/E8/E2 patch cost drops from O(N) to O(changed); E1 shrinks by the proxy and tracking cost (est 0.03 ms per card). Effort M, risk low. Test impact: the Options API test requires the new component to stay Options API.

##### REN-4 (High, Confirmed; corrects parts of IMG-5/IMG-6): per-card image stack is four moving parts for one picture
- Per-card cost today (`ProgressiveImage.vue:2-11,72-121`, Ionic `img.js:34-56`): 1 Vue component with a `src` watcher and a computed; 2 `new Image()` loaders (IMG-2, confirmed); a Stencil `ion-img` with shadow DOM; 1 IntersectionObserver per `ion-img`, recreated on every `src` change (`img.js:20-22`: 2 or 3 per card as the src moves lowRes -> highRes); 3 Vue renders per card (placeholder, lowRes, highRes); for the whole time before the first load the card mounts the placeholder SVG (REN-5) and later destroys it.
- Corrections to the first audit: the inner `<img>` of `ion-img` already has `decoding="async"` (`img.js:79`), so IMG-5/IMG-6 "no decode control" is wrong for the list; and only the `new Image()` loaders are eager, `ion-img` itself is viewport-gated (its observer sets `loadSrc` only when intersecting), so decoded memory is already viewport-bounded and the eager cost is network, cache and SW churn, not decode. What IMG-2 describes is therefore right for bytes and wrong for decode.
- New: the live IntersectionObserver count is N (Suspected cost: Chrome evaluates every registered observer in the rendering update; at N=5000 that is about 5000 evaluations per frame while scrolling). New: with the unconditional `new Image()` the browser downloads N images before the user scrolls, competing with API calls on the 6-connection HTTP/1.1 budget (REN-12).
- Fix (single component, replaces the stack): native `<img src srcset sizes loading="lazy" decoding="async" width height>` inside a container whose background is the placeholder colour/art; opacity fade on `load` (no filter, no JS loaders, no `ion-img`, no per-card observers because the browser owns lazy loading). Eager and `fetchpriority="high"` for the first visible row only. Variants come from IMG-1. Keep the failure fallback (`@error` flips to the placeholder).
- Layers: `ProgressiveImage` (rename AppImage), ItemsOverview/DetailHero/HorizontalGallery callers, backend variants (IMG-1/3/4). Impact: removes 2N requests -> N lazy ones, N observers -> 0, 3 renders -> 1, 2 Stencil components -> 1 per card. Effort M, risk low.

##### REN-5 (Medium, Confirmed): placeholder art is a 22 to 66 element SVG per card, mounted for every card before its photo arrives and for every card without a photo
- Evidence: `PlantPlaceholder.vue:1-12` renders one `svg` and one of four art components; element counts in the art files (count of `path|circle|ellipse|g|line|rect`): PlantArt 66 over 3 shapes (about 22 each), SaleArt 55 (about 18), ComponentArt 38, SubstrateArt 36 (about 12 to 13). `ProgressiveImage.vue:2-3,60-62` shows it while `currentSrc` is empty, so E1 builds N SVGs then tears them down as images land; items without photos keep them permanently. Every entity without a photo (new users, `Windowsill Cutting`-like items, substrates, components) pays about 25 elements x N of style and layout, which is more than the card itself (14 elements).
- Root cause: placeholder drawn as live DOM per instance.
- Fix: precompute 12 art variants x 5 tints x light/dark as static assets: either one `<svg><use href="#plant-1"/></svg>` sprite (halves Vue work, not Blink work) or, better, generate each combination at build time into a CSS class with `background: url("data:image/svg+xml,...")` so a placeholder is zero extra elements (the browser decodes each SVG image once and caches it). Keep the component API (`kind`, `seed`) and compute the class from the hash. Tint and dark mode are class selectors (`.ion-palette-dark .ph-...`).
- Layers: `components/ui/PlantPlaceholder.vue`, `placeholder-art/*`, a build script. Impact: removes about 25 x N elements in no-photo lists and the create/destroy churn in photo lists. Effort M, risk low (visual regression check required).

##### REN-6 (High, Confirmed numbers by bench): Sales view-model builds 2 to 3 `Intl.NumberFormat` objects per sale per recompute
- Evidence: `SalesOverview.vue:150-163` calls `formatPrice` (`utils/formatPrice.ts:5` constructs `new Intl.NumberFormat(locale, {style:"currency"})` on every call), `formatPrice(sale.oldPrice)` for discounted ones, and `formatDiscount` (`:20-27`, another construction). Bench: currency construct+format 33 us, so about 100 us for a discounted sale. The computed re-runs for every dependency change: SSE frame, `markSeen` on return (E4), sort, filter, locale switch.
- N=1000: about 100 ms per event (above the 50 ms line); N=5000: 0.5 s. This is the unmemoised part of SALES-4 that the first audit measured as long tasks.
- Fix: a module-level formatter cache keyed by locale (`Map<string, Intl.NumberFormat>`) in `formatPrice.ts`, reducing each call to about 1 us (re-bench); additionally format at card render, not in the list view-model, so only visible cards format at all once REN-1 lands. Effort S, risk none. The same cache pattern applies to REN-7 and REN-10.

##### REN-7 (High, Confirmed structure, numbers bench): plant list recomputes every plant's watering status on every watering response (O(N^2 x R) during warm-up)
- Evidence: `PlantOverview.vue:131-158` runs `wateringStatus(records, now)` per plant (`utils/wateringStats.ts:50-67`: `Math.max(...map)`, a `Set` of `toDayKey`, sort, `new Date(...)` per day, two `calendarDaysBetween` with regex parse) and `relativeDaysText` (`:25-33`, constructs `Intl.RelativeTimeFormat` per call) for every plant; the computed depends on `byPlantId`, and `ensureRecords` assigns `byPlantId[id]` once per response (`stores/watering.ts:90-92`), so each of the N responses triggers a full recompute plus a full list patch. Bench `wateringStatus`: 6 us (R=5), 22 us (R=20), 86 us (R=100), 443 us (R=500). RTF construct+format: 21.6 us.
- This is the render-side half of FE-2/BE-1: even after the N+1 requests are removed, the per-plant derived state must not be recomputed from raw records for the whole list.
- Fix: the plant summary contract from BE-1 (`lastWateredAt`, `lastFertilizedAt`, `avgIntervalDays` computed in SQL) makes status O(1) per plant, no records needed for the list. Independently: cache `Intl` formatters (REN-6) and keep the status in a per-plant memo keyed by `(plantId, records identity)` so one response changes one plant's entry, not N.
- Layers: backend list query + DTO, `mapping/PlantMapping`, `stores/plants`, `utils/wateringStats`, `PlantOverview`. Impact: warm-up from O(N^2 R) to O(N). Effort M, depends on BE-1.

##### REN-8 (High, Confirmed): Watering round recomputes all rows and repatches the whole list on every tap
- Evidence: `WaterRound.vue:269-273` `rows` = `buildRoundRows` (`utils/waterRound.ts:19-39`: `wateringStatus` per plant + `sort` with `localeCompare`) then a spread per row merged with `overrides`; `overrides` is read inside the computed for every row (`:272`), so each tap (`toggle`, `:344-346`, which also does `rows.find`, O(N)) re-runs everything. Derived computeds `visibleRows`, `hiddenCheckedCount` (builds a `Set` of N, `:281-284`), `checkedCount` (`filter`, `:285`, evaluated again through `saveLabel`) are each O(N). `RoundList.vue:2` re-renders N rows because every row object is new.
- Per tap at R=50: about 45 us x N for statuses (bench) + about 12 elements x N patch: 80 ms at N=1000 (over the 50 ms line), 0.8 s at N=10000.
- Root cause: base row state (derived from plants and records, changes rarely) and per-row interaction state (checked, override, changes per tap) are one object rebuilt together.
- Fix: `baseRows` computed from plants + status summary (REN-7), sorted once; interaction state in a plain map `{checked, fertilizerTypeId}` keyed by plant id; `RoundList` rows become `RoundRow.vue` taking `row` + `checked` + `override` props (equality skip); counts maintained incrementally (a `checkedCount` integer updated in `toggle`). Layers: `WaterRound`, `RoundList`, `utils/waterRound`. Effort M, risk low.

##### REN-9 (Medium, Confirmed): round list and picker modal mount every plant, with Ionic components per row and full-size thumbnails
- Evidence: `RoundList.vue:25-53` per row: `ion-button` + `ion-icon` (2 Stencil components) as soon as `fertilizerTypes.length` is truthy, plus `<img :src="row.imageUrl" loading="lazy">` with no `width/height`, no `decoding`, pointing at the 1024 px file for a 44 px box (IMG-13 confirmed); `PlantPickerModal.vue:9-21` same list in a modal, and `filtered` (`:49-52`) copies and sorts all plants on each query change.
- Fix: thumbnail variant (IMG-1) and a row component; the "override" control becomes one `ion-popover`/inline editor opened per row on demand instead of an `ion-button` per row (`toggleEditor` already exists); modal list uses the same paged source as REN-1 (server search with 150 ms debounce) rather than loading all plants. Effort M.

##### REN-10 (Medium, Confirmed): gallery builds `Intl.DateTimeFormat` twice per tile per render and mounts every photo eagerly
- Evidence: `HorizontalGallery.vue:14-20,80-108` `altFor` calls `captionFor` which calls `formatDisplayDate` (`utils/localDate.ts:52-59`) constructing `Intl.DateTimeFormat` (64 us bench); the template calls `captionFor` and `altFor` per tile, so 2 constructions per tile on every render; opening the enlarge modal sets `enlargedImage` (data) and re-renders all tiles. Each tile has a `ProgressiveImage` (REN-4) so a plant with K photos starts 2K loaders although about 3 tiles are visible in the horizontal strip.
- Fix: formatter cache (REN-6), `GalleryTile` child component, REN-4 image component (native lazy loading works in horizontal scrollers). Effort S after REN-4.

##### REN-11 (Low, Confirmed): scrollbar rule applies a custom property to every element
- Evidence: `theme/scrollbar.css:24-27` `:root, * { scrollbar-color: var(...); scrollbar-width: thin }` although the file's own comment says both properties inherit. `*` forces an explicit declaration (with `var()` resolution) on every element in the document (about 17 to 70 per card), which prevents sharing computed style through inheritance and adds to style recalc on theme change. It also conflicts with the `::-webkit-scrollbar` rules below it in Chromium 121+ (standard properties win).
- Fix: drop `*`, keep `:root` (inheritance reaches Ionic shadow roots). Effort S, risk low. Impact small (est a few percent of style recalc).

##### REN-12 (Medium, Confirmed config / Suspected effect): nginx path serves uploads through Node, buffers nothing for the API, has no h2 and weak gzip
- Evidence (`frontend/nginx.conf`): `/uploads/` is `proxy_pass` to the backend (`:56-67`) with no `proxy_cache`, no shared volume (`docker-compose.yml:34-45` mounts `plantcare-data` only into the backend), so every cache miss costs a Node `@fastify/static` request (stat + stream). `/api/` has `proxy_buffering off; proxy_cache off` for the whole prefix (`:49-50`), including large JSON list responses, which keeps the Node response open at client speed (only SSE needs this). `listen 80` only, no `http2` (HTTP/1.1 means 6 connections per origin; one is held by the Sales SSE stream for up to the 3600 s read timeout, `:51`); TLS ends in front by design, so h2 must be enabled there or here (Suspected: depends on the real front proxy). `gzip` has no `gzip_vary on`, default `gzip_comp_level 1`, no brotli, and `application/manifest+json`, `font/*` (already compressed, fine) and `text/plain` are not listed. `workbox-*.js` and other unhashed-name-but-content-hashed files outside `/assets/` fall to `location /` with no `Cache-Control` (heuristic caching). `expires` + `add_header Cache-Control` emit two `Cache-Control` headers on `/uploads/` and `/assets/` (nginx `expires` rewrites any upstream Cache-Control, so there is no conflict with Fastify's `max-age=0`, only a duplicate; Suspected until `curl -I`).
- Combined effect with REN-4/IMG-2: N eager image requests occupy the 6 connections and the SSE stream occupies one, so the `/api` calls the page needs (watering N+1, sales) queue behind images (Suspected; Chrome prioritises fetch over images but cannot preempt in-flight transfers).
- Fix (root, not tuning): serve uploads from nginx itself: mount `plantcare-data` read-only into the frontend container, `location /uploads/ { alias /data/uploads/; expires 1y; add_header Cache-Control "public, immutable"; sendfile on; open_file_cache ... }` (filenames are unique, IMG audit confirmed), drop the `expires`/`add_header` duplicate; scope `proxy_buffering off` to the SSE location and let `/api/` buffer; add `gzip_vary on; gzip_comp_level 5` (or brotli module); give `workbox-*.js` immutable caching; enable h2 where TLS ends. Access control note: `/uploads/` is already unauthenticated (IMG-9), so moving it to nginx does not change the security model.
- Layers: nginx.conf, docker-compose volumes, `app.ts` static registration kept only for the non-Docker path. Effort S to M, risk low. Confirms FE-9/BE-9; extends FE-8 (`serve.js` below).

##### REN-13 (Medium, Confirmed config; extends IMG-10): the service worker turns a list scroll into an LRU worst case
- Evidence: `vite.config.ts:25-36`: every `/uploads/*` request goes through the SW, `CacheFirst`, `maxEntries: 200`, ExpirationPlugin (workbox updates timestamps in IndexedDB on each cache write and hit, Suspected from workbox-expiration behaviour, verify with H8). With 2 URLs per photo today (IMG-1) the cache covers 100 photos. A list of N > capacity scrolled top to bottom is a sequential scan over an LRU: hit rate about 0 and every miss still pays the full `cache.put` (clone + body write) plus an IDB write, on the single SW thread, in addition to the network transfer. After IMG-1 the first screen of variants is small, but the 200 limit stays far below a library of thousands of 160 px thumbs.
- Precache (`:18`) includes all 79 build files (2.3 MB) and both locale bundles, installed on the first visit and on every update (`registerType: "autoUpdate"` means each deploy re-downloads changed chunks in the background; fine) but also both subsets of both fonts (latin-ext, vietnamese: about 44 KB never needed by most users).
- Fix: decide per layer. Immutable variant URLs are fully served by the HTTP cache (REN-12), so remove the SW image route or restrict it to thumbs of the first page of each list for offline use with `maxEntries` sized to that (about 300) and `purgeOnQuotaError`. Do not cache originals. Exclude unused font subsets from the precache glob with `globIgnores`. Effort S, depends on IMG-1.

##### REN-14 (Medium, Confirmed): upload pipeline has no input pixel cap, buffers the file repeatedly and has no concurrency limit
- Evidence: `LocalImageStorage.ts:121-134` `sharp(file.buffer).resize(...)` with no `limitInputPixels` (sharp default about 268 Mpixel; only the recognition embedder sets 64 Mpixel, `OnnxEmbedder.ts:12`). A 10 MB PNG (the limit, `uploadErrors.ts:18`) can hold far more than 100 Mpixel when the content is flat, and decoding it costs 4 bytes per pixel (about 1 GB at the default cap). The compose file sets no memory limit (BE-12), so one authenticated upload can OOM-kill the backend, which also serves every image and API call. The multipart plugin buffers the whole part into the body (`imageRoutes.ts:~47-52`, `multipartUpload.ts:38` calls `toBuffer()`), EXIF parsing reads the same buffer, sharp copies it again: about 3 live copies of up to 10 MB per upload. No semaphore: parallel uploads multiply this; sharp work and `fs` share libuv's default pool of 4 threads, so concurrent uploads or the embedding backfill delay `@fastify/static` file operations (image GET latency spikes) (Suspected, standard libuv behaviour; no `UV_THREADPOOL_SIZE` set, grep none).
- Cheap but wrong: only raising limits. Root fix: (1) cap pixels at the storage adapter (about 40 Mpixel) and fail with the existing `ValidationError`; (2) a small in-process semaphore around `processUpload` (2 concurrent) and set `sharp.concurrency`/`sharp.cache(false)` explicitly; (3) downscale on the client before upload so the server receives about 300 KB instead of 5 to 10 MB (REN-15); (4) set a container memory limit so a failure is contained. Layers: images storage adapter, `docker-compose.yml`, `frontend` upload field. Effort S to M.

##### REN-15 (Medium, Confirmed): the client uploads the untouched original and previews it at full resolution
- Evidence: `ImageService.ts:9-18` appends the `File` as is (up to `MAX_IMAGE_BYTES` 10 MB, `utils/imageValidation.ts:2`); `UploadField.vue:127-128` `createObjectURL` renders the original in an `<img>` (decoded at full resolution, a 12 MP photo is about 48 MB of bitmap); the server then discards everything above 1024 px (`LocalImageStorage.ts:25,121-134`). There is no `createImageBitmap`/canvas resize anywhere (grep none).
- Fix: resize on the client with `createImageBitmap(file, {imageOrientation: "from-image", resizeWidth: 1600})` + `OffscreenCanvas.convertToBlob({type:"image/webp"})`, which also bakes the EXIF rotation in (the server does not call `.rotate()`, IMG-7) and shrinks the upload about 10 to 20 times; read the EXIF capture date on the client and send it in the existing `date` form field (`ImageService.ts:13-15`), because the server's `extractImageDate` (`LocalImageStorage.ts:65-77`) would no longer see the metadata. Keep the server pixel cap (REN-14) as the trust boundary. The preview then decodes the small bitmap. Layers: `UploadField`, `ImageService`, a util, tests. Effort M, risk medium (browser support: Safari 15 target in `vite.config.ts:45` supports `createImageBitmap` but not `OffscreenCanvas.convertToBlob` before 16.4; fall back to `HTMLCanvasElement.toBlob`).

##### REN-16 (Low, Confirmed): loading skeleton animates a non-compositable property
- Evidence: `StateBlock.vue:115,147` `shimmer` animates `background-position` on 18 elements (6 cards x 3), infinite, and it is shown for the whole time an empty list waits (Sales waits for the scrape, SALES-1). Each frame repaints those regions on the main thread. Reduced motion is handled (`:139-146`), good.
- Fix: animate `transform`/`opacity` of one overlay element, or a single pulse via `opacity`. Effort S. Also: `ProgressiveImage.vue:160-163` and `ItemsOverview.vue:423-441` card hover/active transforms and the blur transition have no `prefers-reduced-motion` guard (only Accordion, OfflineBanner, StateBlock do), and `ionicConfig()` reads the media query once at boot (`utils/motion.ts:8-9`), so a runtime change is ignored. Low.

##### REN-17 (Low, Confirmed): theme switch and calendar read computed style synchronously
- Evidence: `darkMode.ts:12` `getComputedStyle(...).getPropertyValue("--chrome-bg")` immediately after toggling the class forces a synchronous style recalc of the visible page (O(M visible) once per toggle, acceptable); `Calendar.vue:190-206,354-361` `readCssColor` (one `getComputedStyle` each) per computed and per marked cell in category mode, plus `LineChart.vue:36`. Each read is cheap when style is clean but forces a recalc if anything is dirty (for example the first render after a store update that also changed DOM). Magnitude small at calendar sizes (35 cells).
- Fix: resolve the four or five colours once per theme change in `watchTheme` and cache them. Effort S.

##### REN-18 (Low, Confirmed; extends FE-14): fonts are not preloaded and four variable font files are precached
- Evidence: `theme/fonts.ts` imports both variable fonts; `dist/assets` has bricolage latin 41 KB + latin-ext 19 KB + vietnamese 9 KB and figtree latin 20 KB + latin-ext 10 KB; `font-display: swap` (fontsource) and no `<link rel="preload" as="font">` in `index.html`, so first text paints in the fallback font and reflows (card names have a 2-line clamp, so heights can change after the swap; with `content-visibility` intrinsic sizes this would matter). `index.html` also modulepreloads `vendor-charts` and `vendor-luxon` on every page (FE-1 confirmed).
- Fix: preload the two latin files, keep swap, add `size-adjust` fallback faces. Effort S.

##### REN-19 (Medium, Confirmed; extends FE-8): `serve.js` has no compression, no streaming and no cache, and proxies uploads
- Evidence: `frontend/serve.js` (the non-Docker path): static files are read with `fs.readFile` into memory per request (`:183`), no gzip/brotli anywhere (grep none), `/uploads/` proxied. In that deployment the 1.27 MB `vendor-ionic` chunk goes out uncompressed (3 to 4x larger) and every image is two hops.
- Fix: either retire `serve.js` in favour of the nginx image for every deployment, or give it `zlib` precompressed siblings produced at build time (`vite-plugin-compression`) plus `fs.createReadStream` and conditional requests. The first is the root fix (one serving path, one set of headers). Effort S to M.

##### REN-20 (Low, Confirmed): serving route that re-encodes on every request
- Evidence: `imageController.ts:105-121` + `LocalImageStorage.ts:136-152`: `GET /images/:entityType/:entityId?size=` decodes, resizes and encodes with sharp per request, `size` unbounded (`parseInt`), authenticated, `Cache-Control: public, max-age=86400` on private data. No frontend caller (grep `/images/` shows only POST/PATCH/DELETE in `ImageService.ts`). Confirms IMG-9. New angle: it is a CPU amplifier for any authenticated user (each call 20 to 60 ms of libuv pool + CPU est), so if variants are not shipped soon, delete or cap it (`size <= 1024`, 1 request per image per minute) rather than leave it. Effort S.

##### REN-21 (Low, Confirmed): recognition vector load per snap
- Evidence: `SQLiteEmbeddingRepository.ts:19-33` loads every embedding of the user (384 floats = 1.5 KB each, copied with `buffer.slice` per row) for each match request; at K = 10,000 photos that is 15 MB read, copied and scanned (`rankPlants`) per snap. Out of this slice's scope beyond flagging it (render slice owner of images only). Cache per user in memory with invalidation on `onImageStored`, or use an index. Effort M.

---

#### 4. Areas verified fine (re-verified, with evidence)

- Sorting cost is not the problem: bench of `localeCompare(b, "de")` sort of N random names: 0.64 ms at N=1000, 3.8 ms at N=5000 (V8 caches the collator). The sorts in `ItemsOverview.sortItems`, `buildRoundRows`, `PlantPickerModal.filtered` are not worth optimising on their own; ignore sort as a suspect for "slow every time".
- Hidden pages cost no layout or paint (`display:none`, verified), only memory and reactive recomputes (FE-6 stands). `ion-page` has `contain: layout size style`, so a list's layout cannot leak into neighbouring pages.
- Card layout does not shift when images arrive: `.tag-media` has `aspect-ratio: 4/3` (`ItemsOverview.vue:444-450`) (matches the first audit).
- Box-shadow, `transition` and `all: unset` on cards (`:411-426`): static cost only; paint is viewport-bound (tiles), the transition costs nothing until hover; no `will-change`, no `backdrop-filter`, no `:has()`, no container queries anywhere in `theme/*.css` or the list components (grep). Card CSS selectors are single-class and scoped; style matching is not an issue.
- `ion-content` scroll events: the handler assigns the same boolean on most frames and Vue skips unchanged assignments; the only render hit is the threshold crossing (REN-3).
- `t()` (`LocalizationService.ts:252-270`) is a Map lookup plus one regex replace; calling it per card is cheap.
- `PlantPlaceholder` hash/tint are computeds on three strings; negligible compared with its DOM weight (REN-5).
- Charts: sales price chart is capped at 30 points (`LineChart` `Math.min(...values)` safe); Chart.js is lazy except for the modulepreload (FE-1).
- Calendar: 35 cells per month, month rebuild about 40 `Intl` format calls (about 0.2 ms); `datesByDay` is O(D) (the per-day array copy is quadratic only for many entries on one day). Fine up to thousands of records.
- Admin lists (`SourceRow`, `SourceStatusStrip`): bounded by the number of shops (about 14 sales + 3 link sources), not user data.
- Modals use `useMountWhileOpen`, so closed modals cost nothing.
- Docker: multi-stage, non-root, healthchecks; hashed assets immutable; `sw.js` and `index.html` `no-cache`. Confirmed (matches section 7 of the first audit).
- Fastify static defaults (`@fastify/static` 10.1.5): `maxAge` default 0 and `immutable` false (`index.js:61-70`), ETag/Last-Modified on, no `preCompressed`: IMG-8 stands for non-nginx deployments.
- Backend serving of originals is not re-encoded (only the unused resize route is, REN-20).

#### 4b. Earlier findings re-verified in this slice
- IMG-1 Confirmed. IMG-2 Confirmed for network and cache, but see REN-4: decode is already viewport-gated by `ion-img`.
- IMG-3, IMG-4, IMG-12, IMG-13 Confirmed (RoundList/PlantPicker thumbs are 1024 px files in 44 px boxes).
- IMG-5 Partly refuted: `ion-img` inner `<img>` has `decoding="async"` (`img.js:79`); the blank-frame claim holds because `src` is set only after the observer fires.
- IMG-6 Partly refuted: no decode control is missing for lists; the blur transition costs little because it applies to a box of about 240 x 180 px and only while an image is in flight.
- IMG-8 Confirmed (`@fastify/static` defaults). Duplicate Cache-Control from nginx Confirmed by config (REN-12).
- IMG-9 Confirmed, extended (REN-20). IMG-10 Confirmed and extended (REN-13: sequential scan defeats the LRU, IDB writes per request).
- IMG-11 Not re-verified here (scraper side).
- IMG-14 Contradicted on threshold (REN-1): content-visibility alone and "virtual scroll past 500" are too late and too shallow.
- IMG-15 Confirmed and escalated to Medium (REN-14: no pixel cap).
- FE-8 Confirmed (REN-19). FE-9 Confirmed (REN-12). FE-11 Confirmed, extended (REN-1/3). FE-2 Confirmed, with the render amplifier REN-7. SALES-4 Confirmed, with REN-6 as its biggest term.

---

#### 5. Measurement hooks (what I want you to take)

Dataset: seed N = 50, 500, 5000 for plants, substrates, components and sales (sales via the persisted/mock path), R = 30 records per plant, K = 3 photos per plant. Use production build + `vite preview` or the Docker stack; Chrome with 4x CPU throttling and Fast 4G in a second run; disable extensions; each scenario 3 runs, report median.

- H1 Performance trace, E1: cold navigation to /tabs/plants then /tabs/sales. Report: Scripting, Rendering (Recalculate Style + Layout), Painting totals; number of DOM nodes (`document.querySelectorAll('*').length` and the same including shadow roots via a recursive count), JS heap after GC. Compare N=50/500/5000. This gives the per-card constants in section 2.
- H2 Same trace with a `performance.mark` around `ItemsOverview` `filterItems` and `sortItems`, around `SalesOverview.mappedSales`, `PlantOverview.overviewItems` and `WaterRound.rows` (temporary instrumentation in your working copy). Report ms per call and call count during one load (expect N calls for `overviewItems` during the watering warm-up).
- H3 Tab-switch trace (E3): load /tabs/sales once, switch to /tabs/components and back. Capture "Recalculate Style" and "Layout" durations and the "Layout" element count at the moment `ion-page-hidden` is removed. Repeat at N=500 and 5000. This decides REN-2.
- H4 Back-navigation (E4): open a sale, go back; trace the first 300 ms after `ionViewWillEnter`, look for `mappedSales` and `markSeen` and the long task before the transition's first frame.
- H5 Search typing (E6): type 8 characters in the plants and sales search with the trace running; report per-keystroke scripting+render ms and long-task count. Then clear the field (E7) and report the mount cost.
- H6 Scroll (E8): fast fling through N=5000 for 3 s on mobile throttling. Report frame rate, "Update layer tree"/"Pre-paint" time, and the time attributed to IntersectionObserver (`chrome://tracing` category `blink,cc` or the Performance "Timings" lane). Repeat after temporarily replacing `ion-img` with `<img loading=lazy>` in a scratch edit to isolate the observer cost.
- H7 Network waterfall for the plants list at N=500 (E9, E21): number of `/uploads/*` requests in flight over time, time to first API response (`/watering/plant/:id`) while images load (head-of-line check), protocol column (h1 or h2), connection count. Repeat with `?size=` loaders disabled.
- H8 Service worker: Application panel, Cache Storage size and entry count of `uploads` after scrolling N=500 and 1000 photos; Performance trace of the SW (worker thread) during the scroll; count IndexedDB transactions (`workbox-expiration` database) per image; hit ratio on a second pass.
- H9 Round (E13): at N=1000 plants, tap 20 rows quickly; trace per tap; also the `rows` computed duration.
- H10 Gallery (E16): plant with K=100 photos: trace open/close of the enlarge modal.
- H11 Memory: heap snapshot of the Sales page at N=5000 (retained size of `filteredItems` proxies, Stencil components, IO objects) and the count of `IntersectionObserver` instances alive (`performance.memory`, or a `Object.getPrototypeOf` counter patch).
- H12 Backend upload: upload a 10 MB 12 MP JPEG and a crafted 10 MB 16000 x 16000 flat PNG against a container with a 1 GB limit; record peak RSS, wall time, and image GET latency (p95) during a concurrent 3-upload burst. Check `UV_THREADPOOL_SIZE` effect by repeating with 16.
- H13 Headers on the wire (`curl -I`): `/uploads/<file>`, `/assets/<file>`, `/api/v2/plants` through nginx, `serve.js` and direct backend: duplicate Cache-Control, `Vary`, `Content-Encoding`, `ETag`.
- H14 nginx under load: `autocannon`/`wrk` 6 connections against `/uploads/<file>` through nginx (proxy to Node) versus a temporary `alias` location, req/s and p95.
- H15 Dark mode toggle: trace with N=5000 visible, report Recalculate Style duration.
- H16 Micro: re-run section 2 formatter benchmarks inside Chrome (`Intl.NumberFormat` construct vs cached, `wateringStatus` at R=30, 100) because V8 in Chrome may differ from node's ICU build.


---

## Appendix H: Backend and database (DBE-n)

### Deep backend scaling audit (slice: backend, prefix DBE)

Read-only. No app code changed, no tests/builds/servers run. Evidence labels: **Confirmed** (traced in code, file:line), **Measured** (run against a scratchpad database, see "How the numbers were produced"), **Suspected** (reasoned, needs your measurement hook).

Earlier audit IDs are cited as `BE-n`, `DB-n`, `SALES-n`, `IMG-n` (from `docs/performance-audit.md`). Section 7 lists confirmations, corrections and refutations of that audit.

#### 0. How the numbers were produced (read this first)

- Schema: copied from the migrated agent db (`data/agent-test/plantcare.db*`, 17 plants, tiny). Synthetic datasets were generated in the scratchpad with the **identical DDL and indexes** (read from `sqlite_master` of the copy), same pragmas as `core/database/db.ts:39-44` (WAL, FK on, cache 64 MB, temp_store MEMORY, mmap 128 MB), better-sqlite3 from `backend/node_modules`, Node 24 on a Windows SSD desktop. Absolute ms will be 2 to 5x worse on an ARM NAS/Pi; ratios and plan shapes carry over.
- Datasets (users U x plants per user P; total plants T; 1.5 images/plant, 30 watering records/plant except sE = 3, 20 percent of plants public, 5 substrates/user with 4 components, half of plant images embedded):

| id | U x P | T plants | images | watering rows | db size |
|---|---|---|---|---|---|
| sA | 1 x 20 | 20 | 30 | 600 | 0.2 MB |
| sB | 50 x 200 | 10,000 | 14.8k | 300k | ~27 MB |
| sC | 1000 x 20 | 20,000 | 31.5k | 600k | 54 MB |
| sD | 20 x 2000 | 40,000 | 59k | 1.2M | 108 MB |
| sE | 500 x 2000 | 1,000,000 | 1.48M | 3M | 1.76 GB |

- **Assumption flagged:** 20 percent public is high (`CreatePlantSchema.isPublic` defaults to false, `PlantUseCases.ts:19-24`). Public-list numbers scale linearly with the public fraction; divide by 4 for 5 percent. Everything else is independent of it.
- Scripts (rerun at your own sizes): `scratchpad/dbe-gen.cjs <out.db> <U> <P> <W> [analyze] <schemaSrc.db>`, `dbe-bench.cjs <db> <uid> [plan]` (SQL timings + EXPLAIN QUERY PLAN for 18 repository queries), `dbe-handler.cjs <db> <uid>` (replica of GET /plants: SQL + groupRows + toJSON + stringify), `dbe-vec.cjs`, `dbe-idx.cjs`, `dbe-exp.cjs`, `dbe-auth.cjs`, `dbe-kysely.cjs`, `dbe-sale.cjs`, `dbe-fjs.cjs`. The SQL strings are hand-compiled from the Kysely builders (same text shape); Kysely overhead was measured separately.
- "Blocks the loop" below means: better-sqlite3 is synchronous (`db.ts:21-24` comment, `SqliteDialect` runs `stmt.all()` in the calling tick, `kysely/dist/dialect/sqlite/sqlite-driver.js:58-61`), so the whole duration is time when **no other request, SSE write or timer runs**. There is one process, one connection, one thread for JS (`ecosystem.config.js: instances: 1`, `server.ts:30-34`).

---

#### 1. Input / entry-event inventory (backend view of every client event)

Cost vocabulary: N = rows in the named collection; T = all plants in the system; P = the caller's plants; U = users; K = images per entity; C = components per substrate; R = watering records per plant. "Hooks" = the Fastify hooks every request pays (see 2.0).

| # | Client event | Endpoint(s) hit | Server trace (auth > middleware > use case > repo > SQL > serialize) | Complexity |
|---|---|---|---|---|
| 1 | Cold app start, token still valid | none, or `POST /auth/refresh-token` | cookie parse, `verifyRefreshToken` (jwt.verify), `sessionStore.has` (array filter), `signAccessToken` | O(1), ~0.1 ms |
| 2 | Cold start after a **server restart** | `POST /auth/refresh-token` -> 401, then `POST /auth/login` | sessions are an in-memory Map (`core/auth/sessions.ts:35`), lost on restart; refresh fails (`AuthUseCases.ts` RefreshTokenUseCase), user must log in; bcryptjs compare 50 ms blocking | O(U) logins x 50 ms loop block after every deploy (DBE-5) |
| 3 | Login submit | `POST /auth/login` | ipLimiter + accountLimiter (LRU, ~5 us), `findByUsername` (unique NOCASE index, 1 row), `bcrypt.compare`, `issueSession`, `jwt.sign` x2, `Set-Cookie` | 50 ms main-thread CPU, O(1) rows |
| 4 | Guest button | `POST /auth/login/guest` | ipLimiter, `findByUsername('guest')`, session list for user 0 (up to 1000 entries, filter+alloc per call, 11 us measured) | O(1) |
| 5 | Register | `POST /auth/register` | 2 limiters, `findByUsername`, bcrypt.hash 50 ms, 2 role selects + insert | 50 ms block |
| 6 | Access token expiry (15 min) / app resume / visibility | `POST /auth/refresh-token` | as #1 | O(1) per client; U clients x 4/h |
| 7 | Plants tab enter (store stale) / pull to refresh | `GET /plants` (opt auth) | 2 jwt.verify at most, **`findAllPublic` (all users) + `findAllByUser`**, JS grouping per image row, merge+dedupe, `toJSON`, `JSON.stringify` | **O(f*T + P) rows, sync**, 28 ms at T=20k, 76 ms at T=40k, 2.9 s at T=1M (DBE-1) |
| 8 | Plants list shows "due" state | `GET /watering/plant/:id` x P (3 parallel) | per request: hooks, 2 jwt.verify (66 us), Kysely compile+prepare (75 us), join `watering_records` x `plants` on idx_watering_history, unbounded rows, map, stringify | O(P) requests x O(R) rows each; 0.25 to 0.35 ms main-thread per request (DBE-6) |
| 9 | Plant detail enter | `GET /plants/:id` (+ `GET /watering/plant/:id`, `GET /watering/fertilizer-types`) | `findById` PK lookup + images by idx_images_lookup + temp sort of K rows | O(K), 0.02 ms SQL |
| 10 | Add plant | `POST /plants` | zod, `isSubstrateUsableBy` (1 PK select), tx: species resolve (rebuilds resolver, BE-8) + insert, then `findById` | 4 to 6 queries, 0.5 ms |
| 11 | Edit plant | `PATCH /plants/:id` | `findById`, substrate check, tx update, `findById` (read-after-write x2) | 5 queries |
| 12 | Delete plant | `DELETE /plants/:id` | `DELETE plants` + FK cascade to `watering_records` (index seek), then `images.removeAll` (tx select + delete + N file unlinks) | O(R + K), 30 ms for 2000 plants x 30 records measured (cascade of one user's whole garden) |
| 13 | Photo upload (add/replace) | `POST /images/plant/:id` | multipart `attachFieldsToBody` buffers whole file (<=10 MB) in RAM, access policy (1 PK select), EXIF parse sync, sharp resize+webp `nearLossless` on libuv/libvips threads, insert, `onStored` -> embed queue (ONNX) | CPU 100 to 400 ms per photo off-thread, 10 MB RAM per concurrent upload |
| 14 | Image render | `GET /uploads/<type>/<file>` (static, also `?size=` which is ignored) | `@fastify/static` -> `send`: stat + open + read stream on libuv pool, ETag/Last-Modified, `max-age=0` | 3 threadpool ops per image; 4 pool threads (DBE-11) |
| 15 | Watering add / edit / delete | `POST/PATCH/DELETE /watering/...` | insert with `WHERE EXISTS(plants...)`, then `findById`; update/delete use `plant_id IN (SELECT id FROM plants WHERE user_id=?)` which **scans the plants index** | O(T) per write: 0.35 ms at T=10k, 1.6 ms at 40k, 37 ms at 1M (DBE-3) |
| 16 | Watering round (enter) | `GET /plants` + `GET /watering/plant/:id` x P + `GET /recognition/status` | as #7 and #8 | O(T) + O(P x R) |
| 17 | Watering round submit | `POST /watering/batch` (<=200 entries) | zod, tx: owned-plants select (`IN` list), 200 awaited inserts in one tx | O(200), ~10 ms |
| 18 | Watering round undo | `POST /watering/batch/delete` | tx: join select + delete `IN` | O(200) |
| 19 | Snap to log | `POST /recognition/match` | auth, 10 MB multipart buffer, sharp decode+resize+webp, ONNX embed (serial global queue, cap 8, 429 beyond), **`vectorsForUser` scans every plant image in the system**, JS brute-force dot product, snapshot file write | O(all plant images) SQL + O(V x 384) rank (DBE-4) |
| 20 | Snap confirm | `POST /recognition/snapshots/:id/confirm` | `createWatering.execute` (2 queries), copy file, insert image, insert embedding | O(1) |
| 21 | Substrates tab enter | `GET /substrates` | `findAllPublic` + `findAllByUser`, each joins components x images (cartesian C x K rows) with `.find` dedupe, temp sort | O(S x C x K) rows, O(rows x (C+K)) JS (DBE-8) |
| 22 | Substrate add/edit/components/delete | `POST/PATCH/DELETE /substrates...` | `findById` (full join) x2, per-row awaited inserts in tx; delete -> `plants.substrate_id ON DELETE SET NULL` **scans plants** | delete: 66 ms at T=1M (DBE-3) |
| 23 | Components tab enter | `GET /components` | single join + temp sort; admin-managed catalog, small and user-independent | O(components x K), tiny |
| 24 | Sales tab enter / pull to refresh | `POST /auth/ticket` then `GET /sales?ticket=` (SSE) | ticket limiter + `randomBytes(32)`; burn ticket; `FetchSalesOverview`: 31 jobs through shared limiters (8 axios, 2 Chromium); warm cache path: `Sale.fromRaw` (URL parse + SHA1), dedupe Set, 2x `JSON.stringify` per item; **no gzip on SSE** | warm: ~7 us/item (21 ms per 3000 items) + ~1.1 MB; cold or failing source: seconds (DBE-10) |
| 25 | Admin health open / recheck | `GET /sales/health`, `POST /sales/health/:key/check` | 1 small select (~20 rows); recheck = one scrape | O(sources) |
| 26 | Care guide open | `POST /auth/ticket`, `GET /more-info?...` (SSE) | ticket, `loadUserFromDb` (1 select), 3 link searchers (axios + HTML parse sync), OpenAI stream, 12 h in-process cache | O(1) DB; external-bound |
| 27 | Profile update / delete | `PATCH /auth/me`, `DELETE /auth/me` | bcrypt.hash 50 ms; delete: `DELETE users` -> FK checks scan `plants`/`substrates` (88 to 114 ms measured), **fails with FK error if the user owns substrates**, never removes image files | DBE-12 |
| 28 | Health probe (docker 30 s) | `GET /health/ready` | `SELECT 1` | negligible |
| 29 | Boot | none | migrations (kysely lock + 6 tiny checks), ONNX session load (awaited before listen, `recognition/index.ts:31-32`), `purgeOrphans` + `plantImagesMissing` + sequential embedding after ready (`recognitionRoutes.ts:22-26`) | O(all images) at every boot (DBE-14) |
| 30 | Online/offline, theme, i18n, reminders | none (client only) | no backend cost | n/a |

##### 1.1 Per-request cost common to every route (2.0)

Order of hooks (`app.ts`): CORS origin fn (`:93`), cookie parse (`:102`), rate-limit plugin (global:false, no per-request cost, `rateLimit.ts:25`), request-context hook (`requestId.ts:34-39`: header set + `AsyncLocalStorage.run`), guest-read-only hook (`app.ts:121`, returns at once for GET; for POST/PATCH/DELETE it runs `readAccessSession`, a third `jwt.verify`), then the route's `onRequest` (`authenticateToken`: `isValidAccessToken` = verify #1, `readAccessSession` = verify #2 plus a session-array filter). Measured: `jwt.verify` HS256 = 33 us each, guest session `has()` with 1000 sessions = 11 us, Kysely compile+prepare+execute for a small join = 62 to 75 us vs 10.7 us raw prepared (`kysely/dist/dialect/sqlite/sqlite-driver.js:58` calls `db.prepare(sql)` every execution, no statement cache). Fastify default JSON serialization (no schemas anywhere, `grep schema:` empty). No compression, no ETag, no Cache-Control on any API JSON (`grep` empty outside `imageController.ts:127`). No access logging (only error and 4xx warn lines, `errorHandler.ts:79-83`).

---

#### 2. Per-endpoint cost table (auth path, middleware, queries, rows as f(N), JSON size, serialization)

Auth key: none; opt = optional bearer; user = bearer JWT + in-memory session; admin = user + role; ticket = one-time SSE ticket. JSON sizes are measured (plant = 477 B average with 1.5 images; watering record = 170 B; substrate with 4 comps + 1 image = 310 B).

| Endpoint | Auth path | Queries (SQL shape) | Rows touched as f(N) | JSON size | Serialization |
|---|---|---|---|---|---|
| `GET /plants` | opt: verify x2 (or exception on bad token, swallowed) | 2: `plants LEFT JOIN species, substrates, images WHERE is_public=1 ORDER BY created_at DESC, upload_date, id` and the same `WHERE user_id=?`; plan: `SEARCH p USING INDEX idx_plants_list (is_public=?)` + temp B-tree; private: `SCAN p` (no stats) or skip-scan (with stats) + temp B-tree | 1.5 x (f*T + P) rows; JS: Map group per row, `toPublicImageUrl` per image (regex + ALS `getStore`), Plant objects, dedupe Set | 477 B x (f*T + (1-f)*P): 1.9 MB at T=20k, 4.6 MB at T=40k, 99 MB at T=1M (gzip 15x smaller) | `JSON.stringify` of whole array, single string, held until client drains (nginx `proxy_buffering off`) |
| `GET /plants/:id` | opt | 1: same join `WHERE p.id=?` | PK + K image rows | ~1 KB | stringify |
| `POST /plants` | user (+ guest hook verify) | assert substrate (1), tx (species select [+insert], insert), `findById` | O(K) | ~1 KB | stringify |
| `PATCH /plants/:id` | user | `findById`, assert, tx(update), `findById` | O(K) x2 | ~1 KB | stringify |
| `DELETE /plants/:id` | user | delete + cascade, images tx (select, delete), unlinks | O(R + K) | none | none |
| `GET /watering/plant/:id` | user | 1: `watering_records JOIN plants JOIN fertilizer_types WHERE plant_id=? AND p.user_id=?`, no ORDER BY, no LIMIT; plan `SEARCH wr USING INDEX idx_watering_history (plant_id=?)` | O(R) | 170 B x R (30 recs = 5 KB, 780 recs = 130 KB); repeats `plant_name`, `owner_id` per row | stringify |
| `POST /watering/:plantId` | user | 1 insert-select with `EXISTS(plants)` + `findById` (join) | O(1) | ~0.2 KB | stringify |
| `PATCH/DELETE /watering/:id` | user | update/delete with `plant_id IN (SELECT id FROM plants WHERE user_id=?)`; plan `LIST SUBQUERY` + `SCAN plants USING COVERING INDEX idx_plants_list` (or user-prefixed search after stats) | O(T) or O(P) | ~0.2 KB | stringify |
| `POST /watering/batch`, `/batch/delete` | user | tx: 1 select + up to 200 inserts / 1 select + 1 delete | O(200) | ids | stringify |
| `GET /substrates` | opt | 2 joins `substrates x substrate_components x components x fineness x images ORDER BY upload_date, id`; plan `SCAN s` (no index on user_id/is_public) + temp sort | S x C x K rows; JS `.find` per row (`SQLiteSubstrateRepository.ts:173,182`) | ~310 B each, 1.2 MB for 4000 rows | stringify |
| `GET /components` | user | 1 join | components x K | small | stringify |
| `POST /images/:type/:id` | user | access (1 PK select), insert; file via sharp | O(1) | ~0.1 KB | stringify |
| `GET /images/:type/:id?size=` | user | access + `findByEntity` (idx + temp sort) + sharp decode/resize/encode **per request, uncached**; **unused by the frontend** (frontend hits `/uploads/...`) | O(K) | up to ~100 KB webp | Buffer send |
| `GET /uploads/*` | none | none (static) | n/a | file | stream |
| `POST /recognition/match` | user | `vectorsForUser`: plan `SEARCH i USING COVERING INDEX idx_images_lookup (entity_type=?)`, PK probes of `e` and `p`, filter `p.user_id` after the fact; plus `findByUser`-free brute-force rank | O(all plant images in system) rows scanned, V vectors (1.5 KB each) copied | ~1 KB | stringify |
| `POST /auth/ticket` | user + limiter | none | O(1) | 0.1 KB | stringify |
| `GET /sales`, `GET /more-info` | ticket (no jwt) | `/more-info`: 1 user select; `/sales`: none (health upsert only on page 1 cache miss) | n/a | SSE frames <= 16 KB each, ~1.1 MB per 3000 items | `JSON.stringify` twice per item (size probe + batch emit, `SseManager.ts:121-129`) |

---

#### 3. Scaling table (main-thread-blocking time per entry event, measured unless marked)

Columns = datasets above. "ms" = synchronous time during which the process serves nothing else. Thresholds: yellow > 16 ms, orange > 50 ms, red > 200 ms.

| Event | A (T=20) | B (T=10k) | C (T=20k, U=1000) | D (T=40k, P=2000) | E (T=1M, U=500, P=2000) | 1000 x 2000 (T=2M, extrapolated) |
|---|---|---|---|---|---|---|
| `GET /plants` total loop block (SQL pub + SQL priv + group + merge + stringify) | <1 | 9 | **28** (>16) | **76** (>50) | **2,900** (>200) | ~5,800 |
| same, response body | 8 KB | 1.0 MB | 1.9 MB | 4.6 MB | 99 MB (gzip 6.6 MB) | ~200 MB |
| `GET /plants` SQL private part only | 0.09 | 0.9 | 0.9 | 9.6 | 39 | ~78 (full scan, no stats) |
| same, with `PRAGMA optimize`/`ANALYZE` or `plants(user_id, created_at DESC)` | 0.04 | ~0.1 | 0.04 | 6.3 (2953-row sort and materialize) | ~6 | ~6 |
| `GET /substrates` SQL (public + own) | 0.1 | 0.5 | **13** | 0.1 | 10 | ~20 |
| `GET /watering/plant/:id` x P (N+1 as one Plants-tab entry), server main-thread total | 5 ms (20 req) | 50 ms (200 req) | 5 ms (20 req) | **500-700 ms (2000 req)** and 10 MB (30 rec/plant) to 160 MB (780 rec/plant) | same per user | same per user |
| `PATCH/DELETE /watering/:id` ownership scan | 0.03 | 0.35 | 0.75 | 1.6 | **37** | ~75 |
| `POST /recognition/match` SQL (`vectorsForUser`) | 0.07 | 4.7 | **15.7** (15 vectors) | **29** (1477 vectors, 2.2 MB read) | **2,137** (same 1477 vectors, scans 1.48M images) | ~4,300 |
| same with plants-first query shape (`plants CROSS JOIN images CROSS JOIN image_embeddings`) and user index | 0.05 | ~1 | ~0.1 | **3.7** | ~3.7 | ~3.7 |
| Boot `plantImagesMissing` (all rows into memory) | 0.04 | 8.5 | 34 | 51 | **3,065** (738k rows, 67 MB) | ~6,100 |
| Boot `purgeOrphans` (NOT IN scan) | 0 | 1.7 | 7.4 | 11 | **2,069** | ~4,100 |
| Login or register (bcryptjs cost 10) | 50 | 50 | 50 | 50 | 50 | 50 (x U after a restart) |
| Delete substrate (plants.substrate_id SET NULL scan) | 0 | 0.2 | 1.1 | 1.5 | **66** | ~130 |
| Delete user, **failing** FK (substrate owner) | n/a | n/a | n/a | 88 | **114** | ~230 |
| Delete one user's 2000 plants (cascade 60k watering rows) | n/a | n/a | n/a | 31 | 29 | 30 |
| Sales warm visit (3000 cached items, synthetic) | 21 ms + 1.1 MB per visit regardless of T | | | | | |

Concurrency effect (Suspected, queueing arithmetic on the numbers above): with a 76 ms `GET /plants` and 20 active users opening the Plants tab within 1 s, the last requester waits ~1.5 s for the loop alone, and every unrelated request (login, watering tap, image GET, SSE frame) in that window shares the stall. At T=1M a single GET stalls everything for ~3 s and allocates well over 300 MB (295k row objects plus a 99 MB string; RSS not measured, hook M2).

Memory per request at E: rows array (295k objects with 12 string/number fields) + grouped Maps + `Plant` objects + 99 MB JSON string. Two concurrent calls double it. No `--max-old-space-size`, no `mem_limit` (`docker-compose.yml`), so this OOM-kills the process before it degrades gracefully.

---

#### 4. Findings

Severity is for the scaling scenarios the user cares about (many users, many plants), not for the current seed data.

##### DBE-1 (Critical, Confirmed + Measured): `GET /plants` and `GET /substrates` return the whole platform's public rows, unbounded, recomputed and serialized synchronously on every call

- Evidence: `PlantUseCases.ts:73-86` (`Promise.all([findAllPublic(), findAllByUser()])`, JS dedupe); `SQLitePlantRepository.ts:55-63` (`WHERE p.is_public = 1`, no limit, no user scoping); `:152-190` (JS grouping per joined row); `plantsController.ts:56-60` (`plants.map(p => p.toJSON())`); same pattern in `SubstrateUseCases.ts` GetAllSubstratesUseCase and `SQLiteSubstrateRepository.ts:50-56`. Plan (measured): `SEARCH p USING INDEX idx_plants_list (is_public=?)` then `USE TEMP B-TREE FOR ORDER BY`.
- Root cause: one endpoint answers three different questions (my garden, the community feed, lookup by id) with no scope parameter, no page size, no cursor, no validator, and the cost is O(all public plants of all users) per call per client. A user with 20 plants pays for 1000 strangers' public plants. It is also a noisy-neighbour channel: one user marking 2000 plants public slows everyone's Plants tab.
- Measured: handler replica (SQL + group + dedupe + stringify): 28 ms/1.9 MB at 20k plants, 76 ms/4.6 MB at 40k, 2.9 s/99 MB at 1M (20 percent public).
- Fix (architectural): split by scope and page the unbounded one. (a) `GET /plants?scope=mine` (own, small, keyset-free but ETag-able) and `GET /plants?scope=public&cursor=<created_at,id>&limit=50` backed by the partial index `plants(created_at DESC, id DESC) WHERE is_public=1`; (b) list items carry `cover` + `imageCount` (+ `lastWateredAt`, see DBE-6), `images[]` only on `GET /plants/:id`; (c) weak ETag from `MAX(updated_at)`/row-count revision per scope so refresh returns 304 without building rows (needs `updated_at` columns, one migration); (d) emit relative image paths plus one `imageBase` field instead of an absolute origin per image (about 25 to 35 B of the 150 B per image ref, `config/uploads.ts:35-40`). Layers: repository (`PlantRepository` port gets `listMine`, `listPublicPage`), use cases, controller, routes, migration, frontend store contract (plants store `fetchAll`/`isStale` gains scope/pagination).
- Expected impact: Plants tab server cost becomes O(P) for own list (about 0.1 ms with the user index), public tab O(page); at T=1M from 2.9 s to under 10 ms; bytes from 99 MB to ~25 KB per page.
- Effort L (contract + UI), risk medium (store/UI consumers). Dependencies: DBE-3 indexes; frontend agent for pagination UI. Confirms and quantifies BE-2 (which asked for limit/cursor on public; this adds the measured blow-up and the ETag/partial-index design).

##### DBE-2 (High, Confirmed + Measured): There is no bounded-work contract on the single event loop; any list or boot query can freeze every request

- Evidence: `db.ts:21-24` ("One connection per process: better-sqlite3 is synchronous"), `sqlite-driver.js:58-61`; no `worker_threads` anywhere (grep), no `monitorEventLoopDelay`; list routes return full result sets (DBE-1, DBE-6); boot queries (`SQLiteEmbeddingRepository.ts:35-52`) pull full tables.
- Measured blockers on this machine: GET /plants 28 to 2,900 ms; vectorsForUser 16 to 2,137 ms; imagesMissing 34 to 3,065 ms; purgeOrphans 7 to 2,069 ms; bcryptjs 49 to 52 ms per login; failing user delete 88 to 114 ms; Sales warm visit 21 ms per 3000 items; HTML parse per scraped page tens of ms (BE-6, Suspected).
- Root cause: repositories return `Promise<T[]>` for arbitrary result sizes and nothing in the layering (use case, repository port) expresses a row budget, so every new list inherits O(N) sync work. The async-looking API hides that these promises resolve in the same tick.
- Fix: (1) a repository-level convention enforced in the port types: list methods take `{limit, cursor}` and cap at a constant in `core/config/constants.ts`; (2) one `core/database/readWorker.ts` (worker_threads with its own read-only connection; WAL permits concurrent readers) for the few inherently heavy reads (recognition vectors, boot backfill scan) behind the same repository interface; (3) add `monitorEventLoopDelay` histogram exposed on `/health` so regressions are visible. Layers: core/database, repository ports, composition roots.
- Expected impact: removes the class of "one request stalls all". Effort M (convention + worker for 2 queries). Risk low. Dependencies: DBE-1, DBE-4.

##### DBE-3 (High, Confirmed + Measured): No index serves `plants.user_id`, `plants.substrate_id`, `substrates.user_id/is_public`, `substrate_components.component_id`; statistics never exist; many hot paths scan whole tables

- Evidence: only `idx_plants_list(is_public, user_id)`, `idx_images_lookup(entity_type, entity_id)`, `idx_watering_history(plant_id, date DESC)` exist (`0001_baseline.ts:101-103`); no `ANALYZE`/`optimize` anywhere (grep of `src` empty; `db.ts:38-45`). EXPLAIN (measured, no stats): `plantsPrivate` = `SCAN p` + temp sort; watering update/delete = `LIST SUBQUERY` + `SCAN plants USING COVERING INDEX idx_plants_list`; `deleteSubstrateFk` = `SCAN plants`; `subCompByComponent` = `SCAN substrate_components`; `vectorsForUser` = `SEARCH i USING COVERING INDEX idx_images_lookup (entity_type=?)` (all plant images).
- Root cause: index set never revisited after the list queries changed (DB-1, DB-2, DB-4 said this qualitatively). SQLite's skip-scan on `(is_public, user_id)` appears only with `sqlite_stat1`; without it the ownership predicate is a full scan.
- Measured effect: `PRAGMA optimize` on a fresh connection created `sqlite_stat1` (9 rows) and turned `SCAN p` into `SEARCH p USING INDEX idx_plants_list (ANY(is_public) AND user_id=?)`: plants private 0.92 ms to 0.04 ms at T=20k, `vectorsForUser` 15.7 ms to 0.04 ms. With explicit indexes (`plants(user_id, created_at DESC)`, `plants(substrate_id) WHERE substrate_id IS NOT NULL`, `substrate_components(component_id)`, `substrates(user_id)`) the watering ownership check and substrate/component deletes become seeks (0.13 ms vs 1.6 ms at T=40k; `plantsBySubstrate` 1.5 ms to 0.01 ms). Caveat: after the indexes alone, SQLite still chose the image-first plan for `vectorsForUser` (see DBE-4), so query shape matters as much as indexes.
- Fix: new migration `0006` with the four indexes above plus a covering `images(entity_type, entity_id, upload_date, id)` (removes the per-lookup sort; build 144 ms on 59k images), run `PRAGMA optimize` after migrations on boot and on `closeDb()` (and `PRAGMA analysis_limit=1000` first). Do not rely on stats alone. Layers: `core/database/migrations`, `db.ts`. Effort S, risk low (write amplification: 3 extra index entries per plant insert, negligible).
- Confirms DB-1, DB-2, DB-3 (sort columns), DB-4; adds the measured effect and the `vectorsForUser` and delete-cascade victims that the first audit did not list.

##### DBE-4 (High, Confirmed + Measured): Plant recognition does O(all plant images in the system) work per match and per boot

- Evidence: `SQLiteEmbeddingRepository.ts:18-33` (`vectorsForUser`), plan above; `:35-45` `plantImagesMissing` returns every un-embedded row at once; `:47-52` `purgeOrphans` runs `NOT IN (SELECT id FROM images)` on every boot although `image_embeddings.image_id` already has `REFERENCES images(id) ON DELETE CASCADE` (`0005_image_embeddings.ts`) with FKs on; `recognitionRoutes.ts:22-26` runs backfill on every `onReady`; `EmbedImages.ts:25-35` embeds sequentially with no pacing; `OnnxEmbedder.ts:60-78` single global promise-chain queue, cap 8 then `EmbedderBusyError` -> 429 to users.
- Measured: `vectorsForUser` 2,137 ms at 1.48M images for a user with 1477 vectors; the same query shape starting from `plants` is 3.7 ms. Reading 1477 BLOBs and copying each into a `Float32Array` is 2.6 ms; ranking 4000 vectors of 384 floats is 3.4 ms (so the brute force itself is fine until ~50k vectors). Boot: 3.1 s for the missing-set read plus 2.1 s purge at 1.5M images, both on the loop right after listen.
- Root cause: the query starts from the largest table because the planner has no stats and the predicate `p.user_id` is applied last; there is no owner column on the embedding row; the boot repair job has no pagination, pacing or idempotent short-circuit.
- Fix: (1) write the query plants-first (explicit join order or a subselect `WHERE i.entity_id IN (SELECT id FROM plants WHERE user_id=?)`) behind the existing `EmbeddingRepository.vectorsForUser`, and denormalize `plant_id` into `image_embeddings` with an index so the join disappears; (2) drop `purgeOrphans` (the FK cascade covers it; keep a one-time migration for pre-FK data); (3) backfill as a paced job: `LIMIT 50` batches, `setImmediate` yield between embeds, resumable (the `LEFT JOIN ... IS NULL` set is the queue), skip when the set is empty via a cheap `EXISTS`; (4) per-user vector matrix cache invalidated on image add/delete only if match volume is high (BE-13's suggestion, not needed before 10k vectors per user). Layers: recognition infra repo, `EmbedImages` service, migration. Effort S to M, risk low.
- Capacity note (Suspected, not measured): the ONNX embed is one inference at a time process-wide; at an estimated 80 to 250 ms per image (sharp x2 + DINOv2-small q8), the system matches 4 to 12 snaps per second in total and returns 429 beyond 8 queued. Backfill of 100k images would occupy it for hours and starve user matches. Hook M7.

##### DBE-5 (High, Confirmed + Measured, partly Suspected topology): A server restart logs everyone out; logging back in costs 50 ms of blocked loop each; the IP rate limit may be one bucket for everybody behind a TLS proxy

- Evidence: sessions are `Map<number, Session[]>` in process memory (`sessions.ts:35`); refresh requires `sessionStore.has` (`AuthUseCases.ts` RefreshTokenUseCase) and every request requires it (`tokens.ts:83-91`, `auth.ts:25`). bcryptjs `compare` measured 52.6 ms with a **maximum event-loop gap of 49 ms during it** (`bcryptjs/index.js:529` `MAX_EXECUTION_TIME = 100`: it only yields after 100 ms of continuous work, so cost 10 at ~50 ms never yields). `ipLimiter` (`authRoutes.ts:65-68`) allows 50 requests per IP per 15 min across register, login, guest (`constants.ts:42-47`). `app.ts:65` `trustProxy: (_a, hop) => hop < 1` trusts exactly one hop; `frontend/nginx.conf:41-45` appends `$remote_addr` to `X-Forwarded-For`; `docker-compose.yml:9-10` says a TLS-terminating proxy is expected in front of nginx. Then the only trusted hop is the nginx container, `request.ip` resolves to the **outer proxy's address** for every client (reasoned from proxy-addr semantics, not captured).
- Root cause: authentication state that must survive restarts lives in RAM; password hashing runs on the request thread; the limiter key assumes direct client IPs.
- Effect: after every deploy or crash, U users hit refresh 401, then U logins x 50 ms = U x 50 ms of main-thread CPU (1000 users: 50 s of stalls spread over the reconnect wave, 150 to 300 ms each on ARM), and if the shared-IP topology is real, only 50 logins per 15 minutes succeed for the whole deployment, the rest get 429 for up to 15 minutes. Guests are hit too (shared guest account, same `ipLimiter`).
- Fix: (1) persist sessions: table `sessions(sid PK, user_id, expires_at)` with `idx(user_id)`, and let `sessionStore` keep a read-through LRU; or make refresh tokens self-validating via a per-user `token_version` column (no per-session table needed). (2) Replace bcryptjs with the native `bcrypt` or `crypto.scrypt` (libuv pool, not the loop) behind the existing hasher call sites with a hash-prefix/rehash-on-login upgrade. (3) Key `ipLimiter` on the real client IP by trusting the configured proxy count (`TRUST_PROXY_HOPS` env, default 1, set 2 behind an outer proxy) and cap per-account only for credential stuffing. Layers: `core/auth/sessions.ts`, `AuthUseCases`, `app.ts`, migration. Effort M, risk medium (token/cookie compatibility; users re-login once at cutover).
- Corrects BE-7 ("yields between rounds but still consumes the loop"): measured, it does not yield at cost 10. Raises BE-11 from Low (CPU negligible) to High (restart wave).

##### DBE-6 (High, Confirmed + Measured): The watering API shape forces N+1 and unbounded per-plant history; "last watered" should be a column or a bounded subquery

- Evidence: `SQLiteWateringRepository.ts:43-49` (no ORDER BY, no LIMIT, join to `plants`); `wateringRoutes.ts:19`; frontend `stores/watering.ts:96-111` (3-way parallel `ensureRecords` per plant), `PlantOverview.vue:172` (`warmWateringRecords`), `WaterRound.vue:326`; response repeats `plant_name` and `owner_id` per record (`WateringRecordData`).
- Cost: per request 66 us auth + 75 us Kysely + ~20 us serialize + hooks = 0.25 to 0.35 ms of loop time; one Plants-tab entry with P=2000 is ~2000 requests, ~0.6 s of server CPU and R x 170 B per plant (30 records: 10 MB total; 780 records, three waterings a week for five years: 160 MB). Unbounded growth: nothing ever deletes watering rows; `deleteAfterThirty` is a client-only reminder setting.
- Measured alternative: `SELECT p.id, (SELECT max(date) FROM watering_records w WHERE w.plant_id=p.id) FROM plants p WHERE user_id=?` for 2000 plants = 3.3 ms (D) and 18.8 ms (E, cold cache), using `idx_watering_history` as a seek per plant. A `GROUP BY` over the same rows is 591 ms and 1,850 ms, so do not aggregate that way. "Last fertilized" needs its own seek: index `(plant_id, used_fertilizer, date)` or a partial `WHERE used_fertilizer=1`.
- Fix: denormalize `plants.last_watered_at` and `last_fertilized_at` (and `watering_count`), maintained in the same transaction as every watering insert/update/delete (use cases already read-after-write; `createMany`/`deleteMany` already run in tx), return them in the list item (DBE-1), and give `GET /watering/plant/:id` `?from=&to=&limit=` with `ORDER BY date DESC, id DESC` served by `idx_watering_history`. Drop `plant_name`/`owner_id` from the record payload (the client has both). Layers: migration (backfill), `WateringRepository`, `PlantRepository`, controllers, frontend watering store (derive due state from list). Effort M, risk medium (denormalization drift: add a repair on boot or a trigger-based version). Confirms BE-1/DB-7 and gives measured costs and the correlated-subquery vs group-by result.

##### DBE-7 (Medium, Confirmed + Measured): List payloads are fat and revalidation is impossible

- Evidence: absolute `http://origin` string per image (`config/uploads.ts:35-40`, called per row at `SQLitePlantRepository.ts:170-174` and `SQLiteSubstrateRepository.ts:184`), full `images[]` in list items, no ETag/Last-Modified/Cache-Control on JSON (grep), no `@fastify/compress` (`package.json`), nginx gzip covers `application/json` but **not `text/event-stream`** (`frontend/nginx.conf:26-28`), so the Sales stream always leaves uncompressed.
- Measured: gzip ratio 15 to 16x on plant lists (1.93 MB to 128 KB, 4.58 MB to 244 KB, 99 MB to 6.6 MB); `fast-json-stringify` with a full schema gives **no speedup** on this shape (7 ms vs 6 ms for 5.2 MB), so response schemas are not worth it for speed (see section 7, BE-16 refuted).
- Fix: ETag/304 per scope (DBE-1), `@fastify/compress` for the non-nginx path, relative image paths + one `imageBase`, `Cache-Control: private, no-cache` on lists, add `text/event-stream` handling decision (compressing SSE trades latency for bytes; cheaper is shrinking the Sales item, SALES-7). Effort S for compress/ETag, M for contract. Risk low.

##### DBE-8 (Medium, Confirmed + Measured): Substrate and component lists build a components x images cartesian product and scan unindexed owner columns

- Evidence: `SQLiteSubstrateRepository.ts:21-45` (two one-to-many joins in one select), `:173,182` (`Array.find` per row), plan `SCAN s` + temp sort for both `user_id=?` and `is_public=1`; components same shape (`SQLiteComponentRepository.ts:21-35,104`).
- Measured: 4000 public substrate rows (1000 users x 1 public substrate x 4 components) = 13 ms and 1.2 MB; a substrate with 7 components and 5 photos yields 35 rows (BE-3 arithmetic) so a list of 200 public substrates is 7000 rows.
- Fix: load substrates (paged, indexed on `user_id` and partial `is_public`), then components and images in two `IN (ids)` queries (or `json_group_array` subselects) and assemble in Maps (O(C + K) instead of O(C x K)). Layers: substrate repository, migration (indexes from DBE-3). Effort S. Confirms BE-3, DB-2.

##### DBE-9 (Medium, Confirmed + Measured): Every query pays a fresh `prepare` and a Kysely compile; mutations re-read twice

- Evidence: `kysely/dist/dialect/sqlite/sqlite-driver.js:58` (`db.prepare(sql)` per execution), `PlantUseCases.ts:121-140` (update = `findById` + check + update + `findById`), `SubstrateUseCases.ts` update, `WateringUseCases.ts:127-170`.
- Measured: Kysely plant-by-id 62 us, watering-by-plant 75 us per query vs 10.7 us for the same SQL on a cached prepared statement (5 to 7x). Matters when the same endpoint is called 2000 times (DBE-6) or for `createMany` (200 awaited inserts, each a Kysely round trip).
- Fix: a statement cache in a thin `core/database` dialect wrapper (`Map<sql, Statement>`, bounded), multi-row `insertInto().values([...])` in batches, and return the post-write read inside the same transaction. Effort M, risk low. Confirms BE-15, adds the 5 to 7x number.

##### DBE-10 (Medium, Confirmed, infra aspect only): Failed scrape pages are never cached and are retried on every visit, holding limiter slots

- Evidence: `BaseScraper.ts:136` (`if (accepted) this.cache.set`), so a source whose strategies all fail is refetched by every Sales entry; `HttpFetcher.ts:71-92` retries network errors and 5xx twice with sleeps of 2 s and 4 s (6 s) while holding one of the 8 shared axios slots (`FetchSalesOverview.ts:61-62`, one `FetchSalesOverview` per process, `salesController.ts:20`); 15 s axios timeout; Chromium pages wait 1.5 s + 1 s fixed (`HttpFetcher.ts` `waitForTimeout`) on 2 slots. Health upsert is one row per source (`SQLiteSourceHealthRepository.ts:upsert ON CONFLICT`): bounded, not growing.
- Effect: any permanently failing or blocked shop makes every visit of every user pay its timeouts again and starves healthy shops of slots; time to first full list rises with the number of broken sources, not with data size. Warm path for healthy sources is cheap (21 ms CPU per 3000 items) but ships ~1.1 MB uncompressed per visit because the response is rebuilt per request (`sale_scraped_at = now`, `Sale.ts fromRaw`), see SALES-7.
- Fix: negative cache with short TTL and backoff keyed by `source_key_page`, and the SALES-1/BE-4 refresher so user requests never scrape. Layers: `BaseScraper`, cache adapter. Effort S for negative cache. Overlaps SALES agent.

##### DBE-11 (Medium, Confirmed config, impact Suspected): All heavy native work shares the 4-thread libuv pool and unbounded buffers

- Evidence: no `UV_THREADPOOL_SIZE`, no `sharp.concurrency/cache` (grep); pool users: `fs` for static uploads (`app.ts:109`), sharp (`LocalImageStorage.ts`), ONNX `session.run` (`OnnxEmbedder.ts:73`), DNS lookups of scrapers (`HttpFetcher.ts` `dns.setDefaultResultOrder`), `randomBytes`. Uploads fully buffered (`multipartUpload.ts:40`, `imageRoutes.ts:49` `attachFieldsToBody: true`, limit 10 MB). `GET /images/:type/:id?size=` re-decodes and re-encodes on every request with no cache (`LocalImageStorage.ts:140-155`), and the frontend never calls it (frontend loads `/uploads/...?size=` which static ignores, IMG-1). Encoding uses `nearLossless` (`:121`).
- Effect: a burst of uploads or a 2000-image grid load (3 pool operations per static file) queues behind sharp and ONNX jobs; image GET latency becomes a function of unrelated work. Hook M10.
- Fix: `UV_THREADPOOL_SIZE=8..16` in Dockerfile/ecosystem; `sharp.concurrency(2)`; generate fixed variants (160/480/1024) at upload time (IMG-1/IMG-7) and serve them statically with `maxAge` + `immutable`, deleting the on-the-fly resize route; per-user upload limiter (BE-17). Effort S to M, risk low.

##### DBE-12 (Medium, Confirmed + Executed on a copy): Account deletion fails for substrate owners, costs 88 to 114 ms to fail, and never removes image files or rows

- Evidence: `AuthUseCases.ts` DeleteProfileUseCase -> `SQLiteUserRepository.delete` (`DELETE FROM users WHERE id=?`), `substrates.user_id REFERENCES users(id)` without `ON DELETE` (`0001_baseline.ts:41`); executed against sD and sE copies: `SQLITE_CONSTRAINT_FOREIGNKEY` after 88 ms and 114 ms (FK parent-delete checks scan `plants` and `substrates`). Images have no FK (`images` table, polymorphic), so rows and files of cascaded plants remain forever; embeddings cascade only when their image row goes. Cascade of one user's 2000 plants with 60k watering rows: 31 ms inside a single synchronous statement (measured).
- Root cause: ownership relations are inconsistent (plants cascade, substrates restrict, images unlinked) and the delete use case does no cleanup orchestration.
- Fix: one `DeleteAccount` use case: tx { delete watering/plants cascade via FK, set substrates null owner or delete private substrates, delete image rows }, then unlink files after commit from the collected list; add `ON DELETE CASCADE` to `substrates.user_id` through a table-rebuild migration, add `plants(user_id)` index first (DBE-3) so the cascade is a seek. Effort M, risk medium (data loss semantics: confirm that public substrates of a deleted user should disappear). Confirms DB-3.

##### DBE-13 (Medium, Confirmed): Unbounded growth inventory and missing maintenance

| Thing | Growth | Evidence | Verdict |
|---|---|---|---|
| `combined.log` and `error.log` | unbounded; every expired-token 401 and every 4xx logs at warn to file (`errorHandler.ts:79-83`); Docker `json-file` stdout copy has no `max-size` (`docker-compose.yml` has no `logging:`) | `logger.ts:140-148` (no `maxsize`) | at ~1 refresh-driven 401 per user per 15 min, 1000 users is ~96k lines/day, order of 20 to 40 MB/day (Suspected size, count Confirmed by code path; hook M13) |
| `watering_records` | forever; 1 row per watering; read in full per plant | DBE-6 | Confirmed |
| `images` rows and files | forever; no per-entity cap, no cleanup on user delete | `UploadImageUseCase`, DBE-12 | Confirmed |
| `image_embeddings` | 1.5 KB per embedded plant image (about 1.1 GB for 740k embedded images, the largest single contributor to the 1.76 GB sE file; arithmetic, not a per-table measurement) | `0005_image_embeddings.ts` | Confirmed, linear |
| `species` | user-supplied names, never garbage-collected, rebuilt-resolver does a linear Levenshtein over the whole table per write (BE-8) | `SpeciesResolver.ts:61-108` | Confirmed (Low) |
| `ticketStore` Map | tickets minted but never redeemed are never removed (`sessions.ts:70-86`, no sweeper); bounded by 60/15 min per user | | Confirmed (Low) |
| `activeSessions` Map | one entry per user who ever logged in since boot, pruned lazily only on that user's next call | `sessions.ts:36-42` | Confirmed (Low, O(U) small) |
| `scrape_source_health` | **bounded**: one row per source key, upsert (`ON CONFLICT`) | `SQLiteSourceHealthRepository.ts` | **Refutes** the "health records grow" premise |
| NodeCache (sales 24 h, AI guide 12 h) | bounded by distinct keys; `useClones:false`; AI keys are user-supplied plant names (<=100 chars, ~4 KB values) limited 20 streams per user per 15 min | `NodeCacheAdapter.ts`, `moreInfoRoutes.ts` | Low |
| SQLite file | never shrinks (`auto_vacuum` NONE, no vacuum) after mass deletes | `db.ts` | Low |
| WAL | auto-checkpoint at 1000 pages runs **inside the committing request** on the single thread; no `wal_autocheckpoint`/`journal_size_limit`/`busy_timeout` tuning; `better-sqlite3` default `timeout` is 5000 ms and busy-waits synchronously if a second process holds the write lock | `db.ts:38-45`, DB-5 | Suspected latency spike (hook M5) |

Fix: `maxsize/maxFiles/tailable` on the two file transports (or stdout only in containers), log 401 at debug, `logging: {driver: json-file, options: {max-size, max-file}}` in compose, `PRAGMA journal_size_limit`, periodic `PRAGMA wal_checkpoint(PASSIVE)` from an idle `setInterval(...).unref()`, `busy_timeout`, `PRAGMA optimize` on close, sweep for tickets. Effort S, risk low.

##### DBE-14 (Medium, Confirmed structure, magnitudes Suspected): Cold start does heavy work before listen and right after

- Evidence: `server.ts:30-34` `initDatabase` then `buildApp` then `listen`; `recognition/index.ts:31-32` awaits `InferenceSession.create` (22 MB quantized model, native lib load) **before** `listen`; `HttpFetcher.ts:10` imports `playwright` eagerly at module load (so Playwright's JS is parsed at every boot even if Sales is never opened), `openai`, `sharp`, `winston`, `zod 4`, `axios`, `node-html-parser` all eager; Chromium launches lazily on the first Chromium-based Sales page (`HttpFetcher.ts:24-38`, kept alive forever, `closeBrowser` only at shutdown); `onReady` backfill (DBE-4); bare-node path: `scripts/start.js` hashes every `.ts` file and runs `pnpm run build` when the hash changed (`start.js:calculateProjectHash/ensureBuild`), so a PM2 restart after an update compiles before serving; Dockerfile `HEALTHCHECK start-period 20s`.
- Not measured: node startup to listen, model load time, RSS per phase (hooks M8). Estimated ONNX load 0.3 to 1.5 s, eager imports 0.3 to 0.8 s.
- Fix: lazy-import `playwright` inside `getBrowser()` (the file already isolates it), start listening first and mark `/health/ready` false until recognition is loaded (the route already reports `available`), schedule backfill after an idle delay and paced (DBE-4), close Chromium after N minutes idle (BE-12). Effort S, risk low.

##### DBE-15 (Low, Confirmed + Measured): Authentication micro-costs

- Evidence: 2 `jwt.verify` per authenticated request, 3 on unsafe methods (`auth.ts:23,25,122`), 33 us each; `liveSessions` allocates a filtered copy on every `has/count/create` (`sessions.ts:36-42`), 11 us with the maximum 1000 guest sessions; `isValidAccessToken` result is discarded and recomputed by `readAccessSession`. Total ~0.1 ms per request, ~0.2 s over a 2000-request N+1 burst.
- Fix: one `onRequest` hook verifies once and sets `request.session`; `Map<sid, expiresAt>` per user; ticket sweeper. Effort S. Confirms BE-14 and BE-11 (CPU claim).

##### DBE-16 (Low, Suspected): CORS preflight on every API call when the API is cross-origin

- Evidence: `app.ts:93-101` registers `@fastify/cors` with no `maxAge`; browsers cap an unset max-age at 5 s (Chromium) so every fresh call carrying `Authorization` after 5 s idle needs an `OPTIONS` round trip. Irrelevant behind the compose nginx (same origin, `VITE_API_URL=/api/v2`), relevant for dev/PM2 setups with a separate frontend origin.
- Fix: `maxAge: 600` (or 7200). Effort S.

##### DBE-17 (Medium, Confirmed config): Memory is unbounded and dominated by three persistent residents plus per-request spikes

- Persistent: Chromium (never idle-closed, `HttpFetcher.ts:24-38`), ONNX session (model plus arena), libvips cache (sharp default 50 MB), SQLite page cache 64 MB (`db.ts:42`) plus mmap 128 MB file-backed. Spikes: 10 MB per concurrent upload plus decode buffers; GET /plants at scale (DBE-1). No `mem_limit`, no `--max-old-space-size` (BE-12). Single instance by design because sessions, tickets, rate-limit counters and caches are in process (`ecosystem.config.js: instances: 1`), so horizontal scale-out is impossible without DBE-5.

---

#### 5. Areas verified fine (re-verified, not copied from the earlier audit)

- Plugin order and cost in `app.ts`: CORS, cookie, rate-limit (global:false), request context, static; body parser limits (`bodyLimit` 100 KB JSON, multipart 10 MB, 1 file) are sane; custom JSON parser is a few lines.
- Connection setup: WAL, `foreign_keys=ON`, `synchronous=NORMAL` (no fsync on commit), 64 MB cache, `temp_store=MEMORY`; one connection is correct for better-sqlite3. Migrations are idempotent and run in ms when nothing is pending; migration 0002's `NOT IN` scan runs once.
- Transaction scope: all transactions contain only DB awaits (no network, no file IO inside a tx), at most 200 statements (`createMany`); Kysely's connection mutex therefore serializes tightly. No long-lived read statements (no `iterate()`), so WAL checkpoints are not starved.
- Single-row paths (`findById` plant/image/user, login lookup by unique NOCASE index, `GET /plants/:id`) are index seeks, 0.00 to 0.02 ms.
- `watering_records` read plan `idx_watering_history (plant_id=?)` is correct for the per-plant read; `idx_images_lookup (entity_type, entity_id)` is correct for entity reads.
- Ownership/visibility checks are in SQL or in the use case before work (`ImageAccessPolicy`, `isVisibleTo`), no data leak path found in the scope of this audit.
- SSE transport: back-pressure (`drain`), heartbeat per stream (one `setInterval` per open stream, 20 s), abort detection and `dispose()` are correct; `core/sse/SseManager.ts` timers are cleared on end/fail/dispose.
- Error handler: constant work, no body logging in prod; request-id/ALS overhead negligible. No per-request access log.
- Rate-limit store is an in-process LRU (fine for one instance); `createLimiter` cost ~5 us.
- Embedder queue back-pressure (cap 8) prevents unbounded memory from embedding bursts; snapshot store has a TTL sweeper with `unref`.
- `scrape_source_health` is bounded (one row per source).
- Graceful shutdown closes browser and checkpoints WAL (`closeDb`).

#### 6. Corrections to the earlier audit (cross-reference)

| Earlier ID | Status | Detail |
|---|---|---|
| BE-1, DB-7 | Confirmed, quantified | DBE-6: 0.25 to 0.35 ms/request, 3.3 ms alternative for 2000 plants, group-by variant 591 ms (do not use) |
| BE-2 | Confirmed, quantified | DBE-1: loop block 28/76/2900 ms at T=20k/40k/1M, body 1.9/4.6/99 MB |
| BE-3, DB-2 | Confirmed | DBE-8, DBE-3, 13 ms at 4000 rows |
| BE-4, BE-6 | Confirmed (sales agent owns) | DBE-10 adds the negative-cache gap |
| BE-5 | Confirmed, extended | gzip ratio 15x measured; nginx does not compress `text/event-stream` (Sales stream always raw) |
| **BE-7** | **Corrected** | the claim "bcryptjs yields between rounds" does not hold at cost 10: measured 52.6 ms with a 49 ms maximum loop gap (`MAX_EXECUTION_TIME = 100`) |
| BE-8 | Confirmed (Low) | unchanged |
| BE-9, BE-10, BE-12 | Confirmed | DBE-13, DBE-17, DBE-11 |
| **BE-11** | **Raised** Low to High | the CPU claim holds (11 us), but the restart session loss produces a login wave (DBE-5) |
| BE-13 | **Refined** | not "all vectors of the user"; the scan is over all plant images in the system (measured 2.1 s at 1.48M images); backfill and purge are O(all images) at every boot |
| BE-14 | Confirmed | 33 us each |
| BE-15 | Confirmed, quantified | 62 to 75 us vs 10.7 us, no statement cache (`sqlite-driver.js:58`) |
| **BE-16** | **Refuted as a speed lever** | `fast-json-stringify` 6 ms vs `JSON.stringify` 7 ms on a 5.2 MB plants payload; schemas do not fix list cost (keep only for contract hygiene) |
| BE-17 | Confirmed | unchanged |
| DB-1 | Confirmed | plans captured; `plants(user_id, created_at DESC)` verified to turn SCAN into SEARCH |
| DB-3 | Confirmed and executed | `SQLITE_CONSTRAINT_FOREIGNKEY` on a substrate-owning user, 88 to 114 ms to fail (DBE-12) |
| DB-4 | Confirmed, validated | `PRAGMA optimize` on a fresh connection created `sqlite_stat1` and changed `plantsPrivate` to a skip-scan (0.92 to 0.04 ms at T=20k) |
| DB-5 | Confirmed | plus: better-sqlite3 default `timeout` 5000 ms busy-waits synchronously |
| First audit section 7 "Plants query itself: ownership checks in SQL, no scans" | **Partly refuted** | watering update/delete ownership is `IN (SELECT id FROM plants WHERE user_id=?)` which scans the plants index (0.35 ms at 10k, 37 ms at 1M); `SCAN p` for private plants (no stats) |
| First audit section 7 "SQLite config fine" | **Partly refuted** | no stats, no WAL/journal limits, inline auto-checkpoint |
| First audit section 7 "Auth cost: no per-request DB lookup" | Confirmed, with caveat | but 2 to 3 verifies and in-memory sessions (DBE-5, DBE-15) |

---

#### 7. Measurement hooks I want you to take

Each hook names the scenario and what to record. Use your large synthetic dataset; my scratchpad scripts can also build one (`dbe-gen.cjs`).

| ID | Where | Scenario | Record |
|---|---|---|---|
| M1 | `perf_hooks.monitorEventLoopDelay({resolution: 1})` in `server.ts` (temporary), print p50/p99/max every 5 s | (a) idle; (b) one client opens Plants tab on the big dataset; (c) 20 clients do it within 1 s; (d) 20 logins in 1 s | loop delay max and p99 per scenario, to confirm DBE-2 and DBE-5 |
| M2 | Around the `GET /plants` handler (`plantsController.ts getAllPlants`): `process.hrtime` split into execute (pub), execute (priv), `groupRows`, `toJSON`, `JSON.stringify`; plus `process.memoryUsage()` before and after | T=20k, 40k, 200k, 1M with 5 percent and 20 percent public | per-phase ms, rss/heapUsed delta, body bytes (confirm DBE-1 breakdown and RSS spike) |
| M3 | Log `request.ip` and the `X-Forwarded-For` header for `/auth/login` | run behind the real compose stack with and without the outer TLS proxy | whether all users share one IP (DBE-5 topology) |
| M4 | `EXPLAIN QUERY PLAN` and `.stats on`/`PRAGMA stats` on the production db copy for: plants private/public, substrates, watering by plant, watering update/delete ownership, `vectorsForUser`, `plantImagesMissing`, `purgeOrphans`, delete plant/substrate/component/user | before and after migration 0006 and `PRAGMA optimize` | plan text and ms for each (`dbe-bench.cjs` does this) |
| M5 | Wrap better-sqlite3 `run` (or `Database.exec('COMMIT')`) timing in a debug build; run 5,000 watering inserts one by one | default pragmas vs `wal_autocheckpoint=1000` vs periodic PASSIVE checkpoint | commit latency histogram, spikes at checkpoint (hard disk and SD card if you have one) |
| M6 | `dbe-auth.cjs` on the target hardware (the NAS/Pi) | bcryptjs compare and `monitorEventLoopDelay` during 10 parallel logins | ms per compare and max loop gap |
| M7 | Stage timers in `MatchSnapshotUseCase.execute` and `OnnxEmbedder.embed` (read upload, sharp, `embed`, `vectorsForUser`, rank, snapshot write) | user with 4000 plant images, then 10 concurrent matches | per-stage ms, count of 429 `EmbedderBusyError`, ORT thread count and CPU |
| M8 | Boot timeline with `--cpu-prof` and `process.hrtime` markers in `server.ts` (before/after imports, `initDatabase`, `createRecognition`, `listen`, backfill start/end); RSS at each | cold start with and without `RECOGNITION_MODEL_PATH`, big dataset | ms per phase, RSS per phase, time to first successful `/health/ready` |
| M9 | Sales: count outbound fetches and Chromium launches per visit; log per-source cache hit/miss; measure `sse` bytes and loop block for one warm visit with the real item count | (a) all sources healthy, warm; (b) one source permanently 403/timeouts, warm cache for the others, 3 consecutive visits; (c) cold start with 5 concurrent users | fetches per visit, wall time to `done`, bytes, loop block (DBE-10) |
| M10 | Threadpool: `UV_THREADPOOL_SIZE=4` vs `16`; while 10 parallel `POST /images/plant/:id` (5 MB JPEG) run, time 200 `GET /uploads/...` | per-image latency p50/p99 | confirm DBE-11 |
| M11 | `fs.statSync(logs/combined.log)` size and line counts by `level` and message prefix after a day of use; `docker logs --since 24h | wc -c` | normal usage with expiring tokens | growth per day (DBE-13) |
| M12 | Heap snapshot (`take_heapsnapshot` or `node --heapsnapshot-signal=SIGUSR2`) after `GET /plants` at T=200k and after one Sales visit; RSS of Chromium and the ONNX session at idle | | retained size by class; whether anything is retained after the response |
| M13 | Restart experiment: with 50 logged-in tabs (or a script of 200 refresh cookies), restart the backend and record refresh 401 count, login attempts, 429 count, and p99 latency of unrelated GETs during the wave | with and without a shared IP | confirms DBE-5 end to end |
| M14 | Per-endpoint request counts from a HAR for: Plants tab enter, Watering round enter, Sales enter, app resume | P=20 and P=2000 | N+1 request counts and total bytes (frontend agent overlap) |
| M15 | Re-run `dbe-bench.cjs db 2 plan` on a copy of the real production-sized db after adding the indexes from `dbe-idx.cjs` | | confirm plans flip to `SEARCH` for every victim query |

---

#### 8. Suggested order (backend only)

1. DBE-3 migration `0006` (indexes) + `PRAGMA optimize` on boot/close + DBE-13 log rotation: S, low risk, removes every full scan and the unbounded files.
2. DBE-6 + DBE-1: list contract (`lastWateredAt`, cover image, scope, pagination, ETag): the real fix for Plants-tab latency at scale; L.
3. DBE-5: session persistence + non-blocking hasher + trusted-proxy count: M.
4. DBE-4: plants-first embedding query, drop `purgeOrphans`, paced backfill: S/M.
5. DBE-2: row-budget convention and the event-loop monitor; read worker only if M1 still shows stalls.
6. DBE-8, DBE-9, DBE-10, DBE-11, DBE-12, DBE-14, DBE-17 as independent S/M tasks.


---

## Status after implementation

Branch `perf/scaling` (list with `git log --oneline main..perf/scaling`). The findings of sections 1 to 5 are addressed in four waves plus gate fixes; this maps each finding group to the commits that closed it. Plan: `docs/superpowers/plans/2026-10-12-perf-scaling.md`.

| Finding group | Commits (first one carries the change) |
|---|---|
| Measurement harness and baselines (P0): perf core, API timing, amplify, navigation benchmark, sales injection | `43c1df4`, `133c8c2`, `a2a2717`, `bac5de1`, `447d008`, `1c4107d`, `07d4b45` |
| Persistence deep watcher (NAV-4, DSAL-1, STA-1, DPLA-1): persist at action boundaries with `dirtyOn` and `version` | `a01057a`, `0b39b9c`, `ec75f3a` |
| Whole-list reactivity and copy-on-write collections (STA-x, REN-x) | `e191cc8`, `23e524f`, `e5ad282` |
| Per-item Intl, collator and Luxon construction (REN-6, DSAL-3, NAV-3, DPLA-8, DSUB-11, STA-12) | `fe85680` |
| Every list mounts all cards (REN-1, NAV-1, REN-2, DSAL-7, DSUB-3, DPLA-10): windowed `ItemsOverview`, isolated grid, `pageActive` | `4d0f61a`, `dbb8295`, `463bb11` |
| Database indexes and list query plans (A-6, DBE-x) | `f8ae0d9`, `61310d4`, `38b8707`, `bf7d645`, `cb0642e` |
| List contract: keyset pagination, scopes, `q`, ETag and compression (DBE-1 to DBE-3, DSUB-1, DSUB-2) | `a9c0cef`, `4fee62c`, `b6bc52e`, `90bde5c`, `dd5732f` |
| Plant list N+1 and quadratic watering warm-up (DPLA-2, DBE-6, BE-1, FE-2, STA-3): watering summaries, windowed history, write summaries | `4fee62c`, `dd5732f`, `4fe9d34`, `e5f90c5`, `63ce0ac`, `f4087fd` |
| Substrate and component paging, one-request writes (DSUB-x) | `b6bc52e`, `e3da8d8`, `4b74ae2`, `4bea49d` |
| Sales data model (SALES-1, BE-4, DSAL-2 to DSAL-6): stored in the database, background refresher, replay, summary and detail, NEW watermark | `e2d416d`, `8508daa`, `21eb954`, `39ab994`, `65acda4`, `7d77869` |
| Images (variants, placeholders, native lazy image, browser downscale, immutable static serving) | `6c13da5`, `9f29cae`, `016fcf8`, `00ebd78`, `3bf0d2c`, `02e4054`, `d3d81d9`, `d67c95a` |
| Sessions, hashing and trusted proxy count (DBE-5) | `a757b2c`, `7305ee2`, `21b4cd2` |
| Recognition vectors and backfill (DBE-4) | `321da24`, `6bc235c`, `3e190ff`, `c05ddb1` |
| API client: timeouts, proactive refresh, logout epoch, abort of streams | `4e7344b`, `eb3977c`, `479b5e2` |
| Storage split into settings and account cache | `491cd34` |
| Boot and navigation cost | `a443798`, `ac64aea`, `f0ba9f6` |
| Deployment: nginx serves `/uploads`, SSE locations, precompression, memory limits, log rotation, maintenance jobs, lazy Chromium and recognition start, event loop monitor, prepared statement cache | `c357859`, `281fd75`, `9295f05`, `ed27937`, `7cd9b6d`, `37b9043` |
| Review and gate fixes | the remaining `fix:` commits, grouped by phase gate |

### Deferred or open

- Wrapping the shipped migrations `0001` to `0006` in transactions (partial DDL on a failed start); `0007` onwards are transactional.
- A separate read worker for SQLite (DBE-2): not needed unless the event loop figures of `/health` still show stalls at the target data size.
- `PricePoint` and the unused global `Substrate` and `AddSubstrateComponents` types in the frontend, and the legacy `items` getter on the substrates store, can be deleted.
- `ImageEditingModal` still takes the legacy image shape (bridged by a computed in `PlantDetails`); `IMAGE_ACCEPT` in the client still lists only jpeg and png although the server accepts webp.
- Scrollbar styling lost on light-DOM scrollers (`scrollbar.css`), `watchReducedMotion` not wired to Ionic at runtime, unused Capacitor plugins and `terser` in `frontend/package.json` (check native builds first).
- Paged `invalidate()` cannot bump the request sequence of an in-flight load; `components` details cache has no TTL; stale `sales_data` injected by the old `scripts/perf/inject-sales.mjs` shape is ignored by the client.
- `docker-compose.yml` does not forward the new backend settings (`SALES_*`, `IMAGE_BACKFILL_ON_START`, `UPLOAD_MAX_PIXELS`, `LOG_TO_STDOUT`, `TRUST_PROXY_HOPS`); stock `nginx:alpine` serves only the `.gz` precompressed files, not `.br`.
- Open product decision from the sales rework: NEW sales now stay new until opened or marked seen (7 day window on a fresh install) instead of only for the current session.
