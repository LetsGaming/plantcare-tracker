/**
 * Tests for the L2 persistence plugin on its own, with throwaway stores.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isProxy, reactive } from "vue";
import { defineStore } from "pinia";
import storageService from "@/services/general/StorageService";
import { createInstalledPinia, memoryStore, resetStore } from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);

// Loaded while collecting so the first test does not pay for importing @ionic/vue.
import "@/stores/pinia";

const useDemoStore = defineStore("demo", {
  state: () => ({ items: [] as unknown[], status: "idle", fetchedAt: null as number | null }),
  persist: {
    entries: [
      {
        key: "demo_items",
        pick: (state) => state.items,
        timestamp: (state) => state.fetchedAt,
        apply: (state, data: unknown[], timestamp) => {
          state.items = data;
          state.fetchedAt = timestamp;
        },
      },
    ],
  },
  actions: {
    setItems(items: unknown[], fetchedAt: number) {
      this.items = items;
      this.fetchedAt = fetchedAt;
    },
    pushItem(item: unknown) {
      this.items.push(item);
    },
    setStatus(status: string) {
      this.status = status;
    },
  },
});

let itemPicks = 0;
let labelPicks = 0;

/** Two entries: a list with a change token and a setting without a timestamp. */
const useScopedStore = defineStore("demoScoped", {
  state: () => ({ items: [] as number[], label: "a", status: "idle", fetchedAt: 1 }),
  persist: {
    entries: [
      {
        key: "scoped_items",
        dirtyOn: ["setItems", "setStatus"],
        version: (state) => state.items,
        timestamp: (state) => state.fetchedAt,
        pick: (state) => {
          itemPicks++;
          return state.items;
        },
        apply: (state, data: number[]) => {
          state.items = data;
        },
      },
      {
        key: "scoped_label",
        dirtyOn: ["setLabel"],
        version: (state) => state.label,
        pick: (state) => {
          labelPicks++;
          return state.label;
        },
        apply: (state, data: string) => {
          state.label = data;
        },
      },
    ],
  },
  actions: {
    setItems(items: number[]) {
      this.items = items;
      // Not in the label entry's `dirtyOn`, so this never reaches storage.
      this.label = `${this.label}!`;
    },
    setStatus(status: string) {
      this.status = status;
    },
    setLabel(label: string) {
      this.label = label;
    },
  },
});

let getterReads = 0;

const countedItem = (value: number): object => {
  const item = {};
  Object.defineProperty(item, "value", {
    enumerable: true,
    get: () => {
      getterReads++;
      return value;
    },
  });
  return item;
};

const useTraversalStore = defineStore("demoTraversal", {
  state: () => ({ items: [] as object[], status: "idle", fetchedAt: null as number | null }),
  persist: {
    entries: [
      {
        key: "traversal_items",
        pick: (state) => state.items,
        timestamp: (state) => state.fetchedAt,
        apply: (state, data: object[]) => {
          state.items = data;
        },
      },
    ],
  },
  actions: {
    setItems(items: object[]) {
      this.items = items;
      this.fetchedAt = 1;
    },
    setStatus(status: string) {
      this.status = status;
    },
  },
});

const writesOf = (key: string): number =>
  vi.mocked(storageService.set).mock.calls.filter(([written]) => written === key).length;

const readsOf = (key: string): number =>
  vi.mocked(storageService.get).mock.calls.filter(([read]) => read === key).length;

