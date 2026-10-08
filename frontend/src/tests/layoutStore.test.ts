import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInstalledPinia, resetStore } from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);

import { useLayoutStore } from "@/stores/layout";

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
});
