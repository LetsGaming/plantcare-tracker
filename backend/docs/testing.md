# Testing

## Stack

| Tool | Role |
|------|------|
| [Vitest](https://vitest.dev) | Test runner, assertions, mocks |
| Fastify `inject` | In-process HTTP requests, no sockets |
| `@vitest/coverage-v8` | Native V8 coverage reports |

## Setup

```bash
pnpm add -D vitest @vitest/coverage-v8
```

## Running Tests

```bash
pnpm run test              # run all tests once
pnpm run test:watch        # watch mode (re-runs on file change)
pnpm run test:coverage     # run with coverage report → ./coverage/

# Filter by path
pnpm run test tests/unit
pnpm run test tests/integration
pnpm run test tests/unit/core
```

## Local mock stack

`scripts/dev-up.mjs` (repository root) starts `src/tools/devServer.ts`, which builds the app with the same
dependency seams the contract tests use (`createSources`, `guideStreamer`, `linkSearchers`) filled by
`src/tools/devMocks.ts`, then seeds data through the real API (`scripts/dev/seed`). It is for manual and browser
checks, not part of the test run.

## Contract tests (HTTP level)

`tests/contract/` drives the whole application through its public HTTP interface against a **real SQLite file** built by the migrations. Only the network-facing collaborators are replaced: sales sources, the OpenAI guide streamer and the link searchers are injected through `buildApp({ sales, moreInfo })`. Nothing in the database layer is mocked, so these tests see real constraints, the real body parser, real Sharp processing and the real error pipeline.

```
tests/contract/
├── harness.ts                 # TestClient interface, Fastify inject adapter, createContractApp()
├── support.ts                 # fixtures (createPlant, ...) and the SSE frame parser
├── platform.contract.test.ts  # health, 404, X-Request-Id, CORS, body parser edge cases
├── auth.contract.test.ts      # register, login, guest, refresh, ticket, logout, profile
├── plants / substrates / components / watering / images .contract.test.ts
├── sales.contract.test.ts     # SSE stream, source health endpoints
├── moreInfo.contract.test.ts  # SSE stream, ticket handling, validation
└── routes.contract.test.ts    # 401 and guest 403 matrix over every authenticated route
```

Rules for contract tests:

- Talk to `TestClient.request({ method, url, json | rawBody | multipart, headers, cookies })` only. Never import Fastify or any HTTP library in a test file: `harness.ts` is the single place that knows the transport, so the same test files can run unchanged against another server implementation.
- Create users with `app.signIn(role)` (inserts a row and mints a session without HTTP). Use the real `/auth/register` and `/auth/login` endpoints only where those endpoints are under test; the auth routes are rate limited to 50 requests per IP and 10 per account in 15 minutes.
- Each test file builds its own app and temp database (`createContractApp()`); use unique names instead of resetting state.
- Behavior that is wrong today but pinned on purpose lives in a `known defects` block that names the finding. Fixing the behavior means flipping that test in the same change. A few remain: public `/uploads` files are served without authentication, and the access token cookie is ignored by design.

## Test Structure

```
tests/
├── helpers/
│   └── mockFactory.ts          # User row factory for use case tests
│
├── unit/
│   ├── core/
│   │   ├── utils.test.ts       # formatToDBDate, ensureArray, filterDuplicatesById
│   │   ├── errors.test.ts      # AppError hierarchy, isAppError guard
│   │   ├── auth.test.ts        # tokens, sessionStore, ticketStore, auth hooks
│   │   ├── rateLimit.test.ts   # Limiter hooks on a Fastify instance
│   │   └── publicImageUrl.test.ts # Stored image paths and public urls
│   └── modules/
│       ├── plants.test.ts      # Plant entity + all 5 PlantUseCases
│       ├── watering.test.ts    # toEpochSeconds + all 6 WateringUseCases
│       ├── substrate.test.ts   # Ownership guard, dedupe, component parsing
│       ├── components.test.ts  # Catalogue CRUD use cases
│       ├── images.test.ts      # Image use cases incl. file/DB ordering rules
│       ├── moreInfo.test.ts    # parsePlantInfoQuery + StreamPlantInfo orchestration
│       ├── auth.test.ts        # All 8 AuthUseCases (register, login, logout, …)
│       ├── sales.test.ts       # Sale entity, scrapeHelpers, FetchSalesOverview
│       ├── BaseScraper.test.ts, scraperStrategies.test.ts, shopSearchers.test.ts
│       ├── openAiClient.test.ts # Stream errors surface, cached output is escaped
│       ├── imageCleanup.test.ts # Image removal when an entity is deleted
│       └── speciesResolver.test.ts # Fuzzy species matching over an in-memory catalog
│
└── integration/
    ├── repositories.test.ts    # Every SQLite repository against an in-memory database
    ├── migrations.test.ts      # Baseline, adopting a legacy database, image data migrations
    └── importMysqlDump.test.ts # Legacy dump import on a fixture dump
```

### What Each File Covers

**`helpers/mockFactory.ts`**  
Exports `makeUserRow`, the user row used by the auth use case tests.

**`unit/core/auth.test.ts`**  
- `generateTokens` — payload, relative expiry
- `sessionStore`: create/has, FIFO eviction at max 3, end, deleteAll
- `ticketStore` — single-use, 60s expiry (using `vi.useFakeTimers`)
- `authenticateToken` — header only, missing token or ended session → 401
- `guestReadOnly` — blocks unsafe methods for live guest sessions, passes everyone else
- `isAdmin` — blocks non-admins

**`integration/repositories.test.ts`**  
Runs every repository against a real in-memory SQLite database built by the migrations (`DB_PATH=:memory:`), so queries, constraints and the baseline migration are exercised together:
- Migrations: baseline recorded once, seed rows present, re-running changes nothing
- Plants: JOIN collapsing, close species reuse, no stray species when the insert fails, ownership-scoped update and delete, images oldest first with absolute urls
- Watering: ownership-checked insert, boolean mapping, clearing the fertilizer type
- Substrates: component and image collapsing, rounding, transactional batch rollback, upsert, delete
- Users: unique names ignoring case, column whitelist, guest account protected
- Images: date ordering, update, per-entity delete; entity lookup; source health upsert

**`integration/importMysqlDump.test.ts`**  
Imports `tests/fixtures/mysql-dump.sql` (a dump whose roles and guest user collide with the seed rows) and checks the copied data, image mapping, case-folded species and the recorded baseline migration.

The HTTP behavior formerly tested by a hand-wired Express app (auth flow, CRUD, error shapes, cookie scoping) is covered by the contract suite above.

## Coverage Thresholds

Configured in `vitest.config.ts` and enforced in CI through `pnpm run test:coverage`:

| Metric | Target |
|--------|--------|
| Lines | 70% |
| Functions | 70% |
| Branches | 60% |
| Statements | 70% |

Coverage reports are written to `./coverage/` in `text`, `lcov`, and `html` formats. Open `./coverage/index.html` in a browser for the full interactive report.

## Writing Unit Tests for a New Module

### 1. Use Case Test

```typescript
// tests/unit/modules/myModule.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MyUseCase } from '../../../src/modules/myModule/application/MyUseCases';
import { NotFoundError, ValidationError } from '../../../src/core/errors';

// Create a minimal mock repo — only mock what the use case calls
const makeMockRepo = () => ({
  findById: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue(1),
});

describe('MyUseCase', () => {
  it('returns data for a valid id', async () => {
    const repo = makeMockRepo();
    repo.findById.mockResolvedValue({ id: 1, name: 'Test' });

    const result = await new MyUseCase(repo).execute(1);
    expect(result.name).toBe('Test');
  });

  it('throws NotFoundError for unknown id', async () => {
    const repo = makeMockRepo();
    await expect(new MyUseCase(repo).execute(999)).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError for invalid input', async () => {
    const repo = makeMockRepo();
    await expect(new MyUseCase(repo).execute({ name: '' })).rejects.toThrow(ValidationError);
  });
});
```

### 2. Repository Test

Repositories are tested against a real in-memory database; there is nothing to mock:

```typescript
process.env.DB_PATH = ':memory:';

import { initDatabase, closeDb } from '../../src/core/database/db';

beforeAll(initDatabase);
afterAll(closeDb);

it('create returns the new id', async () => {
  const id = await new SQLiteMyRepository().create({ name: 'test' });
  expect(await new SQLiteMyRepository().findById(id)).toMatchObject({ name: 'test' });
});

it('findById returns null when no rows', async () => {
  expect(await new SQLiteMyRepository().findById(999)).toBeNull();
});
```

### 3. Contract Test for a New Route

Add a `*.contract.test.ts` file next to the others. It talks to the app only through `TestClient.request`:

```typescript
const app = await createContractApp();
const { auth } = await app.signIn('user');

const res = await app.client.request({ method: 'get', url: '/api/v2/my-module', headers: auth });
expect(res.status).toBe(200);
```

## Vitest Configuration

Key settings in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    globals: true,           // describe/it/expect without imports
    environment: 'node',
    testTimeout: 10_000,     // generous for bcrypt operations
    pool: 'forks',           // process isolation (sessionStore is global state)
    include: ['tests/**/*.test.ts'],
  },
});
```

`pool: 'forks'` is important — the in-memory `sessionStore` and `ticketStore` are module-level singletons. Running tests in separate processes prevents bleed-through between test files.

---

← [Error Handling](./error-handling.md) · **Next:** [Deployment](./deployment.md)
