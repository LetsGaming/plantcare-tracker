# Services

All services extend `BaseService` and use the same two-tier cache.

## BaseService

Located at `src/services/base/BaseService.ts`.

### Cache methods

| Method | Description |
|--------|-------------|
| `getCachedData(key, fetcher, forceUpdate?)` | L1+L2 cache-first fetch with request dedup |
| `getFromDictionaryCache(key, entryKey, fetcher, forceUpdate?)` | Dictionary cache for keyed data (watering, more-info) |
| `saveAndNotify(key, event, data)` | Write to L1+L2 and emit DOM event |
| `upsertIntoListCache(key, event, item)` | Insert or replace one item in a cached list |
| `removeFromListCache(key, event, itemId)` | Remove one item from a cached list (silent no-op if absent) |
| `replaceInListCache(key, event, previousId, item)` | Swap an item in place by its previous id (temp id → server id) |
| `upsertInto/removeFrom/replaceInDictionaryListCache(key, entryKey, …)` | Same three operations addressing one entry of a dictionary cache; sibling entries are untouched |
| `clearMemoryCache()` | Empties the static L1 cache and the in-flight registry. Called by `UserService.handleLocalLogout` (and therefore also on account deletion) so a following login in the same app session cannot read the previous account's data |

### Optimistic mutation wrappers

| Method | Description |
|--------|-------------|
| `optimisticListUpsert({ cacheKey, eventKey, optimisticItem, request, reconcile })` | Paints `optimisticItem` immediately (creates use a temporary **negative id**), runs `request`, then swaps the painted item in place for `reconcile(response)`. On failure only the affected item is rolled back — concurrent changes to other items survive. |
| `optimisticListRemove({ cacheKey, eventKey, itemId, request })` | Removes immediately; re-inserts the snapshot at its original index if the request fails. |
| `optimisticDictionaryListUpsert / -Remove` | Same semantics addressing one entry of a dictionary cache (e.g. the watering records of one plant). |

Every paint, reconcile, and rollback goes through `saveAndNotify`, so views
subscribed to the cache event repaint automatically at each step.

### Event system

Services emit `CustomEvent`s on `document`:

```typescript
// Listen in a Vue component (Options API — mounted/beforeUnmount,
// NOT the ionView hooks: Ionic keeps pages alive off-screen)
mounted() {
  document.addEventListener(PlantEvents.PLANTS_UPDATED, this.handleUpdate);
},
beforeUnmount() {
  document.removeEventListener(PlantEvents.PLANTS_UPDATED, this.handleUpdate);
},
```

Handlers only **read** the cache and re-derive via the service getters —
they never mutate and never refetch after a mutation.

---

## PlantService

Cache key: `plants_all`
Events: `PlantEvents.PLANTS_UPDATED`

```typescript
PlantService.getAllPlants(forceUpdate?)       → Plant[]
PlantService.getPlantById(id, forceUpdate?)  → Plant
PlantService.getPublicPlants(forceUpdate?)   → Plant[]   // derived
PlantService.getPersonalPlants(forceUpdate?) → Plant[]   // derived
PlantService.addPlant(data)                  → Plant   // optimistic
PlantService.editPlant(id, data)             → Plant   // optimistic
PlantService.deletePlant(id)                 → void    // optimistic
PlantService.uploadPlantImage(id, file, date?) → any
```

Note: `getPlantById` uses the dedicated `GET /plants/:id` endpoint (V2)
instead of fetching the full list and filtering client-side.

Mutations are **optimistic**: the expected plant is painted into the cache
immediately (creates under a temporary negative id) and reconciled in place
with the full plant the server returns — `addPlant` therefore resolves with
the real id, which the views use for the dependent image upload. On failure
only the affected plant is rolled back. `uploadPlantImage` refreshes just
this plant's cache entry afterwards (no full invalidation).

---

## SubstrateService

Cache key: `substrates_all`
Events: `SubstrateEvents.SUBSTRATES_UPDATED`

```typescript
SubstrateService.getAllSubstrates(forceUpdate?)         → Substrate[]
SubstrateService.getSubstrateById(id, forceUpdate?)    → Substrate
SubstrateService.getPublicSubstrates(forceUpdate?)     → Substrate[]  // derived
SubstrateService.getPrivateSubstrates(forceUpdate?)    → Substrate[]  // derived
SubstrateService.addSubstrate(data)                    → any
SubstrateService.addSubstrateWithComponents(data, comps?) → number (substrateId)
SubstrateService.editSubstrate(id, data)               → any
SubstrateService.editSubstrateComponents(id, comps)    → any
SubstrateService.deleteSubstrate(id)                   → any
SubstrateService.uploadSubstrateImage(id, file, date?, refreshCache?) → any
```

