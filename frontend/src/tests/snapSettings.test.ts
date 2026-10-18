import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInstalledPinia, memoryStore, resetStore } from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);

import { useSnapSettingsStore } from "@/stores/snapSettings";
// Loaded while collecting so the first test does not pay for importing @ionic/vue.
import "@/stores/pinia";

beforeEach(() => {
  resetStore();
  vi.useFakeTimers();
});

afterEach(() => vi.useRealTimers());

describe("snap settings store", () => {
  it("keeps photos by default and remembers the choice", async () => {
    await createInstalledPinia();
    const store = useSnapSettingsStore();
    await store.ensureLoaded();
    expect(store.keepPhoto).toBe(true);
    store.setKeepPhoto(false);
    expect(store.keepPhoto).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);

    await createInstalledPinia();
    const reloaded = useSnapSettingsStore();
    await reloaded.ensureLoaded();
    expect(reloaded.keepPhoto).toBe(false);
  });

  it("writes nothing until the choice changes", async () => {
    await createInstalledPinia();
    const store = useSnapSettingsStore();
    await store.ensureLoaded();
    store.setKeepPhoto(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.size).toBe(0);

    store.setKeepPhoto(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.get("snap_keep_photo")).toMatchObject({ data: false });
  });
});
