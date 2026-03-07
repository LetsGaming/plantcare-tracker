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

### Event system

Services emit `CustomEvent`s on `document`:

```typescript
// Listen in a Vue component
onMounted(() => {
  document.addEventListener(PlantEvents.PLANTS_UPDATED, handleUpdate);
});
onUnmounted(() => {
  document.removeEventListener(PlantEvents.PLANTS_UPDATED, handleUpdate);
});
```

---

## PlantService

Cache key: `plants_all`
Events: `PlantEvents.PLANTS_UPDATED`

```typescript
PlantService.getAllPlants(forceUpdate?)       → Plant[]
PlantService.getPlantById(id, forceUpdate?)  → Plant
PlantService.getPublicPlants(forceUpdate?)   → Plant[]   // derived
PlantService.getPersonalPlants(forceUpdate?) → Plant[]   // derived
PlantService.addPlant(data)                  → any
PlantService.editPlant(id, data)             → any
PlantService.deletePlant(id)                 → any
PlantService.uploadPlantImage(id, file, date?) → any
```

Note: `getPlantById` uses the dedicated `GET /plants/:id` endpoint (V2)
instead of fetching the full list and filtering client-side.

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
SubstrateService.uploadSubstrateImage(id, file, date?, invalidate?) → any
```

---

## WateringService

Cache key: `watering_records_data` (dictionary keyed by plant ID)
Events: `WateringEvents.RECORDS_CHANGED`, `WateringEvents.FERTILIZER_TYPES_CHANGED`

```typescript
WateringService.getWateringRecords(plantId, forceUpdate?) → WateringRecord[]
WateringService.getFertilizerTypes(forceUpdate?)          → FertilizerType[]
WateringService.addWateringRecord(plantId, data)          → any
WateringService.editWateringRecord(plantId, recordId, data) → any
WateringService.deleteWateringRecord(plantId, recordId)   → any
```

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
