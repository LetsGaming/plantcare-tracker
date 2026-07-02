/**
 * src/tests/baseService.test.ts
 *
 * Tests for the BaseService list/dictionary cache helpers and the
 * optimistic mutation wrappers: immediate paint, reconcile with server
 * truth (temp negative id → real id), and item-scoped rollback that
 * leaves concurrent changes to sibling items untouched.
 *
 * StorageService is mocked with an in-memory map; no network, no Ionic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

const { store, toastError } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  toastError: vi.fn(),
}));

vi.mock("@/services/general/StorageService", () => ({
  default: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    remove: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  },
}));

vi.mock("@/services/general/ToastService", () => ({
  default: { showError: toastError, showSuccess: vi.fn(), showWarning: vi.fn() },
}));

vi.mock("@/services/general/LocalizationService", () => ({
  default: { t: (key: string) => key },
}));

import { BaseService } from "@/services/base/BaseService";

// ── Test access to the protected API ─────────────────────────────────────────

type Item = { id: number; name: string };

class TestService extends BaseService {
  static upsertList(key: string, event: string, item: Item) {
    return this.upsertIntoListCache(key, event, item);
  }
  static removeList(key: string, event: string, id: number) {
    return this.removeFromListCache(key, event, id);
  }
  static replaceList(key: string, event: string, prevId: number, item: Item) {
    return this.replaceInListCache(key, event, prevId, item);
  }
  static optUpsert<R>(options: {
    cacheKey: string;
    eventKey: string;
    optimisticItem: Item;
    request: () => Promise<R>;
    reconcile: (response: R) => Item;
  }) {
    return this.optimisticListUpsert<Item, R>(options);
  }
  static optRemove<R>(options: {
    cacheKey: string;
    eventKey: string;
    itemId: number;
    request: () => Promise<R>;
  }) {
    return this.optimisticListRemove<Item, R>(options);
  }
  static optDictUpsert<R>(options: {
    cacheKey: string;
    entryKey: string;
    eventKey: string;
    optimisticItem: Item;
    request: () => Promise<R>;
    reconcile: (response: R) => Item;
  }) {
    return this.optimisticDictionaryListUpsert<Item, R>(options);
  }
  static optDictRemove<R>(options: {
    cacheKey: string;
    entryKey: string;
    eventKey: string;
    itemId: number;
    request: () => Promise<R>;
  }) {
    return this.optimisticDictionaryListRemove<Item, R>(options);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

let keyCounter = 0;
/** Unique key per test so the static L1 cache cannot bleed between cases. */
const nextKey = () => `test_cache_${++keyCounter}`;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const readStored = (key: string): Item[] =>
  (store.get(key) as { data: Item[] } | undefined)?.data ?? [];

const readStoredDict = (key: string): Record<string, Item[]> =>
  (store.get(key) as { data: Record<string, Item[]> } | undefined)?.data ?? {};

const listenFor = (eventName: string) => {
  const events: unknown[] = [];
  const handler = (e: Event) => events.push((e as CustomEvent).detail);
  document.addEventListener(eventName, handler);
  return {
    events,
    stop: () => document.removeEventListener(eventName, handler),
  };
};

beforeEach(() => {
  store.clear();
  toastError.mockClear();
});

// ── Plain list-cache helpers ─────────────────────────────────────────────────

