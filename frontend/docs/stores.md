# Stores

State is held in Pinia stores (`src/stores/`), written in the Options style. This page lists
each store, its persisted entries and its actions. See [Architecture](./architecture.md) for the
patterns they share.

## Infrastructure

| File | Purpose |
|------|---------|
| `pinia.ts` | Creates the app pinia (with the persistence plugin) and `resetAllStores()`, which a logout calls |
| `persistence.ts` | `persist: { entries: [...] }` store option; adds `$hydrate()` and `$cancelPersist()` |
| `optimistic.ts` | `optimisticUpsert(list, item, request, reconcile)` and `optimisticRemove(list, id, request)` on a reactive list |
| `resource.ts` | `resourceState()` (`status`, `fetchedAt`), `isStale()`, `coalesced(owner, key, work)` |

`coalesced` makes concurrent callers of the same load share one request. `isStale` compares
`fetchedAt` with the cache lifetime from `config.json`.

## session

Token and identity. Persisted through `TokenUtils` under `authToken` (not the plugin).

| Member | Description |
|--------|-------------|
| `token`, `hydrated` | State |
| `identity`, `isAuthenticated`, `isAdmin`, `isGuest`, `username`, `role`, `userId` | Getters from the JWT; user id `0` is kept, non-ASCII names decode |
| `hydrate()`, `ensureAuthenticated()` | Load the token; try one silent refresh when there is none |
| `register`, `login`, `guestLogin` | Auth calls; login stores the token |
| `refresh(retries?)` | Single flight; 401 is final, other failures retried (1 s apart) |
| `logout()`, `localLogout()` | Server logout (best effort) then local teardown: reset all stores, clear token and non-persistent storage, redirect |
| `editProfile`, `deleteProfile` | `PATCH` / `DELETE /auth/me`; delete wipes all storage |

`connectSessionToTransport(pinia)` and `setLoginRedirect(fn)` wire the store to `ApiUtils`
and to the router at startup (`main.ts`).

## plants

All plants visible to the user. Persisted: `plants_all`.

| Member | Description |
|--------|-------------|
| `items`, `status`, `fetchedAt` | State |
| `personalPlants`, `publicPlants`, `byId`, `isStale` | Getters |
| `ensureLoaded({ force })` | Cache-first load |
| `fetchOne(id)`, `getPlant(id, force)` | One plant (`GET /plants/:id`), upserted |
| `addPlant`, `editPlant`, `deletePlant` | Optimistic. Delete drops the plant's watering records after the server confirmed |
| `uploadPlantImage(id, file, date?)` | Uploads, then refreshes just this plant |

## watering

Records per plant and fertilizer types. Persisted: `watering_records_data`, `fertilizer_types_data`.

| Member | Description |
|--------|-------------|
| `byPlantId`, `loadedAt`, `fertilizerTypes`, `typesFetchedAt` | State |
| `recordsFor(plantId)` | Getter; empty list when not loaded |
| `ensureRecords(plantId, { force })`, `ensureFertilizerTypes()` | Cache-first loads; a 404 means an empty history |
| `addRecord`, `editRecord`, `deleteRecord` | Optimistic; other plants' entries are never touched |
| `dropPlant(plantId)` | Forget a deleted plant's records |

## substrates

Public and own substrates. Persisted: `substrates_all`. Mutations are pessimistic.

`ensureLoaded`, `getSubstrate(id, force)`, `fetchOne`, `addSubstrate`, `addSubstrateWithComponents`
(two requests; the final state is upserted), `editSubstrate`, `editSubstrateComponents`,
`deleteSubstrate`, `uploadSubstrateImage(id, file, date?, refresh?)`. Getters: `publicSubstrates`,
`privateSubstrates`, `byId`.

## components

The global catalogue. Persisted: `components_all`, `components_fineness_levels`.

`ensureLoaded`, `getComponent(id, force)`, `ensureFinenessLevels`, and the admin mutations
`addComponent`, `editComponent` (`PUT`), `deleteComponent`, `uploadComponentImage`. A mutation
resolves once the request succeeded (a `204` answer is success).

## sales

Streamed sales. Persisted with `keepOnClear` and no expiry: `sales_data`, `sales_price_history`.

| Member | Description |
|--------|-------------|
| `items`, `incoming`, `streaming`, `priceHistory` | State; `incoming` is the uncommitted stream |
| `visibleSales`, `newCount`, `byId`, `historyOf(id)` | Getters |
| `load({ force })` | Streams unless fresh sales are in memory; concurrent callers share one stream |
| `restore()` | Loads stored sales without the network (tab badge) |
| `markSeen(id)`, `markAllSeen()`, `addPricePoint(sale)` | New flag; price history capped at 30 points, unchanged prices skipped |

## moreInfo

AI care guide and links per plant name and language (key `lang:name`). Persisted: `more_info_data`.

`ensureInfo(plantName, { force })` streams the guide; `infoFor(plantName)` returns the running
draft, else the stored guide. A stream that ends with any status other than `completed` is a failure:
nothing is cached or persisted, and the partial draft stays available for display. Entries written
under an older shape are ignored.

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

## Services that remain

| Module | Purpose |
|--------|---------|
| `ImageService` | Stateless upload, edit and delete calls for entity images |
| `StorageService` | Async Ionic storage driver (L2) |
| `ToastService`, `LocalizationService` | UI helpers |

## Dependency direction

Stores call each other only inside actions and only one way: `plants` to `watering` (drop records
after a delete) and `plants` to `substrates` (name for an optimistic card); every store may read
`session`. A store test mocks `ApiUtils` and the services it calls, and builds a pinia with
`createInstalledPinia()` from `src/tests/helpers.ts`.
