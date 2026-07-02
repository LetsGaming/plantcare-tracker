# Architecture

## Clean Architecture

V2 follows [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) principles. **Every module** is split into the same four layers:

```
┌─────────────────────────────────────────────┐
│  Presentation   HTTP: routes, controllers   │
├─────────────────────────────────────────────┤
│  Application    Use cases, validation       │
├─────────────────────────────────────────────┤
│  Domain         Entities, ports (interfaces)│
├─────────────────────────────────────────────┤
│  Infrastructure SQLite repos, APIs, files   │
└─────────────────────────────────────────────┘
```

**Dependency rule:** inner layers know nothing about outer layers. Domain has zero framework imports. Infrastructure imports Domain but not Application. Application imports Domain. Presentation imports Application and Infrastructure (for wiring only) and never reaches past the application layer for behavior.

### Layer Responsibilities

| Layer | Knows about | Example files |
|-------|-------------|---------------|
| Domain | Nothing external | `Plant.ts`, `PlantRepository` interface, `ImageStorage` port |
| Application | Domain only | `PlantUseCases.ts`, `SubstrateUseCases.ts`, `StreamPlantInfo.ts` |
| Infrastructure | Domain (implements ports) | `SQLitePlantRepository.ts`, `LocalImageStorage.ts`, `OpenAIClient.ts` |
| Presentation | Application + Infrastructure | `plantsRoutes.ts`, `plantsController.ts` |

Zod input schemas live in the **application** layer next to the use cases that consume them; parsing goes through the shared `parseOrThrow` helper (`core/validation`), which turns issues into a `ValidationError` with a per-field `fields` map.

### Example: Plants Module

Every module mirrors this tree — plants, watering, substrate, components, images, sales, moreInfo, auth:

```
src/modules/plants/
├── domain/
│   └── Plant.ts                 # Plant entity + PlantRepository port
├── application/
│   └── PlantUseCases.ts         # GetAll, GetOne, Create, Update, Delete + zod schemas
├── infrastructure/
│   └── SQLitePlantRepository.ts # Implements PlantRepository with SQL
└── presentation/
    ├── plantsController.ts      # Thin HTTP adapter (asyncHandler + typed responses)
    └── plantsRoutes.ts          # Express Router, middleware wiring (composition root)
```

Two modules have additional ports beyond the repository:

- **images** — `ImageStorage` (implemented by `LocalImageStorage`): converts uploads to WebP, extracts EXIF capture dates, serves resized reads, deletes files. A future object-storage backend only has to satisfy this interface.
- **moreInfo** — `PlantGuideStreamer` (OpenAI adapter) and `PlantLinkSearcher` (7 scraper/API adapters), orchestrated by the `StreamPlantInfoUseCase`.

## Dependency Injection

Dependencies are injected via constructors — plain factory functions and `new`, no DI container. Since the SQLite handle is a process-wide singleton (`core/database/db.ts`), each **router factory is its own composition root**:

```typescript
// server.ts — mounts the routers, nothing else
app.use(`${V}/plants`, createPlantsRouter());

// plantsRoutes.ts — composition root of the module
export const createPlantsRouter = (): Router => {
  const repo = new SQLitePlantRepository();     // concrete infra (uses db singleton)
  const ctrl = createPlantsController(repo);    // use cases injected with the port
  // ...
};
```

Use cases receive **repository interfaces**, never concrete classes. This makes them fully testable without a database:

```typescript
// In tests — swap the real repo for a mock
const repo: PlantRepository = {
  findAllPublic: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue(42),
  // ...
};
const useCase = new CreatePlantUseCase(repo);
```

Create and update use cases return the **full, freshly-read resource** (create → read-back), so controllers contain no orchestration — they parse HTTP inputs, call one use case, and shape the response.

## Core Layer

`src/core/` contains shared infrastructure used by all modules. It has no business logic.

### `core/config/`

Single source of truth for values that must agree across files:

