# Performance harness

Measures the production build against an isolated dev-up backend.

## Prerequisites

- Playwright in the backend package: `pnpm --dir backend add -D playwright` (already resolvable if `backend/node_modules/playwright` exists). Microsoft Edge is used when present; otherwise run `pnpm --dir backend exec playwright install chromium`.
- A running dev session: `node scripts/dev-up.mjs --id <id>`; stop it with `node scripts/dev-down.mjs --id <id>`.

## Usage

```bash
node scripts/perf/build-dist.mjs --id <id>              # production build into frontend/dist-perf
node scripts/perf/serve-dist.mjs --id <id> [--port N]   # prints the served URL
```

The build sets `VITE_API_URL=/api/v2`, so the app talks to its own origin. The server proxies `/api` and `/uploads` to the backend port recorded in `data/agent-<id>/dev-session.json`. `dist-perf` is gitignored. Every script accepts `--help`.

## Library

- `lib/session.mjs`: `parseFlags`, `requireId`, `loadSession(id)` (session file plus `apiBase`).
- `lib/browser.mjs`: `openPage()` returns a fresh mobile context (390x844, DPR 3, touch, service workers blocked) with CPU 4x and Fast 4G throttling constants, and a buffered `longtask` observer exposed as `window.__longtasks`.

## Scenarios

- `plants-cold`: a user opening Plants with no cached account data. After login it deletes the account-data keys (plants, substrates, components, watering, fertilizer types, more info, sales) from the Ionic Storage IndexedDB (auth token and settings stay), then loads `#/tabs/plants` under 4x CPU and Fast 4G and waits until requests and DOM mutations have been quiet for 2 s (up to 300 s). It reports the `GET /plants` and `/watering/plant/*` request counts and the time until the last watering response.
- `public-scroll`: Plants, public segment. Records the first page, then six scrolls to the bottom (the infinite scroll fetches the next cursor page). Per step: blocked and longest task, cards mounted, cumulative `scope=public&cursor=` requests, last API response time, image requests per card. Needs a large public set (`amplify.mjs`, 100k public plants for the plan target).
- `sales-replay`: opens Sales with an empty client store so the SSE replay of the server's rows runs. Seed the server first with `inject-sales.mjs --mode db --n 2000`. Reports long tasks during the stream, `replayedItems` (number in the count line at the end) and `listCommits` (distinct count-line values, a proxy for list commits; the store publishes a cold list at most every 250 ms and commits once at the end).
- `round-tap`: opens `#/tabs/plants/water`, then ticks the first five rows (`.round-row .tick-box`). Per tap: blocked time and `/watering/plant/*` request count (must be 0).
- `heap-20-switches`: four warm-up tab visits, then 20 tab switches. Heap is read after `HeapProfiler.collectGarbage` through `Runtime.getHeapUsage` before and after; `heapGrowthPct` is the difference in percent. DOM node count is recorded at the end.
- `tabs` also feeds the tab-entry and Plants-entry targets; `plants-cold` empties the `plantcare_cache` database and removes the `sales_*` entries of the kv database `_ionicstorage`.

## Sales injection

`inject-sales.mjs --mode idb` (and navbench) writes `sales_data` (items with `firstSeenAt`/`scrapedAt` in ms, no search key), `sales_seen` (`{ watermark, ids }`, watermark 7 days back) and `sales_summary` (`total`, `newCount`, `refreshedAt`, `listRefreshedAt`, `latestFirstSeenAt`) into the kv area (`_ionicstorage`) that the sales store persists to. `listRefreshedAt` and `refreshedAt` are set far in the future so the first visit uses the injected list instead of replaying. Price history is no longer stored client side. `--mode db` writes synthetic rows into the session database.

## Targets (`navbench --targets`, plan section 6.2)

| Target | Step | Limit |
|---|---|---|
| Tab entry | `tabs/*` | blocked under 50 ms |
| Sales warm re-entry, Substrates with Sales mounted (N=2000) | `sales-entry/*` | blocked under 50 ms, no long task |
| mark-all-seen (N=1000) | `mark-all-seen/mark-all` | longest task under 200 ms |
| sales-replay (replays at least 2000) | `sales-replay/replay` | longest task under 100 ms |
| First mount (cold Plants) | `plants-cold/cold-load` | longest task under 100 ms, at most 2 API requests |
| History requests on Plants entry and in the round | `tabs/*-plants`, `plants-cold`, `round-tap/*` | 0 |
| public-scroll | `first-page`, `next-page-*` | first under 100 ms, next blocked under 50 ms |
| round-tap | `tap-*` | blocked under 50 ms |
| heap-20-switches | `switches` | growth under 10 percent |
| DOM nodes (N=2000) | `sales-entry/warm-reentry`, `heap-20-switches` | under 12k |
| Image requests per card | `sales-entry/first-entry`, `public-scroll/first-page` | at most 1 |

## API timing

`apitime.mjs` defaults: `/plants?scope=mine&limit=100`, `/plants?scope=public&limit=30`, `/substrates?scope=mine&limit=30`, `/substrates?scope=public`, `/components`, `/sales/summary`, `/watering/plant/{firstPlantId}?limit=50`, `/watering/fertilizer-types`. Override with `--endpoints a,b,c`.

## EXPLAIN

`explain-expectations.json` covers the plant, substrate and component list indexes (phase A) plus the watering history pages and last-watered lookup, the sales active pages and the sales summary (phase B). The sales price-point history lookup (WITHOUT ROWID primary key) is not listed: `explain.mjs` only matches named indexes.
