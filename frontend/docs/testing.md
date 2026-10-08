# Testing

## Stack

| Tool | Purpose |
|------|---------|
| [Vitest](https://vitest.dev) | Unit test runner (matches backend) |
| [@vue/test-utils](https://test-utils.vuejs.org) | Vue component mounting |
| [@pinia/testing](https://pinia.vuejs.org/cookbook/testing.html) | `createTestingPinia` for component tests |
| [jsdom](https://github.com/jsdom/jsdom) | DOM environment |

## Running Tests

```bash
pnpm test              # watch mode
pnpm exec vitest run   # run once
pnpm exec vitest run --coverage
```

CI runs lint, format check, `vue-tsc --noEmit`, `vitest run --coverage` and the build. The coverage
gate lives in `vite.config.ts`; raise it when coverage rises.

## Test structure

```
src/tests/
├── helpers.ts                    In-memory storage, toast and localization mocks, JWT builder, createInstalledPinia()
├── sessionStore.test.ts          Login, logout, single-flight refresh, identity getters
├── plantsStore.test.ts           Reads, staleness, optimistic add/edit/delete, image refresh, persistence
├── wateringStore.test.ts         Records per plant, 404 as empty, optimistic mutations, persistence
├── substratesStore.test.ts       List, owner/public views, pessimistic mutations
├── componentsStore.test.ts       Catalogue, fineness levels, admin mutations
├── salesStore.test.ts            SSE accumulation, new flags, price history, persistence
├── moreInfoStore.test.ts         SSE draft/commit, language keys, persistence
├── calendarAndAdminStores.test.ts Settings store and live source health
├── persistence.test.ts           The L2 plugin on its own
├── optimistic.test.ts            The optimistic helper
├── markdown.test.ts              Guide renderer, escaping
├── apiUtils.test.ts, apiRequest.test.ts   ApiError, response handling, auth bridge, SSE ticket handshake
├── apiErrorMessage.test.ts       Form-ready text for 400/409 answers
├── routerGuard.test.ts           Route table, guard decisions, dev-only debug route
├── viewReactivity.test.ts        Views and components rendering from stores
├── formComponents.test.ts        Form field components, inline validation, server field errors
├── formHelpers.test.ts, formModals.test.ts   Form state helpers, modal reset on open, discard guard, substrate parts
├── requestFeedback.test.ts, toastService.test.ts   Resolved failure messages, retry action, toast dedupe
├── localDateAndStats.test.ts, wateringStatus.test.ts   Local day keys, watering rhythm, Water now with Undo
├── loadPhase.test.ts             Failed load to error or not-found
├── offline.test.ts               Connectivity state, offline banner, runtime cache clearing
├── mapping.test.ts, sourceHealth.test.ts, utils.test.ts
└── conventions.test.ts           No <script setup>; views stay off the transport layer
```

## Patterns

**Store tests** mock `ApiUtils` (and any service the store calls) and use an in-memory map for storage:

```typescript
vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);
vi.mock("@/utils/apiUtils", () => ({ default: { get: vi.fn(), post: vi.fn() /* ... */ } }));

const store = (await createInstalledPinia(), usePlantsStore());
await store.ensureLoaded();
```

`createInstalledPinia()` installs the app's plugins (persistence) on a throwaway app; plain
`createPinia()` would skip them. Persistence is debounced, so tests that read storage use fake
timers and advance them by about 500 ms.

**Optimistic behavior** is asserted in the middle of a request with a deferred promise: the painted
state is checked before the request settles, then again after it resolves or rejects.

**Component tests** use `shallowMount` with `createTestingPinia({ createSpy: vi.fn })`: actions are
stubbed, state and getters are real, so a test sets store state and checks what the component derives.

**Mapper tests** are pure: build an API fixture with a factory, assert the mapped shape, null
handling and optional fields.