describe("list cache helpers", () => {
  it("upsertIntoListCache appends new and replaces existing by id", async () => {
    const key = nextKey();
    await TestService.upsertList(key, "evt", { id: 1, name: "a" });
    await TestService.upsertList(key, "evt", { id: 2, name: "b" });
    await TestService.upsertList(key, "evt", { id: 1, name: "a2" });

    expect(readStored(key)).toEqual([
      { id: 1, name: "a2" },
      { id: 2, name: "b" },
    ]);
  });

  it("removeFromListCache removes by id and is a silent no-op when absent", async () => {
    const key = nextKey();
    const listener = listenFor("evt-remove");
    await TestService.upsertList(key, "evt-remove", { id: 1, name: "a" });

    await TestService.removeList(key, "evt-remove", 1);
    expect(readStored(key)).toEqual([]);

    const eventsAfterRemove = listener.events.length;
    await TestService.removeList(key, "evt-remove", 999);
    // absent id → no write, no event
    expect(listener.events.length).toBe(eventsAfterRemove);
    listener.stop();
  });

  it("replaceInListCache swaps in place preserving order, falls back to push", async () => {
    const key = nextKey();
    await TestService.upsertList(key, "evt", { id: 1, name: "a" });
    await TestService.upsertList(key, "evt", { id: -42, name: "temp" });
    await TestService.upsertList(key, "evt", { id: 3, name: "c" });

    // temp id → server id, position preserved
    await TestService.replaceList(key, "evt", -42, { id: 7, name: "real" });
    expect(readStored(key).map((x) => x.id)).toEqual([1, 7, 3]);

    // unknown previousId → upsert behaviour
    await TestService.replaceList(key, "evt", -999, { id: 9, name: "new" });
    expect(readStored(key).map((x) => x.id)).toEqual([1, 7, 3, 9]);
  });
});

// ── Optimistic list upsert ───────────────────────────────────────────────────

describe("optimisticListUpsert", () => {
  it("paints immediately, then reconciles the temp id with the server item", async () => {
    const key = nextKey();
    const listener = listenFor("plants-updated");
    const server = deferred<{ plant_id: number; plant_name: string }>();

    const pending = TestService.optUpsert({
      cacheKey: key,
      eventKey: "plants-updated",
      optimisticItem: { id: -100, name: "Monstera" },
      request: () => server.promise,
      reconcile: (res) => ({ id: res.plant_id, name: res.plant_name }),
    });

    // paint happened before the request settled
    await vi.waitFor(() =>
      expect(readStored(key)).toEqual([{ id: -100, name: "Monstera" }]),
    );
    expect(listener.events.length).toBe(1);

    server.resolve({ plant_id: 7, plant_name: "Monstera" });
    const response = await pending;

    expect(response.plant_id).toBe(7);
    // temp id swapped in place for the server id
    expect(readStored(key)).toEqual([{ id: 7, name: "Monstera" }]);
    expect(listener.events.length).toBe(2); // paint + reconcile
    listener.stop();
  });

  it("rolls back only the affected item — concurrent sibling changes survive", async () => {
    const key = nextKey();
    await TestService.upsertList(key, "evt", { id: 1, name: "keep-me" });

    const server = deferred<never>();
    const pending = TestService.optUpsert({
      cacheKey: key,
      eventKey: "evt",
      optimisticItem: { id: -100, name: "doomed" },
      request: () => server.promise,
      reconcile: () => ({ id: 0, name: "" }),
    });

    await vi.waitFor(() => expect(readStored(key)).toHaveLength(2));

    // Another mutation lands on a sibling while the request is in flight.
    await TestService.upsertList(key, "evt", { id: 1, name: "changed-meanwhile" });

    server.reject(new Error("500"));
    await expect(pending).rejects.toThrow("500");

    // Temp item gone; the concurrent sibling change is NOT clobbered.
    expect(readStored(key)).toEqual([{ id: 1, name: "changed-meanwhile" }]);
  });

  it("restores the previous item state when an edit fails", async () => {
    const key = nextKey();
    await TestService.upsertList(key, "evt", { id: 5, name: "original" });

    const server = deferred<never>();
    const pending = TestService.optUpsert({
      cacheKey: key,
      eventKey: "evt",
      optimisticItem: { id: 5, name: "optimistic-edit" },
      request: () => server.promise,
      reconcile: () => ({ id: 5, name: "" }),
    });

    await vi.waitFor(() =>
      expect(readStored(key)).toEqual([{ id: 5, name: "optimistic-edit" }]),
    );

    server.reject(new Error("boom"));
    await expect(pending).rejects.toThrow("boom");

    expect(readStored(key)).toEqual([{ id: 5, name: "original" }]);
  });
});

// ── Optimistic list remove ───────────────────────────────────────────────────

