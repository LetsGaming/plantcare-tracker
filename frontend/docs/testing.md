# Testing

## Stack

| Tool | Purpose |
|------|---------|
| [Vitest](https://vitest.dev) | Unit test runner (matches backend) |
| [@vue/test-utils](https://test-utils.vuejs.org) | Vue component mounting |
| [jsdom](https://github.com/jsdom/jsdom) | DOM environment for service tests |

## Running Tests

```bash
# Run all tests once
pnpm test

# Watch mode during development
pnpm test --watch

# Coverage report
pnpm test --coverage
```

## Test Structure

```
src/tests/
├── mapping.test.ts        Unit tests for all mapper classes
├── apiUtils.test.ts       Unit tests for ApiError and handleResponse
├── utils.test.ts          Unit tests for Utils helper functions
├── baseService.test.ts    Cache helpers + optimistic wrappers (paint / reconcile / rollback)
└── viewReactivity.test.ts Event-driven views via @vue/test-utils
```

## What is Tested

### Mappers (`mapping.test.ts`)

Mappers are pure functions — zero dependencies, fully deterministic. Every
mapper is covered for:

- **Happy path**: all fields correctly mapped
- **Null safety**: `null` API values → `undefined` frontend values
- **Optional fields**: absent optional fields handled gracefully
- **Derived values**: `description` from `fineness`, name truncation in SaleMapper
- **Array / single-item**: `convertToXxx` handles both shapes
- **V2-specific**: `SubstrateRef` from plant response, `plant_name` in watering records

### ApiUtils (`apiUtils.test.ts`)

- `ApiError` constructor: message extraction from V2 envelope
- `ApiError.errorType` populated from `error.type`
- `ApiError.fields` populated from `error.fields` (ValidationError)
- `handleResponse`: success path returns `data`
- `handleResponse`: error path throws `ApiError` with correct status
- `isApiError` type guard

### BaseService (`baseService.test.ts`)

StorageService is mocked with an in-memory map; unique cache keys per case
keep the static L1 cache from bleeding between tests.

- `upsertInto/removeFrom/replaceInListCache`: order preservation, temp-id swap, silent no-op
- `optimisticListUpsert`: immediate paint (asserted before the request settles via a deferred promise), reconcile swaps the temporary negative id in place, edit failure restores the snapshot
- **Item-scoped rollback**: a concurrent change to a sibling item while the request is in flight survives the rollback
- `optimisticListRemove`: instant removal, re-insert at the original index on failure
- Dictionary variants: only the addressed entry is touched; sibling entries survive paint and rollback
- `clearMemoryCache`: proves the logout leak scenario — after wiping L2 the static L1 still serves the previous account's data until the memory cache is cleared as well

### View reactivity (`viewReactivity.test.ts`)

Components are `shallowMount`ed with all services mocked (no network, no
Ionic storage):

- A cache `CustomEvent` triggers exactly one re-derivation through the
  service getter; mutation methods are never called by the handler
- The listener is removed on unmount — later events are ignored
- Optimistic UX: the watering add-modal closes before the request settles
- `addPlant` resolves with the reconciled server plant; the dependent image
  upload receives the real id (never a raw snake_case field)

### Utils (`utils.test.ts`)

- `convertDateString`: ISO → localized string, non-ISO passthrough
- `convertToMillis`: chronological ordering
- `isCacheExpired`: fresh vs. stale timestamps
- `capitalizeFirstLetter`: edge cases
- `baseSearchFilter`: multi-field, case-insensitive, whitespace trimming
- `debounce`: coalescing, timer reset

## Writing New Tests

Follow this pattern for mapper tests:

```typescript
// 1. Define a factory function for the API fixture
const makeAPIPlant = (overrides: Partial<APIPlant> = {}): APIPlant => ({
  plant_id: 1,
  plant_name: "Monstera",
  // ... required fields ...
  ...overrides,
});

// 2. Test the happy path
it("maps scalar fields", () => {
  const result = PlantMapper.mapPlant(makeAPIPlant());
  expect(result.id).toBe(1);
  expect(result.name).toBe("Monstera");
});

// 3. Test null/optional field handling
it("converts null image_url to undefined", () => {
  const result = PlantMapper.mapPlant(makeAPIPlant({ image_url: null }));
  expect(result.imageUrl).toBeUndefined();
});
```

For service tests, mock `ApiUtils` and `storageService`:

```typescript
import { vi } from "vitest";
import ApiUtils from "@/utils/apiUtils";

vi.mock("@/utils/apiUtils", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

it("calls correct endpoint", async () => {
  vi.mocked(ApiUtils.get).mockResolvedValue([makeAPIPlant()]);
  await PlantService.getAllPlants(true);
  expect(ApiUtils.get).toHaveBeenCalledWith("/plants");
});
```