beforeEach(() => {
  resetStore();
  vi.mocked(storageService.get).mockClear();
  vi.mocked(storageService.set).mockClear();
  itemPicks = 0;
  labelPicks = 0;
  getterReads = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("l2Persistence", () => {
  it("does not store a store that is only loading, so a good snapshot is never overwritten", async () => {
    vi.useFakeTimers();
    memoryStore.set("demo_items", { data: [1, 2], timestamp: Date.now() - 1000 });
    await createInstalledPinia();
    const store = useDemoStore();
    store.setStatus("loading");
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.get("demo_items")).toMatchObject({ data: [1, 2] });
  });

  it("stores once the data has a fetch time, in the cache envelope", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useDemoStore();
    store.setItems([7], 1234);
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.get("demo_items")).toEqual({
      data: [7],
      keepOnClear: false,
      timestamp: 1234,
    });
  });

  it("debounces bursts of changes into one write", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useDemoStore();
    store.setItems([], 1);
    for (let i = 1; i <= 5; i++) store.pushItem(i);
    await vi.advanceTimersByTimeAsync(100);
    expect(memoryStore.has("demo_items")).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect((memoryStore.get("demo_items") as { data: number[] }).data).toEqual([1, 2, 3, 4, 5]);
    expect(writesOf("demo_items")).toBe(1);
  });

  it("hydrates a fresh snapshot without writing it back", async () => {
    vi.useFakeTimers();
    memoryStore.set("demo_items", { data: [4], timestamp: Date.now() });
    const original = memoryStore.get("demo_items");
    await createInstalledPinia();
    const store = useDemoStore();
    expect(await store.$hydrate()).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(store.items).toEqual([4]);
    expect(memoryStore.get("demo_items")).toBe(original);
  });

  it("skips an expired snapshot", async () => {
    memoryStore.set("demo_items", { data: [4], timestamp: Date.now() - 1000 * 60 * 60 * 24 * 30 });
    await createInstalledPinia();
    const store = useDemoStore();
    expect(await store.$hydrate()).toBe(false);
    expect(store.items).toEqual([]);
  });

  it("never traverses the state on a change and reads each item once per flush", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useTraversalStore();
    store.setItems(Array.from({ length: 1000 }, (_, i) => countedItem(i)));
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.has("traversal_items")).toBe(true);
    getterReads = 0;

    for (let i = 0; i < 100; i++) store.setStatus(`status ${i}`);
    expect(getterReads).toBe(0);

    await vi.advanceTimersByTimeAsync(500);
    expect(getterReads).toBeLessThanOrEqual(1000);
  });

  it("only flushes the entries whose dirtyOn names the finished action", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useScopedStore();
    await store.$hydrate();
    labelPicks = 0;

    store.setItems([1]);
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.get("scoped_items")).toMatchObject({ data: [1] });
    expect(memoryStore.has("scoped_label")).toBe(false);
    expect(labelPicks).toBe(0);

    store.setLabel("b");
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.get("scoped_label")).toMatchObject({ data: "b" });
  });

  it("skips an entry whose version token did not change without reading it", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useScopedStore();
    store.setItems([1]);
    await vi.advanceTimersByTimeAsync(500);
    expect(writesOf("scoped_items")).toBe(1);
    itemPicks = 0;

    store.setStatus("ready");
    await vi.advanceTimersByTimeAsync(500);
    expect(writesOf("scoped_items")).toBe(1);
    expect(itemPicks).toBe(0);

    store.setItems([1, 2]);
    await vi.advanceTimersByTimeAsync(500);
    expect(writesOf("scoped_items")).toBe(2);
  });

  it("persists a $patch made outside an action", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useDemoStore();
    store.$patch({ items: [5], fetchedAt: 10 });
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.get("demo_items")).toMatchObject({ data: [5], timestamp: 10 });
  });

  it("ignores a direct assignment outside an action until $persist() marks it", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useDemoStore();
    store.items = [6];
    store.fetchedAt = 11;
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.has("demo_items")).toBe(false);

    store.$persist();
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.get("demo_items")).toMatchObject({ data: [6], timestamp: 11 });
  });

  it("reads each key once for concurrent $hydrate calls", async () => {
    memoryStore.set("demo_items", { data: [4], timestamp: Date.now() });
    await createInstalledPinia();
    const store = useDemoStore();
    const results = await Promise.all([store.$hydrate(), store.$hydrate(), store.$hydrate()]);
    expect(results).toEqual([true, true, true]);
    expect(readsOf("demo_items")).toBe(1);
  });

  it("reads only the requested keys", async () => {
    memoryStore.set("scoped_label", { data: "z", timestamp: Date.now() });
    memoryStore.set("scoped_items", { data: [9], timestamp: Date.now() });
    await createInstalledPinia();
    const store = useScopedStore();
    expect(await store.$hydrate(["scoped_label"])).toBe(true);
    expect(readsOf("scoped_label")).toBe(1);
    expect(readsOf("scoped_items")).toBe(0);
    expect(store.label).toBe("z");
    expect(store.items).toEqual([]);
  });

  it("holds back an entry without a timestamp until hydration was attempted", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useScopedStore();
    store.setLabel("b");
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.has("scoped_label")).toBe(false);

    await store.$hydrate();
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.get("scoped_label")).toMatchObject({ data: "b" });
  });

  it("lets a stored setting win over a change made before hydration", async () => {
    vi.useFakeTimers();
    memoryStore.set("scoped_label", { data: "z", keepOnClear: false, timestamp: 1 });
    await createInstalledPinia();
    const store = useScopedStore();
    store.setLabel("b");
    await store.$hydrate();
    await vi.advanceTimersByTimeAsync(500);
    expect(store.label).toBe("z");
    expect(writesOf("scoped_label")).toBe(0);
  });

  it("drops a pending write when the store is reset", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useDemoStore();
    store.setItems([9], 5);
    store.$reset();
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.has("demo_items")).toBe(false);
    expect(store.items).toEqual([]);
  });

  it("can cancel a pending write explicitly, including the marked changes", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useDemoStore();
    store.setItems([9], 5);
    store.$cancelPersist();
    await vi.advanceTimersByTimeAsync(500);
    store.$flushPersist();
    expect(memoryStore.has("demo_items")).toBe(false);
  });

  it("stores a plain cloneable value when the picked state holds reactive objects", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useDemoStore();
    store.setItems([reactive({ a: 1 }), { nested: reactive({ b: [1, reactive({ c: 2 })] }) }], 3);
    await vi.advanceTimersByTimeAsync(500);
    const stored = memoryStore.get("demo_items") as { data: unknown[] };
    expect(stored.data).toEqual([{ a: 1 }, { nested: { b: [1, { c: 2 }] } }]);
    expect(isProxy(stored.data[0])).toBe(false);
  });

  it("writes immediately when the page is hidden", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useDemoStore();
    store.setItems([3], 2);
    window.dispatchEvent(new Event("pagehide"));
    expect(memoryStore.get("demo_items")).toMatchObject({ data: [3], timestamp: 2 });
  });
});

describe("test isolation", () => {
  it("leaves a write pending on real timers when the test ends", async () => {
    await createInstalledPinia();
    const store = useDemoStore();
    store.setItems([1], 1);
    expect(memoryStore.has("demo_items")).toBe(false);
  });

  it("never sees the write left pending by the previous test", async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(memoryStore.has("demo_items")).toBe(false);
  });
});
