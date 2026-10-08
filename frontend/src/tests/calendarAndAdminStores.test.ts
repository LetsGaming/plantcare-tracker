/**
 * Tests for the calendar settings store (local, persistent, never expiring)
 * and the admin source health store (always live).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInstalledPinia, memoryStore, resetStore } from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);
vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  isApiError: () => false,
  configureAuth: vi.fn(),
}));
vi.mock("@/utils/apiUtils", () => ({ default: api }));

import { useCalendarStore } from "@/stores/calendar";
import { useAdminHealthStore } from "@/stores/adminHealth";

const category = (name: string): Category => ({
  name,
  textColor: "#fff",
  backgroundColor: "#000",
});

const day = (date: string): CalendarDates => ({ date, category: category("x") });

const isoDaysAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
};

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("calendar store", () => {
  it("starts with the default watering categories, Monday first and no reminders", async () => {
    await createInstalledPinia();
    const store = useCalendarStore();
    await store.ensureLoaded();
    expect(store.wateringCategories.map((c) => c.name)).toEqual([
      "watering.category.no_fertilizer",
      "watering.category.organic",
      "watering.category.mineral",
    ]);
    expect(store.firstDayOfWeek).toBe(1);
    expect(store.dates).toEqual([]);
    expect(store.deleteAfterThirty).toBe(false);
  });

  it("restores stored settings even long after they were saved", async () => {
    const old = Date.now() - 1000 * 60 * 60 * 24 * 400;
    memoryStore.set("first_day_of_week", { data: 0, timestamp: old, keepOnClear: true });
    memoryStore.set("delete_after_thirty", { data: true, timestamp: old, keepOnClear: true });
    memoryStore.set("date_categories", { data: [category("Repot")], timestamp: old });
    memoryStore.set("reminder_dates", { data: [day("2026-01-01")], timestamp: old });
    await createInstalledPinia();
    const store = useCalendarStore();
    await store.ensureLoaded();
    expect(store.firstDayOfWeek).toBe(0);
    expect(store.deleteAfterThirty).toBe(true);
    expect(store.categories.map((c) => c.name)).toEqual(["Repot"]);
    expect(store.dates).toHaveLength(1);
  });

  it("keeps the default watering categories when an empty list was stored", async () => {
    memoryStore.set("watering_categories", { data: [], timestamp: Date.now() });
    await createInstalledPinia();
    const store = useCalendarStore();
    await store.ensureLoaded();
    expect(store.wateringCategories).toHaveLength(3);
  });

  it("saves settings as persistent entries and only the ones that changed", async () => {
    vi.useFakeTimers();
    await createInstalledPinia();
    const store = useCalendarStore();
    await store.ensureLoaded();
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.size).toBe(0);

    store.saveFirstDayOfWeek(0);
    store.saveDates([day("2026-01-01")]);
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.get("first_day_of_week")).toMatchObject({ data: 0, keepOnClear: true });
    expect(memoryStore.get("reminder_dates")).toMatchObject({ keepOnClear: true });
    expect(memoryStore.has("date_categories")).toBe(false);
  });

  it("resets the watering categories to the defaults", async () => {
    await createInstalledPinia();
    const store = useCalendarStore();
    store.saveWateringCategories([category("custom")]);
    store.resetWateringCategories();
    expect(store.wateringCategories).toHaveLength(3);
    store.wateringCategories[0].name = "mutated";
    store.resetWateringCategories();
    expect(store.wateringCategories[0].name).toBe("watering.category.no_fertilizer");
  });

  it("drops reminders older than 30 days only when the setting is on", async () => {
    await createInstalledPinia();
    const store = useCalendarStore();
    store.saveDates([day(isoDaysAgo(40)), day(isoDaysAgo(2))]);
    store.deleteOldDates();
    expect(store.dates).toHaveLength(2);

    store.saveDeleteAfterThirty(true);
    store.deleteOldDates();
    expect(store.dates.map((d) => d.date)).toEqual([isoDaysAgo(2)]);
  });
});

describe("admin health store", () => {
  const row = (key: string, status: string, kind = "sales"): APISourceHealth =>
    ({
      source_key: key,
      kind,
      seller: key,
      status,
      active_strategy: null,
      last_item_count: null,
      consecutive_failures: 0,
      last_success_at: null,
      last_failure_at: null,
      last_error: null,
      updated_at: "2026-10-06T10:00:00.000Z",
    }) as APISourceHealth;

  it("loads live, orders failing sources first and counts them", async () => {
    api.get.mockResolvedValue([row("a", "ok"), row("b", "failing"), row("c", "failing")]);
    await createInstalledPinia();
    const store = useAdminHealthStore();
    await store.load();
    expect(api.get).toHaveBeenCalledWith("/sales/health");
    expect(store.sources[0].status).toBe("failing");
    expect(store.needingAttention).toBe(2);
    expect(store.loaded).toBe(true);
  });

  it("replaces one source with its re-checked health", async () => {
    api.get.mockResolvedValue([row("a", "failing"), row("b", "ok")]);
    await createInstalledPinia();
    const store = useAdminHealthStore();
    await store.load();
    api.post.mockResolvedValue(row("a", "ok"));
    const health = await store.recheck("a");
    expect(api.post).toHaveBeenCalledWith("/sales/health/a/check");
    expect(health.status).toBe("ok");
    expect(store.needingAttention).toBe(0);
    expect(store.sources).toHaveLength(2);
  });

  it("persists nothing", async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValue([row("a", "ok")]);
    await createInstalledPinia();
    const store = useAdminHealthStore();
    await store.load();
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.size).toBe(0);
  });
});
