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
├── mapping.test.ts      Unit tests for all mapper classes
├── apiUtils.test.ts     Unit tests for ApiError and handleResponse
└── utils.test.ts        Unit tests for Utils helper functions
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
