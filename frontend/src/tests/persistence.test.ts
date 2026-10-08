/**
 * Tests for the L2 persistence plugin on its own, with a throwaway store.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineStore } from "pinia";
import { createInstalledPinia, memoryStore, resetStore } from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);

const useDemoStore = defineStore("demo", {
  state: () => ({ items: [] as number[], status: "idle", fetchedAt: null as number | null }),
  persist: {
    entries: [
      {
        key: "demo_items",
        pick: (state) => state.items,
        timestamp: (state) => state.fetchedAt,
        apply: (state, data: number[], timestamp) => {
          state.items = data;
          state.fetchedAt = timestamp;
        },
      },
    ],
  },
});

beforeEach(() => {
  resetStore();
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
    store.status = "loading";
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.get("demo_items")).toMatchObject({ data: [1, 2] });
  });

  it("stores once the data has a fetch time, in the cache envelope", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useDemoStore();
    store.items = [7];
    store.fetchedAt = 1234;
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.get("demo_items")).toEqual({
      data: [7],
      keepOnClear: false,
      timestamp: 1234,
    });
  });

  it("does not rewrite data that has not changed", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useDemoStore();
    store.items = [7];
    store.fetchedAt = 1234;
    await vi.advanceTimersByTimeAsync(500);
    memoryStore.delete("demo_items");
    store.status = "ready";
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.has("demo_items")).toBe(false);
  });

  it("debounces bursts of changes into one write", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useDemoStore();
    store.fetchedAt = 1;
    for (let i = 1; i <= 5; i++) store.items.push(i);
    await vi.advanceTimersByTimeAsync(100);
    expect(memoryStore.has("demo_items")).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect((memoryStore.get("demo_items") as { data: number[] }).data).toEqual([1, 2, 3, 4, 5]);
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

  it("drops a pending write when the store is reset", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useDemoStore();
    store.items = [9];
    store.fetchedAt = 5;
    store.$reset();
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.has("demo_items")).toBe(false);
    expect(store.items).toEqual([]);
  });

  it("can cancel a pending write explicitly", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useDemoStore();
    store.items = [9];
    store.fetchedAt = 5;
    store.$cancelPersist();
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.has("demo_items")).toBe(false);
  });
});
