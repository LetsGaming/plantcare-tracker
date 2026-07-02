# Architecture

## Overview

The frontend is a Vue 3 + Ionic mobile-first PWA. The data layer follows a
**service-centric architecture** with a two-tier cache (L1 in-memory + L2 persistent)
that mirrors the backend's clean separation of concerns.

```
┌─────────────────────────────────────────────────────────────┐
│  Views / Components      Ionic Vue, Vue Router              │
├─────────────────────────────────────────────────────────────┤
│  Services                Business logic, cache, mutations   │
├─────────────────────────────────────────────────────────────┤
│  Mappers                 V2 API shapes → frontend models    │
├─────────────────────────────────────────────────────────────┤
│  ApiUtils / TokenUtils   HTTP, SSE, JWT, error handling     │
├─────────────────────────────────────────────────────────────┤
│  V2 Backend API          /api/v2/*                          │
└─────────────────────────────────────────────────────────────┘
```

## Layer Responsibilities

| Layer | Files | Responsibility |
|-------|-------|----------------|
| Views | `src/views/**/*.vue` | Page-level routing and layout |
| Components | `src/components/**/*.vue` | Reusable UI components |
| Services | `src/services/*.ts` | Data fetching, caching, mutations |
| Base | `src/services/base/BaseService.ts` | Two-tier cache, event bus, request dedup |
| Mappers | `src/mapping/*.ts` | Transform V2 API responses to frontend types |
| Types | `src/types/*.d.ts` | TypeScript interfaces for both API and frontend |
| ApiUtils | `src/utils/apiUtils.ts` | Fetch wrapper, error handling, SSE streams |
| Utils | `src/utils/utils.ts` | Date formatting, search, config |

## Service Pattern

Every entity service extends `BaseService` and follows the same pattern:

```
getAllXxx(forceUpdate?)      → cache-first fetch, full list
getXxxById(id, forceUpdate?) → cache-first fetch, single item
addXxx(data)                 → mutation, cache updated with the result
editXxx(id, data)            → mutation, cache updated with the result
deleteXxx(id)                → mutation, item removed from the cache
```

Services emit DOM `CustomEvent`s **whenever their cache changes** — a fetch,
an optimistic paint, a reconcile, or a rollback. The cache is the single
source of truth; mutations never leave it stale.

### Mutation strategy

Two strategies exist, chosen per domain:

| Strategy | Used by | Behaviour |
|----------|---------|-----------|
| **Optimistic** | Plants (create/edit/delete), Watering (add/edit/delete) | The expected outcome is painted into the cache immediately (creates use a temporary **negative id**). The request runs; on success the painted item is swapped in place for the server resource (reconcile), on failure only the affected item is rolled back — concurrent changes to siblings survive. Implemented once in `BaseService` (`optimisticListUpsert/Remove` + dictionary variants). |
| **Pessimistic** | Substrates (multi-request create/edit with components), admin Components, Profile | The request runs first; the server-confirmed resource is then upserted into the cache. |

In both cases the V2 backend returns the **full resource** from every
mutation, so the cache is updated from server truth without follow-up
fetches. `handleRequest` owns the single error toast for a failed request;
views never add a second one.

### View pattern

Views and data-bearing components subscribe in `mounted` and unsubscribe in
`beforeUnmount` (Ionic keeps pages alive, so the ionView hooks are the wrong
place for listeners):

```typescript
mounted() {
  document.addEventListener(PlantEvents.PLANTS_UPDATED, this.handlePlantsUpdated);
},
beforeUnmount() {
  document.removeEventListener(PlantEvents.PLANTS_UPDATED, this.handlePlantsUpdated);
},
methods: {
  // Handlers only READ the cache and re-derive via the service getters —
  // they never mutate and never refetch after a mutation.
  async handlePlantsUpdated() {
    this.plants = await PlantService.getPersonalPlants();
  },
},
```

Because every optimistic paint fires the event, mutation handlers in views
reduce to: fire the service call, close the modal, let the event repaint the
page. There are no manual post-mutation refreshes.

## Two-Tier Cache

```
Request
  │
  ├──▶ L1 (Map<string, { data, timestamp }>)
  │       Fast in-memory lookup
  │       Evicted FIFO (insertion order) when > 500 entries
  │       Shared across all services
  │
  └──▶ L2 (@ionic/storage — IndexedDB / SQLite)
          Survives page reloads and app restarts
          Expiry configurable per environment (config.json)
          Entries carry keepOnClear flag for sales data
```

On a cache miss, the service fetches from the API, writes to both L1 and L2,
and emits a DOM event so all listening views refresh.

**Request deduplication:** If two components call the same `getCachedData` key
simultaneously, `BaseService` coalesces them into a single in-flight request.

## SSE Streaming

Sales and MoreInfo data arrive via Server-Sent Events. The flow is:

```
1. POST /auth/ticket           → { ticket: string }  (no body required in V2)
2. GET  /sales?ticket=…        → EventSource
3. message events              → single APISale per event
4. done event                  → { total: number }
5. EventSource closed
```

MoreInfo follows the same pattern with `{ type: "link"|"ai_chunk", value }` events
and a `done` event with `{ status: "completed" }`.

## Error Handling

`ApiUtils.handleResponse` parses the V2 error envelope and throws a typed `ApiError`:

```typescript
// V2 error envelope
{ error: { type: "ValidationError", message: "...", statusCode: 400, fields?: {...} } }

// Mapped to ApiError
err.status      // 400
err.message     // "..."
err.errorType   // "ValidationError"
err.fields      // { fieldName: "reason" }
```

`BaseService.handleRequest` catches all `ApiError` instances, shows a translated
toast notification, and re-throws so views can react.
