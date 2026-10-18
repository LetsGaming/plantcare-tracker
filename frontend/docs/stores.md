# Stores

State is held in Pinia stores (`src/stores/`), written in the Options style. This page lists
each store, its persisted entries and its actions. See [Architecture](./architecture.md) for the
patterns they share.

## Infrastructure

| File | Purpose |
|------|---------|
| `pinia.ts` | Creates the app pinia (with the persistence plugin) and `resetAllStores()`, which a logout calls |
| `persistence.ts` | `persist: { entries: [...] }` store option; adds `$hydrate()`, `$persist()`, `$flushPersist()` and `$cancelPersist()` |
| `resource.ts` | `resourceState()` (`status`, `fetchedAt`), `isStale()`, `coalesced(owner, key, work)`, the session `epoch`, `requestScope()` |
| `paged.ts` | `pagedState()` and the helpers that load a keyset-paged list: `loadAll`, `loadFirst`, `loadMore`, `setQuery`, `pagedPersistEntry` |
| `optimistic.ts` | Copy-on-write list helpers (`commitList`, `upsertItem`, `removeItem`, `replaceItem`, `idIndexOf`) and the `optimisticUpsert` / `optimisticRemove` flows |
| `journal.ts` | Lets a list that is being loaded wholesale keep the local edits made while the request was in flight |

### Rules every store follows

- **State changes only inside actions.** Components and views read through getters and call
  actions; a test (`tests/conventions.test.ts`) fails when any source outside `stores/` assigns to a store
  property (including `+=` and `++`) or calls a mutating array method (`push`, `splice`, `sort`, ...) on it. A change a view needs becomes an
  action.
- **Collections are immutable values.** Items are frozen view models (`mapping/`), the array is
  `markRaw`, and every change builds a new array (`commitList`, `upsertItem`, ...) so a list
  reference is a version token. `idIndexOf(list)` gives O(1) lookups by id.
- **Session epoch.** `epoch.guard()` captures the current account; any result that arrives after
  `epoch.abortAll()` (logout, account deletion) is dropped without a toast or a write. `abortAll`
  also aborts every in-flight request and stream (`requestScope`). A load that began for the
  previous account never commits or persists.
- **Coalesced loads.** `coalesced(owner, key, work)` makes concurrent callers share one request.

### Action-boundary persistence

The plugin never watches state. A persisted entry (`{ key, pick, apply, timestamp?, keepOnClear?,
allowExpired?, dirtyOn?, version? }`) is marked changed only when an action named in `dirtyOn`
finishes (omitted: any action), written after a 250 ms trailing debounce, and skipped when its
`version(state)` token is `Object.is`-equal to the last written one. Copy-on-write lists return the
list reference as the token, settings return a primitive. Pending writes are flushed on `pagehide`
and when the page becomes hidden. Hydration is explicit and on demand (`store.$hydrate(keys?)`,
called by the load actions) and skips expired snapshots unless `allowExpired`. `$reset` bumps an
internal generation so nothing begun for the previous account can mark, apply or write afterwards.
A persisted entry without `dirtyOn` and `version` would be rewritten in full after every action, so
new entries always declare both.

### Paged lists

`pagedState()` is `{ items, status, fetchedAt, nextCursor, total, query, ... }`. A store spreads it
into its state, or nests it (`mine`, `public`).

| Mode | Used for | Helpers |
|------|----------|---------|
| Complete | Data the user owns and the component catalogue (small, searched on the client) | `loadAll`: pages of 100 until `next_cursor` is `null`, one commit |
| Server paged | Public plants and substrates (foreign, unbounded) | `loadFirst` (30), `loadMore` (follows `nextCursor`), `setQuery(q)` (resets paging; an identical query is a no-op; an older answer is dropped) |

`pagedPersistEntry(key, target, "all" | "firstPage")` persists the whole list or only the first
page of the default query, so scrolling or searching never rewrites the snapshot. After a hydrate,
the first request of a persisted first page is conditional (`ETag` / `304`).

## session

Token and identity. Persisted through `TokenUtils` under `authToken` (not the plugin).

| Member | Description |
|--------|-------------|
| `token`, `hydrated` | State |
| `identity`, `isAuthenticated`, `isAdmin`, `isGuest`, `username`, `role`, `userId` | Getters from the JWT; user id `0` is kept, non-ASCII names decode |
| `hydrate()`, `ensureAuthenticated()` | Load the token; try one silent refresh when there is none |
| `register`, `login`, `guestLogin` | Auth calls; login stores the token |
| `refresh(retries?)` | Single flight; 401 is final, other failures retried (1 s apart) |
| `logout()`, `localLogout()` | Server logout (best effort) then local teardown: end the epoch (abort requests and streams), reset all stores, clear token and non-persistent storage, redirect |
| `editProfile`, `deleteProfile` | `PATCH` / `DELETE /auth/me`; delete wipes all storage |

