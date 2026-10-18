import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInstalledPinia, memoryStore, resetStore } from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);

import { useLayoutStore } from "@/stores/layout";
// Loaded while collecting so the first test does not pay for importing @ionic/vue.
import "@/stores/pinia";

beforeEach(() => {
  resetStore();
});

describe("layout store", () => {
  it("starts expanded and toggles the menu", async () => {
    await createInstalledPinia();
    const store = useLayoutStore();
    await store.ensureLoaded();
    expect(store.menuCollapsed).toBe(false);
    store.toggleMenu();
    expect(store.menuCollapsed).toBe(true);
  });

  it("writes only after the menu is toggled", async () => {
    vi.useFakeTimers();
    try {
      await createInstalledPinia();
      const store = useLayoutStore();
      await store.ensureLoaded();
      await vi.advanceTimersByTimeAsync(500);
      expect(memoryStore.size).toBe(0);

      store.toggleMenu();
      await vi.advanceTimersByTimeAsync(500);
      expect(memoryStore.get("menu_collapsed")).toMatchObject({ data: true, keepOnClear: true });
    } finally {
      vi.useRealTimers();
    }
  });
});