Substrate mutations stay **pessimistic** (create-with-components spans two
requests): the request runs first, then the server-confirmed substrate is
upserted into the cache — views still repaint via `SUBSTRATES_UPDATED`
without manual refetches.

---

## WateringService

Cache key: `watering_records_data` (dictionary keyed by plant ID)
Events: `WateringEvents.RECORDS_CHANGED`, `WateringEvents.FERTILIZER_TYPES_CHANGED`

```typescript
WateringService.getWateringRecords(plantId, forceUpdate?) → WateringRecord[]
WateringService.getFertilizerTypes(forceUpdate?)          → FertilizerType[]
WateringService.addWateringRecord(plantId, data)            → WateringRecord  // optimistic
WateringService.editWateringRecord(plantId, recordId, data) → WateringRecord  // optimistic
WateringService.deleteWateringRecord(plantId, recordId)     → void            // optimistic
```

Mutations are **optimistic** on the plant's entry of the dictionary cache:
the record is painted immediately (adds under a temporary negative id),
reconciled with the server record, and rolled back item-scoped on failure.
Sibling plants' entries are never touched.

---

## SalesService

Cache key: `sales_data` (keepOnClear = true — survives logout)
Events: `SaleEvents.SALES_UPDATED`, `SaleEvents.SALE_SEEN`, `SaleEvents.PRICE_HISTORY_UPDATED`

Sales data arrives over SSE. Each `message` event carries a single `APISale`.
The `done` event carries `{ total: number }`.

```typescript
SalesService.getAllSales(options?)   → Sale[]   // triggers SSE stream on miss
SalesService.getSaleById(id)         → Sale | null
SalesService.getCachedSales()        → Sale[] | null
SalesService.markSaleAsSeen(id)      → void
SalesService.getPriceHistory(id)     → PricePoint[]
```

---

## MoreInfoService

Cache key: `more_info_data` (dictionary keyed by plant name)
Events: `MoreInfoEvents.MORE_INFO_UPDATED`

```typescript
MoreInfoService.getMoreInfo(plantName, options?) → MoreInfo[]
MoreInfoService.getMoreInfoByName(plantName, forceUpdate?) → MoreInfo[]
MoreInfoService.invalidateInfoCache(plantName?)  → void
```

Each SSE `message` event carries `{ type: "link"|"ai_chunk", value: string }`.
The done event carries `{ status: "completed" }`.

---

## UserService

Handles JWT-based authentication. The access token is stored via `TokenUtils`
in `@ionic/storage`.

```typescript
UserService.login(data)        → LoginResponse
UserService.guestLogin()       → LoginResponse
UserService.register(data)     → any
UserService.logout()           → void
UserService.refreshToken()     → string (accessToken)
UserService.editProfile(data)  → any
UserService.deleteProfile()    → any
UserService.isAuthenticated()  → boolean
UserService.getUserId()        → number
UserService.getUserRole()      → UserRole | null
UserService.isAdmin()          → boolean
UserService.isGuest()          → boolean
```

Token refresh uses exponential backoff (3 retries, 1s apart). A 401 response
from `/auth/refresh-token` immediately aborts the retry loop and triggers logout.

The 401/403 retry path in `ApiUtils` only runs when an access token was
actually stored: a 401 on an unauthenticated request (e.g. anything fired
while the user is still on the login screen) fails plainly instead of
triggering the refresh/teardown cycle. When the cycle does fail, teardown is
local (`handleLocalLogout`) and never navigates or reloads while the user is
already on the login screen.

---

## ComponentService

Cache key: `components_all`
Events: `ComponentEvents.COMPONENTS_UPDATED`

```typescript
ComponentService.getAllComponents(forceUpdate?)       → Component[]
ComponentService.getComponentById(id, forceUpdate?)  → Component
ComponentService.addComponent(data)                  → any   // admin only
ComponentService.editComponent(id, data)             → any   // admin only
ComponentService.deleteComponent(id)                 → any   // admin only
ComponentService.uploadComponentImage(id, image)     → any   // admin only
```

---

## ImageService

Thin wrapper around `/api/v2/images`. Used by entity services, not called
directly from views.

```typescript
ImageService.uploadImage(file, entityType, entityId, date?) → any
ImageService.editImage(imageId, entityType, date?, file?)   → any
ImageService.deleteImage(imageId, entityType)               → any
ImageService.deleteAllImages(entityType, entityId)          → any
```