`connectSessionToTransport(pinia)` and `setLoginRedirect(fn)` wire the store to `ApiUtils`
and to the router at startup (`main.ts`).

## plants

Two lists plus the plants opened by link. Persisted: `plants_mine` (mode "all"), `plants_public`
(mode "firstPage").

| Member | Description |
|--------|-------------|
| `mine`, `public`, `details` | State. `mine` is loaded completely (`scope=mine`), `public` is server paged, `details` holds up to 20 plants opened by link that are in neither list (true LRU) |
| `personalPlants`, `publicPlants`, `byId(id)`, `isMineStale`, `isPublicStale` | Getters; `byId` looks in `mine`, `public`, then `details` |
| `ensureMine({ force })`, `ensureLoaded` (alias) | Cache-first; guests make no request. Sends `tz_offset` (minutes east of UTC) |
| `ensurePublic({ force })`, `setPublicQuery(q)`, `loadMorePublic()` | Public tab: first page, server search, next page |
| `fetchOne(id)`, `getPlant(id, force)` | `GET /plants/:id` (the detail, with `images`), merged into whichever list holds the plant |
| `applySummaries(map)` | One copy-on-write commit per list with new watering summaries; untouched plants keep their object identity |
| `addPlant`, `editPlant`, `deletePlant`, `uploadPlantImage` | Optimistic; the detail DTO from the server replaces the optimistic item; delete also drops the plant's watering history |

A list item (`PlantView`) carries `cover`, `imageCount` and `watering`, the server-computed
summary of the owner's watering (`lastWateredAt`, `lastFertilizedAt`, `avgIntervalDays`). Status
(ok, due, overdue, new) is derived from the summary by `wateringStatus(summary, now)` without any
history request. A foreign plant has `watering: null`, which means unknown, not "never watered".

## watering

Windowed history per plant and fertilizer types. Persisted: `fertilizer_types_data` only; histories
are not persisted.

| Member | Description |
|--------|-------------|
| `byPlantId`, `order`, `fertilizerTypes`, `typesFetchedAt` | State; `byPlantId[id]` is `{ items (newest first), nextCursor, loadedAt }`, `order` is an LRU of 20 plants |
| `recordsFor(id)`, `isLoaded(id)`, `hasOlder(id)`, `isFresh(id)` | Getters; `recordsFor` is empty when not loaded |
| `ensureRecords(id, { force })` | The newest 50 records, coalesced; repeats once if a write landed during the load |
| `loadOlder(id)` | "Show older records": the next 50 via the `before` cursor, appended and deduplicated |
| `ensureFertilizerTypes()` | Cache-first |
| `addRecord`, `editRecord`, `deleteRecord` | Optimistic inside the loaded window; the server record replaces the painted one; the returned summary goes to `plants.applySummaries`. No refetch after a write |
| `addBatch(entries)`, `removeBatch(ids)` | One request per chunk of 200; summaries of all affected plants are applied once |
| `dropPlant(id)` | Forget a deleted plant's window |

Dates are sent in epoch seconds and `tz_offset` in the body (query for `DELETE`). A write that
finishes after the account ended applies nothing.

## substrates

Own and public substrates. Persisted: `substrates_mine` (mode "all"), `substrates_public` (mode
"firstPage"). Mutations are pessimistic.

| Member | Description |
|--------|-------------|
| `mine`, `public`, `details`, `usedByComponent` | State |
| `personalSubstrates`, `publicSubstrates`, `byId`, `detailOf(id)`, `isMineStale`, `isPublicStale` | Getters |
| `ensureMine` / `ensureLoaded`, `ensurePublic`, `setPublicQuery`, `loadMorePublic` | Same pattern as plants |
| `fetchOne(id)` / `getSubstrate(id)` | `GET /substrates/:id` only, never a list |
| `loadUsedByComponent(componentId)` | "Used in": `component_id` filter over `mine` and `public`, deduplicated, ordered by name |
| `addSubstrate`, `editSubstrate`, `deleteSubstrate`, `uploadSubstrateImage` | One POST (with the mix) or one PATCH (the full mix replaces), server detail committed |
| `invalidate()` | Marks both lists expired (a component edit or delete changes counts) |

## components

