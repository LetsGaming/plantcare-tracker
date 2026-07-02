# Testing

## Stack

| Tool | Role |
|------|------|
| [Vitest](https://vitest.dev) | Test runner, assertions, mocks |
| [Supertest](https://github.com/ladjs/supertest) | HTTP integration testing |
| `@vitest/coverage-v8` | Native V8 coverage reports |

## Setup

```bash
pnpm add -D vitest @vitest/coverage-v8 supertest @types/supertest
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

## Test Structure

```
tests/
├── helpers/
│   └── mockFactory.ts          # Shared mocks and DB/HTTP fixtures
│
├── unit/
│   ├── core/
│   │   ├── utils.test.ts       # formatToDBDate, ensureArray, filterDuplicatesById
│   │   ├── errors.test.ts      # AppError hierarchy, isAppError guard
│   │   └── auth.test.ts        # generateTokens, sessionStore, ticketStore, middleware
│   └── modules/
│       ├── plants.test.ts      # Plant entity + all 5 PlantUseCases
│       ├── watering.test.ts    # toEpochSeconds + all 6 WateringUseCases
│       ├── substrate.test.ts   # Ownership guard, dedupe, component parsing
│       ├── components.test.ts  # Catalogue CRUD use cases
│       ├── images.test.ts      # Image use cases incl. file/DB ordering rules
│       ├── moreInfo.test.ts    # parsePlantInfoQuery + StreamPlantInfo orchestration
│       ├── auth.test.ts        # All 8 AuthUseCases (register, login, logout, …)
│       ├── sales.test.ts       # Sale entity, scrapeHelpers, FetchSalesOverview
│       └── repositories.test.ts # SQLite repos with the db module mocked
│
└── integration/
    └── app.test.ts             # Full HTTP cycle: auth flow, CRUD, error shapes
```

### What Each File Covers

**`helpers/mockFactory.ts`**  
Central source of truth for test doubles. Exports `createMockRequest`, `createMockResponse`, `createMockNext`, typed user fixtures (`adminUser`, `regularUser`, `guestUser`), and DB row builders (`makePlantRow`, `makeWateringRow`, etc.).

**`unit/core/auth.test.ts`**  
- `generateTokens` — payload, relative expiry
- `sessionStore` — save/retrieve, FIFO eviction at max 3, invalidate, deleteAll
- `ticketStore` — single-use, 60s expiry (using `vi.useFakeTimers`)
- `authenticateToken` — header + cookie paths, missing token → 401, missing session → 403
- `checkGuestPermission` — blocks non-GET for guests, passes for users
- `isAdmin` — blocks non-admins

**`unit/modules/repositories.test.ts`**  
Tests SQL correctness and row-mapping logic without a real database:
- Plants: JOIN row collapsing, multi-image dedup, `affectedRows` → boolean
- Watering: `used_fertilizer` cast to boolean, `fertilizerTypeId: null` handled correctly
- Substrates: component + image collapsing, `INSERT OR REPLACE` SQL, empty array early return
- UserRepository: column whitelist — injecting `malicious` or `role_id` keys has no effect
- ImageRepository: `delete()` hits only `images` table (CASCADE handles join tables)

**`integration/app.test.ts`**  
Full HTTP cycle against a real Express app with the `core/database/db` module mocked:
- Auth: register (201, 409), login (200, 401), wrong password
- Plants: GET without auth (200), POST without auth (401), guest POST (403), valid POST (201), validation failure (400)
- Watering: fertilizer types, create record
- Substrates: public listing
- Components: admin guard (403 for user, 201 for admin)
- Auth session lifecycle: refresh cookie scoped to `/auth` (login and guest
  login), logout invalidates the session server-side (the same refresh token
  answers 403 afterwards), logout clears current + legacy cookie paths,
  refresh without a cookie answers 401
- Errors: 404 for unknown routes, JSON error shape, `X-Request-Id` header present

## Coverage Thresholds

Configured in `vitest.config.ts`:

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

```typescript
// Repositories call the query/execute/transaction helpers from core/database/db;
// mock that module before importing the repository (see repositories.test.ts).
const mockQuery   = vi.fn().mockReturnValue([]);
const mockExecute = vi.fn().mockReturnValue({ affectedRows: 1, insertId: 1 });

vi.mock('../../../src/core/database/db', () => ({
  query:   (...args: unknown[]) => mockQuery(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
  transaction: vi.fn((fn: Function) => fn({ query: mockQuery, execute: mockExecute })),
  getDb: vi.fn(),
  closeDb: vi.fn(),
}));

it('create returns insertId', async () => {
  mockExecute.mockReturnValue({ affectedRows: 1, insertId: 42 });
  const id = await new SQLiteMyRepository().create({ name: 'test' });
  expect(id).toBe(42);
});

it('findById returns null when no rows', async () => {
  mockQuery.mockReturnValue([]);
  expect(await new SQLiteMyRepository().findById(999)).toBeNull();
});
```

### 3. Integration Test for a New Route

Add to `tests/integration/app.test.ts` (or create a new file and register the router in `buildTestApp`):

```typescript
describe('GET /api/v2/my-module', () => {
  it('returns 200 with data', async () => {
    mockQuery.mockReturnValue([{ id: 1, name: 'test' }]);

    const app = buildTestApp();
    const res = await request(app)
      .get('/api/v2/my-module')
      .set('Authorization', makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    sessionStore.deleteAll(USER_ID);
  });
});
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
