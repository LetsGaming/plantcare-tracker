# Architecture

## Overview

The frontend is a Vue 3 + Ionic mobile-first PWA written with the **Options API**
(no `<script setup>`; a test enforces it). State lives in **Pinia stores**, one per
data domain. Stores are the single reactive source of truth: components bind to
store state and getters, so there is no event bus and no per-component copy of
server data.

```
┌─────────────────────────────────────────────────────────────┐
│  Views / Components      Ionic Vue, Vue Router, Options API │
│                          mapState / mapActions              │
├─────────────────────────────────────────────────────────────┤
│  Stores                  Pinia: state, getters, actions,    │
│                          optimistic helper, L2 persistence  │
├─────────────────────────────────────────────────────────────┤
│  Mappers                 V2 API shapes → frontend models    │
├─────────────────────────────────────────────────────────────┤
│  ApiUtils / TokenUtils   HTTP, SSE, JWT, error handling     │
├─────────────────────────────────────────────────────────────┤
│  V2 Backend API          /api/v2/*                          │
└─────────────────────────────────────────────────────────────┘
```

Visual language, tokens, shared components and screen states are described in the
[design system](./design-system.md); this page covers data flow.

## Layer Responsibilities

| Layer | Files | Responsibility |
|-------|-------|----------------|
| Views | `src/views/**/*.vue` | Page-level routing and layout |
| Components | `src/components/**/*.vue` | Reusable UI components |
| Stores | `src/stores/*.ts` | Data fetching, caching, mutations (see [Stores](./stores.md)) |
| Store infrastructure | `src/stores/{pinia,persistence,optimistic,resource}.ts` | App pinia, L2 persistence plugin, optimistic helper, loading state and request coalescing |
| Services | `src/services/**` | Stateless helpers: `ImageService`, `StorageService` (L2 driver), `ToastService`, `LocalizationService` |
| Mappers | `src/mapping/*.ts` | Transform V2 API responses to frontend types |
| Types | `src/types/*.d.ts` | TypeScript interfaces for both API and frontend |
| ApiUtils | `src/utils/apiUtils.ts` | Fetch wrapper, error handling, SSE streams |
| Utils | `src/utils/*.ts` | Dates, search, config, `requestFeedback` (error toast wrapper), `markdown` (guide renderer) |

Dependencies point downwards only. The transport (`ApiUtils`) never imports a store: the
session store hands it a refresh/teardown bridge at startup (`ApiUtils.configureAuth`).
`import-x/no-cycle` enforces the absence of import cycles in lint.

## Store pattern

Every collection store (`plants`, `substrates`, `components`, `watering`, `sales`,
`moreInfo`) follows the same shape:

```
state:    items (or a dictionary), status: idle | loading | ready | error, fetchedAt
getters:  derived lists (personal, public, byId), isStale
actions:  ensureLoaded({ force })   cache-first load, concurrent callers share one request
          getXxx(id, force?)        one item, fetched when missing
          addXxx / editXxx / deleteXxx
```

Components use the stores through the Options API helpers:

```typescript
computed: {
  ...mapState(usePlantsStore, ["personalPlants", "publicPlants"]),
  plants(): Plant[] {
    return this.isPublic ? this.publicPlants : this.personalPlants;
  },
},
methods: {
  ...mapActions(usePlantsStore, ["ensureLoaded"]),
},
```

A view loads in `ionViewWillEnter` (Ionic keeps pages mounted) and renders from getters.
Every change, including an optimistic paint or a rollback, repaints through reactivity;
views never refetch after a mutation.

### Mutation strategy

| Strategy | Used by | Behaviour |
|----------|---------|-----------|
| **Optimistic** | Plants and watering (create/edit/delete) | The expected outcome is painted into the store at once (creates use a temporary **negative id**). The request runs; on success the item is swapped in place for the server resource, on failure only that item is restored. Implemented once in `stores/optimistic.ts`. |
| **Pessimistic** | Substrates, admin components, profile | The request runs first; the server-confirmed resource is then upserted. |

The V2 backend returns the **full resource** from every mutation, so no follow-up fetch
is needed. `handleRequest` (`utils/requestFeedback.ts`) owns the single error toast for a
failed request; views never add a second one.

## Two-tier cache

```
Component ── getter ──▶ Pinia state (L1, reactive, in memory)
                            │  ensureLoaded: hydrate once, fetch when missing or stale
                            ▼
                        l2Persistence plugin ──▶ @ionic/storage (L2, survives restarts)
```

- Stores opt in with a `persist` option listing entries `{ key, pick, apply, timestamp, keepOnClear, allowExpired }`.
  Entries use the envelope `{ data, timestamp, keepOnClear }`.
- Hydration is explicit and on demand (`store.$hydrate()`, called by `ensureLoaded`). Expired
  entries are skipped unless the entry sets `allowExpired` (sales, calendar settings).
- Writes are debounced and **only for changed data**. An entry with a fetch time is written only
  once it has one, so a store that is merely loading cannot replace a good snapshot with an empty one.
- `$reset` cancels pending writes. Ending a session calls `resetAllStores()` and clears the
  non-persistent storage, so the next account cannot see the previous one's data.
- `keepOnClear` entries (sales, calendar) survive logout; only an account deletion wipes them.

## Session

`stores/session.ts` owns the access token, the identity getters (`isAdmin`, `isGuest`,
`username`, `userId`), login, guest login, logout, profile changes and `refresh`. Refresh is
**single flight**: concurrent 401s share one request. A 401 from the refresh endpoint is final;
other failures are retried three times. The router guard reads the store and tears the local
session down through an injected redirect.

## SSE Streaming

Sales and MoreInfo data arrive via Server-Sent Events:

```
1. POST /auth/ticket           → { ticket: string }  (no body required in V2)
2. GET  /sales?ticket=…        → EventSource
3. message events              → APISale[] batch per event
4. done event                  → { total: number }
5. EventSource closed
```

MoreInfo follows the same pattern with `{ type: "link"|"ai_chunk", value }` events and a `done`
event with `{ status: "completed" }`. The stores accumulate a **draft** while a stream runs
(`incoming` for sales, `drafts` for more-info) and commit it on `done`. A failed stream leaves the
previous data untouched and never persists partial results. AI text is HTML-escaped by
`utils/markdown.ts` before it is rendered.

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

`handleRequest` catches failures, shows a translated toast and re-throws so views can react.
Only a `401` triggers the refresh cycle; a `403` (for example a guest attempting a write) is shown
as a normal error. `describeUserFixableError` turns `400`/`409` answers into the text for a form.