The global catalogue, loaded completely (about 100 entries). Persisted: `components_catalogue`
(mode "all"), `components_fineness_levels`.

`ensureLoaded`, `getComponent(id, force)` (detail with images, cached in `details`),
`ensureFinenessLevels`, and the admin mutations `addComponent` (the form's fineness id is sent as
`fineness`), `editComponent` (`PUT`), `deleteComponent`, `uploadComponentImage`. Edit and delete
call `substrates.invalidate()`. The getter `selectableComponents` is the frozen, name-sorted array
the substrate form's picker renders (fineness label and a lowercase `searchText` resolved once).

## sales

The sales the server stored, replayed from its database. Persisted with `keepOnClear` and no
expiry: `sales_data`, `sales_query`, `sales_seen`, `sales_summary`. Sales are not account data, so
they survive logout.

| Member | Description |
|--------|-------------|
| `items`, `streaming`, `seen`, `summary`, `query` | State; `items` is replaced once when a replay completes |
| `visibleSales`, `filteredSales`, `sellers`, `newCount`, `byId` | Getters; `newCount` reads the persisted summary so the tab badge needs no list |
| `hydrateBoot()` | Reads only `sales_summary` and `sales_seen` at boot |
| `loadSummary()` | `GET /sales/summary?since=<watermark>`, after the first frame |
| `ensureFresh()` | Called when the Sales page is entered: replays when the list is empty or the server's `refreshed_at` is newer than the list's |
| `replay()` | Streams `GET /sales` (SSE) into a Map outside the store; at most one publish per 250 ms and only while nothing is shown yet. A failed or aborted replay leaves the previous list |
| `loadDetail(id)` | `GET /sales/:id`, the price history of one sale, loaded lazily on the details page |
| `markSeen(id)`, `markAllSeen()` | NEW bookkeeping |
| `setQuery`, `resetQuery` | Filters and sort of the overview |

**NEW watermark.** A sale is NEW when its `firstSeenAt` is after the `seen.watermark` and its id
is not in `seen.ids` (sales opened since). A fresh install starts with the watermark 7 days back.
`markAllSeen` moves the watermark forward (one assignment), `markSeen` adds one id; ids at or below
the watermark are pruned. Price history is no longer kept in the store: it comes from the server
per sale.

## moreInfo

AI care guide and links per plant name and language (key `lang:name`). Persisted: `more_info_data`.

`ensureInfo(plantName, { force })` streams the guide; `infoFor(plantName)` returns the running
draft, else the stored guide. A stream that ends with any status other than `completed` is a failure:
nothing is cached or persisted, and the partial draft stays available for display. Leaving the page
aborts the stream. Entries written under an older shape are ignored.

## adminHealth

Scrape source health, always live and never persisted. `load()`, `recheck(key)`, getter
`needingAttention` (sources whose status is `failing`).

## calendar

Local calendar settings; no network. Persisted with `keepOnClear` and no expiry:
`date_categories`, `watering_categories`, `reminder_dates`, `delete_after_thirty`,
`first_day_of_week`.

`ensureLoaded`, `saveCategories`, `saveWateringCategories`, `resetWateringCategories`, `saveDates`,
`deleteOldDates` (drops reminders older than 30 days when the setting is on), `saveDeleteAfterThirty`,
`saveFirstDayOfWeek`.

## layout, snapSettings

Browser-local preferences (`layout`: collapsed side menu; `snapSettings`: the snap-to-log options),
persisted with `keepOnClear`.

## Storage areas

`StorageService` has two areas: `kv` for settings and anything marked `keepOnClear`, and `cache`
(`plantcare_cache`) for account data. `clear()` on logout empties only the cache. A one-time
migration (flag `storage_split_v1`) deletes the keys of the old single-area layout; obsolete keys
such as `plants_all`, `substrates_all`, `components_all` and `watering_records_data` are removed
the same way.

## Services that remain

| Module | Purpose |
|--------|---------|
| `ImageService` | Stateless upload, edit and delete calls for entity images |
| `StorageService` | Async Ionic storage driver (L2) |
| `ToastService`, `LocalizationService` | UI helpers |

## Dependency direction

Stores call each other only inside actions and only one way: `watering` to `plants`
(`applySummaries`), `plants` to `watering` (drop a deleted plant's window), `plants` to `substrates`
(name for an optimistic card), `components` to `substrates` (`invalidate`); every store may read
`session`. A store test mocks `ApiUtils` and the services it calls, and builds a pinia with
`createInstalledPinia()` from `src/tests/helpers.ts`.
