# Architecture

## Clean Architecture

V2 follows [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) principles. Each module is split into four layers:

```
┌─────────────────────────────────────────────┐
│  Presentation   HTTP: routes, controllers   │
├─────────────────────────────────────────────┤
│  Application    Use cases, orchestration    │
├─────────────────────────────────────────────┤
│  Domain         Entities, repo interfaces   │
├─────────────────────────────────────────────┤
│  Infrastructure MySQL repos, APIs, files    │
└─────────────────────────────────────────────┘
```

**Dependency rule:** inner layers know nothing about outer layers. Domain has zero framework imports. Infrastructure imports Domain but not Application. Application imports Domain. Presentation imports Application and Infrastructure (for DI).

### Layer Responsibilities

| Layer | Knows about | Example files |
|-------|-------------|---------------|
| Domain | Nothing external | `Plant.ts`, `PlantRepository` interface |
| Application | Domain only | `PlantUseCases.ts`, `AuthUseCases.ts` |
| Infrastructure | Domain (implements interfaces) | `MySQLPlantRepository.ts`, `OpenAIClient.ts` |
| Presentation | Application + Infrastructure | `plantsRoutes.ts`, `plantsController.ts` |

### Example: Plants Module

```
src/modules/plants/
├── domain/
│   └── Plant.ts              # Plant entity + PlantRepository interface
├── application/
│   └── PlantUseCases.ts      # GetAll, GetOne, Create, Update, Delete
├── infrastructure/
│   └── MySQLPlantRepository.ts  # Implements PlantRepository with SQL
└── presentation/
    ├── plantsController.ts   # Thin HTTP adapter
    └── plantsRoutes.ts       # Express Router, middleware wiring
```

## Dependency Injection

All dependencies are injected via constructors. The MySQL `Pool` is created once in `server-v2.ts` (the composition root) and passed into each router factory:

```typescript
// server-v2.ts — composition root
const pool = mysql.createPool({ host, user, password, database });

app.use('/api/v2/plants', createPlantsRouter(pool));

// createPlantsRouter:
export const createPlantsRouter = (pool: Pool): Router => {
  const repo = new MySQLPlantRepository(pool);   // concrete infra
  const ctrl = createPlantsController(repo);     // use cases injected with interface
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

## Core Layer

`src/core/` contains shared infrastructure used by all modules. It has no business logic.

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

- **`auth.ts`** — JWT verification, session store, ticket store, `authenticateToken`, `isAdmin`, `checkGuestPermission`, `makeAuthenticateSSE`
- **`errorHandler.ts`** — `globalErrorHandler` (maps `AppError` to JSON) + `notFoundHandler`
- **`requestId.ts`** — assigns UUID per request, stores in `AsyncLocalStorage`

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

### `core/utils/`

Pure utility functions with no side effects:

- `formatToDBDate(input)` — converts timestamp/Date/string to MySQL `DATETIME` format
- `ensureArray(value)` — normalizes any value to an array
- `filterDuplicatesById(items, key)` — deduplicates arrays by a key (used for public + private merge)

## Module: Sales

The Sales module has the most complex internal architecture due to its multi-source scraping pipeline:

```
createSalesRouter()
  └── createSalesController(sources)
        └── FetchSalesOverview.execute()
              ├── Concurrency limiter (max 2 Chromium, max 8 Axios)
              ├── BaseScraper.fetchPage()  ← each scraper
              │     ├── buildPageUrl()
              │     ├── fetchHtml() (Axios or Playwright)
              │     ├── node-html-parser → defaultParseFn or custom parseFn
              │     └── CacheService (per-page, 24h TTL)
              └── Sale.fromRaw() → dedup by sale_id → SseManager.sendUnique()
```

Scrapers inherit from `BaseScraper` and only provide config. Complex parsers (Foliage Dreams, Harmony Plants) provide a custom `parseFn`. The concurrency limiter prevents overloading Playwright by running at most 2 Chromium scrapes simultaneously.

## Module: MoreInfo

```
GET /more-info?ticket=...&plantName=...
  └── makeAuthenticateSSE(pool)   ← DB lookup for full user data
  └── Promise.all([
        aiClient.streamPlantCare()  ← OpenAI GPT-4o-mini, chunked SSE
        searchers[].map()           ← 7 parallel link scrapers
      ])
  └── SseManager.send({ type: 'ai_chunk' | 'link', value })
```

The OpenAI response is cached as raw Markdown (12h TTL). HTML conversion happens on read, so a cached entry can be served with or without `htmlFormatting`.

---

← [Overview](./overview.md) · **Next:** [Setup](./setup.md)