describe("optimisticListRemove", () => {
  it("removes immediately and stays removed on success", async () => {
    const key = nextKey();
    await TestService.upsertList(key, "evt", { id: 1, name: "a" });
    await TestService.upsertList(key, "evt", { id: 2, name: "b" });

    const server = deferred<void>();
    const pending = TestService.optRemove({
      cacheKey: key,
      eventKey: "evt",
      itemId: 1,
      request: () => server.promise,
    });

    await vi.waitFor(() =>
      expect(readStored(key)).toEqual([{ id: 2, name: "b" }]),
    );

    server.resolve();
    await pending;
    expect(readStored(key)).toEqual([{ id: 2, name: "b" }]);
  });

  it("re-inserts at the original index when the request fails", async () => {
    const key = nextKey();
    await TestService.upsertList(key, "evt", { id: 1, name: "a" });
    await TestService.upsertList(key, "evt", { id: 2, name: "b" });
    await TestService.upsertList(key, "evt", { id: 3, name: "c" });

    const server = deferred<never>();
    const pending = TestService.optRemove({
      cacheKey: key,
      eventKey: "evt",
      itemId: 2,
      request: () => server.promise,
    });

    await vi.waitFor(() => expect(readStored(key)).toHaveLength(2));

    server.reject(new Error("nope"));
    await expect(pending).rejects.toThrow("nope");

    expect(readStored(key).map((x) => x.id)).toEqual([1, 2, 3]);
  });
});

// ── Optimistic dictionary variants ───────────────────────────────────────────

describe("optimistic dictionary-list wrappers", () => {
  it("touches only the addressed entry; siblings and other entries survive rollback", async () => {
    const key = nextKey();
    // Pre-seed two plant entries in the watering-style dictionary.
    store.set(key, {
      data: {
        "1": [{ id: 10, name: "r10" }],
        "2": [{ id: 20, name: "r20" }],
      },
      timestamp: Date.now(),
    });

    const server = deferred<never>();
    const pending = TestService.optDictUpsert({
      cacheKey: key,
      entryKey: "1",
      eventKey: "watering-records-changed",
      optimisticItem: { id: -5, name: "temp" },
      request: () => server.promise,
      reconcile: () => ({ id: 0, name: "" }),
    });

    await vi.waitFor(() =>
      expect(readStoredDict(key)["1"]).toHaveLength(2),
    );
    // sibling entry untouched by the paint
    expect(readStoredDict(key)["2"]).toEqual([{ id: 20, name: "r20" }]);

    server.reject(new Error("fail"));
    await expect(pending).rejects.toThrow("fail");

    expect(readStoredDict(key)).toEqual({
      "1": [{ id: 10, name: "r10" }],
      "2": [{ id: 20, name: "r20" }],
    });
  });

  it("reconciles a temp id inside the addressed entry", async () => {
    const key = nextKey();
    const server = deferred<{ record_id: number }>();

    const pending = TestService.optDictUpsert({
      cacheKey: key,
      entryKey: "7",
      eventKey: "watering-records-changed",
      optimisticItem: { id: -1, name: "painted" },
      request: () => server.promise,
      reconcile: (res) => ({ id: res.record_id, name: "painted" }),
    });

    await vi.waitFor(() =>
      expect(readStoredDict(key)["7"]).toEqual([{ id: -1, name: "painted" }]),
    );

    server.resolve({ record_id: 15 });
    await pending;

    expect(readStoredDict(key)["7"]).toEqual([{ id: 15, name: "painted" }]);
  });

  it("optimisticDictionaryListRemove removes and restores within one entry", async () => {
    const key = nextKey();
    store.set(key, {
      data: { "3": [{ id: 30, name: "x" }, { id: 31, name: "y" }] },
      timestamp: Date.now(),
    });

    const server = deferred<never>();
    const pending = TestService.optDictRemove({
      cacheKey: key,
      entryKey: "3",
      eventKey: "evt",
      itemId: 30,
      request: () => server.promise,
    });

    await vi.waitFor(() =>
      expect(readStoredDict(key)["3"]).toEqual([{ id: 31, name: "y" }]),
    );

    server.reject(new Error("offline"));
    await expect(pending).rejects.toThrow("offline");

    expect(readStoredDict(key)["3"].map((x) => x.id)).toEqual([30, 31]);
  });
});