- **`constants.ts`** — `HTTP_STATUS` (success codes used by controllers), `AUTH` (bcrypt cost, session limits, cookie names/lifetimes, SSE ticket TTL), `AUTH_RATE_LIMIT`, `SSE` (heartbeat interval, chunk size, event names)
- **`apiVersion.ts`** — `getApiVersionPath()` / `getApiBasePath()`: resolves `/api/vX` from `API_VERSION_PATH` or package.json (used by `server.ts` and the auth module's cookie scoping)
- **`uploads.ts`** — `STATIC_UPLOADS_ROUTE` + `getUploadsDirectory()`: the static mount in `server.ts` and the URL builder in the images module resolve from the same place

Error status codes are **not** listed here — each `AppError` subclass owns its code (see [Error Handling](./error-handling.md)).

### `core/validation/`

`parseOrThrow(schema, input, message)` — runs a zod schema and converts failures into a `ValidationError` carrying a `fields` map (`{ "species": "Species is required" }`). Used by every use case.

### `core/errors/`

Typed error hierarchy that carries HTTP status codes. Thrown anywhere in the application, caught once in `globalErrorHandler`.

```
AppError (base)
├── ValidationError    400
├── UnauthorizedError  401
├── ForbiddenError     403
├── NotFoundError      404
├── ConflictError      409
└── InternalError      500
```

### `core/middleware/`

- **`auth.ts`** — JWT verification, session store, ticket store, `authenticateToken`, `optionalAuthenticateToken`, `isAdmin`, `checkGuestPermission`, `makeAuthenticateSSE({ loadUserFromDb })`
- **`asyncHandler.ts`** — re-export of `express-async-handler`; wraps every async controller so rejections reach the global error handler
- **`errorHandler.ts`** — `globalErrorHandler` (maps `AppError` to the JSON error envelope) + `notFoundHandler`
- **`requestId.ts`** — assigns UUID per request, stores in `AsyncLocalStorage`

### `core/sse/`

Server-Sent Events as a cross-cutting transport concern (previously `SseManager` lived inside the sales module and was imported across module boundaries by moreInfo):

- **`SseManager.ts`** — stream writer: headers, heartbeat, `send`, `sendUnique` (id-deduplicated, chunked), terminal `end` (`event: done`), `fail` (`event: error`), `dispose`
- **`sseEndpoint.ts`** — `createSseEndpoint({ name, errorMessage, doneMessage?, prepare?, run })`: the shared lifecycle every SSE route uses. `prepare` runs **before** the stream opens, so validation failures still return a regular JSON 400; after the headers are on the wire, failures become `error` events.

### `core/logging/`

Winston logger with request-ID correlation via `AsyncLocalStorage`. Every log line automatically includes the `requestId` of the active request without manual passing:

```typescript
// Any module can do this — requestId is injected automatically
const log = createModuleLogger('PlantsController');
log.info('Plant created', { plantId: 7 });
// Output: 14:23:01 | [info] [abc-123] {PlantsController}: Plant created | {"plantId":7}
```

### `core/cache/`

A thin `CacheService` interface over `node-cache`. Swappable for Redis without touching any module code.

```typescript
interface CacheService {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlSeconds?: number): void;
  delete(key: string): void;
  flush(): void;
}
```

### `core/database/`

`db.ts` — the better-sqlite3 singleton plus thin `query` / `execute` / `transaction` helpers used by every repository. WAL mode, schema auto-applied on first run.

### `core/utils/`

Pure utility functions with no side effects:

- `formatToDBDate(input)` — converts timestamp/Date/string to SQL `DATETIME` string format
- `ensureArray(value)` — normalizes any value to an array (including index-keyed objects from form serializers)
- `filterDuplicatesById(items, key)` — deduplicates arrays by a key (used for public + private merge)

## Module: Sales

The Sales module has the most complex internal architecture due to its multi-source scraping pipeline:

```
createSalesRouter()
  └── createSalesController(sources)      ← returns createSseEndpoint({ run })
        └── FetchSalesOverview.execute()
              ├── Concurrency limiter (max 2 Chromium, max 8 Axios)
              ├── BaseScraper.fetchPage()  ← each scraper
              │     ├── buildPageUrl()
              │     ├── fetchHtml() (Axios or Playwright)
              │     ├── node-html-parser → defaultParseFn or custom parseFn
              │     └── CacheService (per-page, 24h TTL)
              └── Sale.fromRaw() → dedup by sale_id → sse.sendUnique()
```

Scrapers inherit from `BaseScraper` and only provide config. Complex parsers (Foliage Dreams, Harmony Plants) provide a custom `parseFn`. The concurrency limiter prevents overloading Playwright by running at most 2 Chromium scrapes simultaneously.

## Module: MoreInfo

```
GET /more-info?ticket=...&plantName=...
  └── makeAuthenticateSSE({ loadUserFromDb: true })   ← DB lookup for full user data
  └── createSseEndpoint
        ├── prepare: parsePlantInfoQuery()             ← 400 as JSON before stream opens
        └── run: StreamPlantInfoUseCase.execute()
              ├── guideStreamer.streamPlantCare()      ← OpenAI GPT-4o-mini, chunked
              └── linkSearchers[]                      ← 7 parallel link scrapers
                    → onEvent({ type: 'ai_chunk' | 'link', value })
```

The OpenAI response is cached as raw Markdown (12h TTL). HTML conversion happens on read, so a cached entry can be served with or without `htmlFormatting`.

---

← [Overview](./overview.md) · **Next:** [Setup](./setup.md)
