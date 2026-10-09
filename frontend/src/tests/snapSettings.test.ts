import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInstalledPinia, resetStore } from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);

import { useSnapSettingsStore } from "@/stores/snapSettings";

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
});
