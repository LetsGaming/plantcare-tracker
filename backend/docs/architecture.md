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
│   ├── Plant.ts                 # Plant entity + PlantRepository port
│   └── SpeciesResolver.ts       # Species matching service + SpeciesCatalog port
├── application/
│   └── PlantUseCases.ts         # GetAll, GetOne, Create, Update, Delete + zod schemas
├── infrastructure/
│   ├── SQLitePlantRepository.ts # Implements PlantRepository with SQL
│   └── SQLiteSpeciesCatalog.ts  # Implements SpeciesCatalog
└── presentation/
    ├── plantsController.ts      # Thin HTTP adapter (typed responses)
    └── plantsRoutes.ts          # Fastify plugin, hook wiring (composition root)
```

Two modules have additional ports beyond the repository:

- **images** — `ImageStorage` (implemented by `LocalImageStorage`): converts uploads to WebP, extracts EXIF capture dates, serves resized reads, deletes files. A future object-storage backend only has to satisfy this interface.
  The module also exports `EntityImageCleanup` (`createImageCleanup()`): plants, substrates and components call it after deleting an entity, which removes the image rows and files. Cleanup failures are logged, never raised, because the entity is already gone.
- **moreInfo** — `PlantGuideStreamer` (OpenAI adapter) and `PlantLinkSearcher` (7 scraper/API adapters), orchestrated by the `StreamPlantInfoUseCase`.

## Dependency Injection

Dependencies are injected via constructors, using plain factory functions and `new` (no DI container). Since the database connection is a process-wide singleton (`core/database/db.ts`), each **route plugin is its own composition root**:

```typescript
// app.ts: registers the plugins, nothing else
await app.register(plantsRoutes, { prefix: `${V}/plants` });

// plantsRoutes.ts — composition root of the module
export const plantsRoutes: FastifyPluginAsync = async (app) => {
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

- **`constants.ts`**: `HTTP_STATUS` (success codes used by controllers), `AUTH` (bcrypt cost, session limits, refresh cookie name/lifetimes, SSE ticket TTL), `AUTH_RATE_LIMIT`, `USER_RATE_LIMIT`, `SSE` (heartbeat interval, chunk size, event names)
- **`env.ts`**: the only reader of `process.env`. `loadConfig()` returns a typed, validated `AppConfig` (ports, origins, database and upload paths, JWT settings, OpenAI key, headless flag) and throws when `JWT_SECRET` or `JWT_REFRESH_SECRET` is missing; `getConfig()` memoizes it. `server.ts` resolves it first thing so a misconfigured process fails at boot.
- **`apiVersion.ts`**: `getApiVersionPath()` / `getApiBasePath()` resolve `/api/vX` from `API_VERSION_PATH` or package.json (used by `app.ts` and the auth module's cookie scoping)
- **`uploads.ts`**: `STATIC_UPLOADS_ROUTE` + `getUploadsDirectory()`, plus `toStoredImagePath()` (the origin-free path persisted for an upload) and `toPublicImageUrl()` (adds `PUBLIC_BASE_URL`, else the request origin held in `requestContext`, to a stored path). Repositories apply it on read, so responses keep absolute URLs.

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

### `core/auth/`

Framework-free authentication primitives, importable from application code: the session store and policies, the one-time ticket store, token signing and verification (`issueSession`, `signAccessToken`, `verifyRefreshToken`, `readAccessSession`) and the `AuthUser` / `TokenIdentity` / `JwtPayload` types.

### `core/middleware/`

- **`auth.ts`**: Fastify hooks over `core/auth`: `authenticateToken`, `optionalAuthenticateToken`, `isAdmin`, `makeGuestReadOnly(basePath)`, `makeAuthenticateSSE({ loadUserFromDb })`. Hooks throw AppErrors.
- **`rateLimit.ts`**: `createLimiter(app, options)` returns a `preHandler` hook with its own bucket (several limiters can guard one route); `perUserKey`
- **`requestId.ts`**: request id generation (a client id is honored only when short and URL-safe) and the `AsyncLocalStorage` request context
- **`types.ts`**: `Handler`, `Hook`, `numericParam`, and the `request.user` augmentation
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

- **`db.ts`**: the better-sqlite3 connection (WAL, foreign keys on) and a Kysely instance over it. Repositories use `getKysely()` for typed queries and transactions; `getSqlite()` is the raw handle for health checks and the synchronous source-health store. `initDatabase()` applies pending migrations and must finish before the server listens.
- **`schema.ts`**: the `Database` interface (one type per table) that Kysely checks queries against. Keep it in step with the migrations.
- **`migrations/`**: ordered migrations registered in `index.ts`. `0001_baseline` is idempotent, so it is simply recorded on databases created before migrations existed. Kysely keeps the history in the `kysely_migration` table. Add schema changes as new numbered files; never edit an applied one.

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
              │     ├── CacheService (per-page, 24h TTL)
              │     ├── strategies, in order, first valid result wins:
              │     │     shopifyJson → selector → jsonLd → heuristic
              │     ├── Shopify detection if all strategies fail
              │     └── SourceHealthReporter.record()  (page 1 only)
              └── Sale.fromRaw() → dedup by sale_id → sse.sendUnique()
```

Scrapers inherit from `BaseScraper` and only provide config. `BaseScraper` runs the configured extraction strategies in order and accepts the first result that passes validation (at least one item for HTML strategies, and at least 80% of items with a link, a name and a real discount). A page change therefore degrades a source instead of silently emptying it.

| Strategy | Source of data | Notes |
|----------|----------------|-------|
| `shopifyJson` | `<collection>/products.json` | Primary for the seven Shopify shops. An empty feed counts as a valid, empty sale. |
| `selector` | CSS selectors from the shop config | Selector fields accept a list of candidates. Foliage Dreams and Harmony Plants use a custom `parseFn`. |
| `jsonLd` | `application/ld+json` product data | Needs a strike-through price in the markup. |
| `heuristic` | Struck-through prices and the surrounding card | Last resort. It refuses containers holding several products rather than guessing a link. |

If every strategy fails but the page carries Shopify markers, the products feed of the redirected collection is tried, which is how a platform migration heals itself.

Sale ids hash `seller|normalized url`. For Shopify products the normalized path is always `/products/<handle>`, so the same product keeps its id regardless of which strategy or collection path produced the link.

The concurrency limiter prevents overloading Playwright by running at most 2 Chromium scrapes simultaneously.

### Source health

Each page 1 scrape reports a `ScrapeOutcome` to `core/scrapeHealth`, which stores one row per source in `scrape_source_health` (created by the baseline migration). The plant link searchers of the MoreInfo module report to the same table under `search:<shop>` keys. Admins read the rows through `GET /sales/health` (see the API reference). Reporting failures are logged and never break a scrape.

Strategies are always tried in configuration order. A source stays `degraded` while a fallback carries it and returns to `ok` on its own once the primary strategy works again.

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
