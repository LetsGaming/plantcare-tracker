/**
 * Tests for the watering store: a windowed history per opened plant (50 newest,
 * "show older" pages), an LRU of 20 that is never persisted, writes that apply
 * the returned records and summaries without refetching, and session epochs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  apiWateringItem,
  apiWateringSummary,
  createInstalledPinia,
  envelope,
  memoryStore,
  resetStore,
  toast,
} from "./helpers";

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
  patch: vi.fn(),
  delete: vi.fn(),
  configureAuth: vi.fn(),
  isApiError: (e: unknown) => (e as { isApi?: boolean })?.isApi === true,
}));
vi.mock("@/utils/apiUtils", () => ({ default: api }));

import { epoch } from "@/stores/resource";
import { usePlantsStore } from "@/stores/plants";
import { HISTORY_CACHE_SIZE, useWateringStore } from "@/stores/watering";

const DAY = 86_400_000;
const T0 = 1_750_000_000_000;

const item = (id: number, plantId = 7, overrides: Partial<APIWateringItem> = {}) =>
  apiWateringItem({ id, plant_id: plantId, date: T0 - id * DAY, ...overrides });

const notFound = () => Object.assign(new Error("not found"), { isApi: true, status: 404 });

const newStore = async () => {
  await createInstalledPinia();
  return useWateringStore();
};

const ids = (store: ReturnType<typeof useWateringStore>, plantId: number) =>
  store.recordsFor(plantId).map((r) => r.id);

const summary = (lastWateredAt: number) =>
  apiWateringSummary({ last_watered_at: lastWateredAt, avg_interval_days: 3 });

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reading the history", () => {
  it("loads the newest 50 records of a plant", async () => {
    api.get.mockResolvedValue(envelope([item(1), item(2)], "c1"));
    const store = await newStore();
    await store.ensureRecords(7);
    expect(api.get).toHaveBeenCalledWith("/watering/plant/7?limit=50");
    expect(store.recordsFor(7)).toEqual([
      expect.objectContaining({ id: 1, plantId: 7, date: T0 - DAY, fertilizerTypeId: null }),
      expect.objectContaining({ id: 2 }),
    ]);
    expect(store.hasOlder(7)).toBe(true);
  });

  it("loads each plant once and shares concurrent requests", async () => {
    api.get.mockResolvedValue(envelope([item(1)]));
    const store = await newStore();
    await Promise.all([store.ensureRecords(7), store.ensureRecords(7)]);
    await store.ensureRecords(7);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("refetches the first page when forced", async () => {
    api.get.mockResolvedValue(envelope([item(1)]));
    const store = await newStore();
    await store.ensureRecords(7);
    await store.ensureRecords(7, { force: true });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("show older appends the next pages in order until the history ends", async () => {
    api.get
      .mockResolvedValueOnce(envelope([item(1), item(2)], "c1"))
      .mockResolvedValueOnce(envelope([item(3), item(4)], "c2"))
      .mockResolvedValueOnce(envelope([item(5)], null));
    const store = await newStore();
    await store.ensureRecords(7);
    await store.loadOlder(7);
    expect(api.get).toHaveBeenLastCalledWith("/watering/plant/7?limit=50&before=c1");
    await store.loadOlder(7);
    expect(api.get).toHaveBeenLastCalledWith("/watering/plant/7?limit=50&before=c2");
    expect(ids(store, 7)).toEqual([1, 2, 3, 4, 5]);
    expect(store.hasOlder(7)).toBe(false);
    await store.loadOlder(7);
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it("shares a concurrent loadOlder", async () => {
    api.get
      .mockResolvedValueOnce(envelope([item(1)], "c1"))
      .mockResolvedValueOnce(envelope([item(2)]));
    const store = await newStore();
    await store.ensureRecords(7);
    await Promise.all([store.loadOlder(7), store.loadOlder(7)]);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(ids(store, 7)).toEqual([1, 2]);
  });

  it("treats a 404 as an empty history without a toast", async () => {
    api.get.mockRejectedValue(notFound());
    const store = await newStore();
    await store.ensureRecords(99);
    expect(store.recordsFor(99)).toEqual([]);
    expect(store.isLoaded(99)).toBe(true);
    expect(toast.showError).not.toHaveBeenCalled();
  });

  it("shows one toast and rethrows when the request fails", async () => {
    api.get.mockRejectedValue(new Error("offline"));
    const store = await newStore();
    await expect(store.ensureRecords(7)).rejects.toThrow("offline");
    expect(toast.showError).toHaveBeenCalledTimes(1);
    expect(store.isLoaded(7)).toBe(false);
  });

  it("keeps at most 20 plants and evicts the least recently used", async () => {
    api.get.mockImplementation(async (url: string) =>
      envelope([
        item(Number(url.split("/")[3].split("?")[0]) * 10, Number(url.split("/")[3].split("?")[0])),
      ]),
    );
    const store = await newStore();
    for (let plantId = 1; plantId <= HISTORY_CACHE_SIZE; plantId += 1) {
      await store.ensureRecords(plantId);
    }
    await store.ensureRecords(1);
    await store.ensureRecords(21);
    expect(Object.keys(store.byPlantId)).toHaveLength(20);
    expect(store.isLoaded(1)).toBe(true);
    expect(store.isLoaded(2)).toBe(false);
    expect(store.isLoaded(21)).toBe(true);
  });

  it("does not persist histories", async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValue(envelope([item(1)]));
    const store = await newStore();
    await store.ensureRecords(7);
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.has("watering_records_data")).toBe(false);
  });

  it("drops the results of a session that ended in flight", async () => {
    let release!: (value: unknown) => void;
    api.get.mockReturnValue(new Promise((res) => (release = res)));
    const store = await newStore();
    const loading = store.ensureRecords(7);
    epoch.abortAll();
    release(envelope([item(1)]));
    await loading;
    expect(store.isLoaded(7)).toBe(false);
  });

  it("swallows a failure of a session that ended in flight", async () => {
    let fail!: (error: Error) => void;
    api.get.mockReturnValue(new Promise((_, rej) => (fail = rej)));
    const store = await newStore();
    const loading = store.ensureRecords(7);
    epoch.abortAll();
    fail(new Error("aborted"));
    await expect(loading).resolves.toBeUndefined();
  });
});

describe("fertilizer types", () => {
  it("loads once", async () => {
    api.get.mockResolvedValue([{ fertilizer_id: 1, fertilizer_name: "organic" }]);
    const store = await newStore();
    await store.ensureFertilizerTypes();
    await store.ensureFertilizerTypes();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(store.fertilizerTypes).toEqual([{ id: 1, name: "organic" }]);
  });
});

describe("writes", () => {
  const loaded = async (items: APIWateringItem[], next: string | null = null) => {
    api.get.mockResolvedValue(envelope(items, next));
    const store = await newStore();
    await store.ensureRecords(7);
    api.get.mockClear();
    return store;
  };

  it("add sends one request with seconds and tz_offset, inserts in order and applies the summary", async () => {
    const store = await loaded([item(1), item(2)]);
    const applySummaries = vi.spyOn(usePlantsStore(), "applySummaries");
    const date = T0 + 5 * DAY;
    api.post.mockResolvedValue({
      record: apiWateringItem({ id: 9, plant_id: 7, date }),
      summary: summary(date),
    });

    const saved = await store.addRecord(7, { date, usedFertilizer: false });

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/watering/7", {
      date: Math.floor(date / 1000),
      usedFertilizer: false,
      fertilizerTypeId: undefined,
      tz_offset: -new Date().getTimezoneOffset(),
    });
    expect(saved.id).toBe(9);
    expect(ids(store, 7)).toEqual([9, 1, 2]);
    expect(api.get).not.toHaveBeenCalled();
    expect(applySummaries).toHaveBeenCalledTimes(1);
    const applied = applySummaries.mock.calls[0][0];
    expect(applied.get(7)).toEqual({
      lastWateredAt: date,
      lastFertilizedAt: null,
      avgIntervalDays: 3,
    });
  });

  it("add paints a temporary record and removes only it on failure", async () => {
    const store = await loaded([item(1)]);
    let release!: (value: unknown) => void;
    api.post.mockReturnValue(new Promise((res) => (release = res)));
    const pending = store.addRecord(7, { date: T0 + DAY, usedFertilizer: false });
    expect(store.recordsFor(7)).toHaveLength(2);
    expect(store.recordsFor(7)[0].id).toBeLessThan(0);
    release(Promise.reject(new Error("400")));
    await expect(pending).rejects.toThrow("400");
    expect(ids(store, 7)).toEqual([1]);
  });

  it("does not insert a record older than the window while older pages remain", async () => {
    const store = await loaded([item(1), item(2)], "c1");
    api.post.mockResolvedValue({
      record: apiWateringItem({ id: 50, plant_id: 7, date: T0 - 400 * DAY }),
      summary: summary(T0),
    });
    await store.addRecord(7, { date: T0 - 400 * DAY, usedFertilizer: false });
    expect(ids(store, 7)).toEqual([1, 2]);
  });

  describe("the oldest loaded record while older pages remain", () => {
    it("stays after a successful edit that keeps its date", async () => {
      const store = await loaded([item(1), item(2)], "c1");
      api.patch.mockResolvedValue({
        record: apiWateringItem({
          id: 2,
          plant_id: 7,
          date: T0 - 2 * DAY,
          used_fertilizer: true,
          fertilizer_type_id: 1,
        }),
        summary: summary(T0),
      });
      await store.editRecord(7, 2, {
        date: T0 - 2 * DAY,
        usedFertilizer: true,
        fertilizerTypeId: 1,
      });
      expect(ids(store, 7)).toEqual([1, 2]);
      expect(store.recordsFor(7)[1].usedFertilizer).toBe(true);
    });

    it("comes back when its edit fails", async () => {
      const store = await loaded([item(1), item(2)], "c1");
      api.patch.mockRejectedValue(new Error("500"));
      await expect(store.editRecord(7, 2, { usedFertilizer: true })).rejects.toThrow("500");
      expect(ids(store, 7)).toEqual([1, 2]);
      expect(store.recordsFor(7)[1].usedFertilizer).toBe(false);
    });

    it("comes back when its delete fails", async () => {
      const store = await loaded([item(1), item(2)], "c1");
      api.delete.mockRejectedValue(new Error("500"));
      await expect(store.deleteRecord(7, 2)).rejects.toThrow("500");
      expect(ids(store, 7)).toEqual([1, 2]);
    });

    it("leaves the window when an edit moves it beyond the loaded range, and returns on failure", async () => {
      const old = T0 - 400 * DAY;
      const store = await loaded([item(1), item(2)], "c1");
      api.patch.mockResolvedValueOnce({
        record: apiWateringItem({ id: 2, plant_id: 7, date: old }),
        summary: summary(T0),
      });
      await store.editRecord(7, 2, { date: old, usedFertilizer: false });
      expect(ids(store, 7)).toEqual([1]);

      const again = await loaded([item(1), item(2)], "c1");
      api.patch.mockRejectedValueOnce(new Error("500"));
      await expect(again.editRecord(7, 2, { date: old, usedFertilizer: false })).rejects.toThrow();
      expect(ids(again, 7)).toEqual([1, 2]);
      expect(again.recordsFor(7)[1].date).toBe(T0 - 2 * DAY);
    });
  });

  it("add for a plant whose window is not loaded loads nothing", async () => {
    const store = await newStore();
    api.post.mockResolvedValue({ record: item(9, 8), summary: summary(T0) });
    await store.addRecord(8, { usedFertilizer: false });
    expect(store.isLoaded(8)).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
  });

  it("edit patches once with seconds, moves the record and applies the summary", async () => {
    const store = await loaded([item(1), item(2), item(3)]);
    const applySummaries = vi.spyOn(usePlantsStore(), "applySummaries");
    const date = T0 + DAY;
    api.patch.mockResolvedValue({
      record: apiWateringItem({
        id: 3,
        plant_id: 7,
        date,
        used_fertilizer: true,
        fertilizer_type_id: 2,
      }),
      summary: summary(date),
    });
    await store.editRecord(7, 3, { date, usedFertilizer: true, fertilizerTypeId: 2 });
    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.patch).toHaveBeenCalledWith(
      "/watering/3",
      expect.objectContaining({ date: Math.floor(date / 1000), usedFertilizer: true }),
    );
    expect(ids(store, 7)).toEqual([3, 1, 2]);
    expect(store.recordsFor(7)[0].fertilizerTypeId).toBe(2);
    expect(api.get).not.toHaveBeenCalled();
    expect(applySummaries).toHaveBeenCalledTimes(1);
  });

  it("restores the previous record when an edit fails", async () => {
    const store = await loaded([item(1), item(2)]);
    api.patch.mockRejectedValue(new Error("500"));
    await expect(store.editRecord(7, 2, { date: T0 + DAY, usedFertilizer: true })).rejects.toThrow(
      "500",
    );
    expect(store.recordsFor(7).map((r) => [r.id, r.date, r.usedFertilizer])).toEqual([
      [1, T0 - DAY, false],
      [2, T0 - 2 * DAY, false],
    ]);
  });

  it("delete sends tz_offset in the query, removes the record and applies the summary", async () => {
    const store = await loaded([item(1), item(2)]);
    const applySummaries = vi.spyOn(usePlantsStore(), "applySummaries");
    api.delete.mockResolvedValue({ summary: summary(T0 - 2 * DAY) });
    await store.deleteRecord(7, 1);
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(api.delete).toHaveBeenCalledWith(
      `/watering/1?tz_offset=${-new Date().getTimezoneOffset()}`,
    );
    expect(ids(store, 7)).toEqual([2]);
    expect(api.get).not.toHaveBeenCalled();
    expect(applySummaries).toHaveBeenCalledTimes(1);
  });

  it("puts a record back at its place when the delete fails", async () => {
    const store = await loaded([item(1), item(2), item(3)]);
    api.delete.mockRejectedValue(new Error("500"));
    await expect(store.deleteRecord(7, 2)).rejects.toThrow("500");
    expect(ids(store, 7)).toEqual([1, 2, 3]);
  });

  it("batch add is one request, applies records and every summary, and never refetches", async () => {
    const store = await loaded([item(1)]);
    const applySummaries = vi.spyOn(usePlantsStore(), "applySummaries");
    api.post.mockResolvedValue({
      records: [
        apiWateringItem({ id: 20, plant_id: 7, date: T0 }),
        apiWateringItem({ id: 21, plant_id: 8, date: T0 }),
      ],
      summaries: { "7": summary(T0), "8": summary(T0) },
    });
    const created = await store.addBatch([
      { plantId: 7, usedFertilizer: false },
      { plantId: 8, usedFertilizer: false },
    ]);
    expect(created).toEqual([20, 21]);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/watering/batch", {
      entries: [
        { plantId: 7, usedFertilizer: false },
        { plantId: 8, usedFertilizer: false },
      ],
      tz_offset: -new Date().getTimezoneOffset(),
    });
    expect(ids(store, 7)).toEqual([20, 1]);
    expect(store.isLoaded(8)).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
    expect(applySummaries).toHaveBeenCalledTimes(1);
    expect([...applySummaries.mock.calls[0][0].keys()]).toEqual([7, 8]);
  });

  it("batch add deletes the created records again when a later chunk fails", async () => {
    const store = await loaded([item(1)]);
    const entries = Array.from({ length: 201 }, () => ({ plantId: 7, usedFertilizer: false }));
    api.post
      .mockResolvedValueOnce({
        records: [apiWateringItem({ id: 20, plant_id: 7, date: T0 })],
        summaries: { "7": summary(T0) },
      })
      .mockRejectedValueOnce(new Error("500"))
      .mockResolvedValueOnce({ summaries: { "7": summary(T0 - DAY) } });
    await expect(store.addBatch(entries)).rejects.toThrow("500");
    expect(api.post).toHaveBeenCalledTimes(3);
    expect(api.post).toHaveBeenLastCalledWith("/watering/batch/delete", {
      ids: [20],
      tz_offset: -new Date().getTimezoneOffset(),
    });
    expect(ids(store, 7)).toEqual([1]);
  });

  it("batch add stops posting chunks after a logout", async () => {
    const store = await loaded([item(1)]);
    const entries = Array.from({ length: 201 }, () => ({ plantId: 7, usedFertilizer: false }));
    let release!: (value: unknown) => void;
    api.post.mockReturnValue(new Promise((res) => (release = res)));
    const pending = store.addBatch(entries);
    epoch.abortAll();
    release({ records: [], summaries: {} });
    await pending;
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("batch delete is one request, drops the records and applies the summaries", async () => {
    const store = await loaded([item(1), item(2)]);
    const applySummaries = vi.spyOn(usePlantsStore(), "applySummaries");
    api.post.mockResolvedValue({ summaries: { "7": summary(T0 - 2 * DAY) } });
    await store.removeBatch([1], [7]);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/watering/batch/delete", {
      ids: [1],
      tz_offset: -new Date().getTimezoneOffset(),
    });
    expect(ids(store, 7)).toEqual([2]);
    expect(api.get).not.toHaveBeenCalled();
    expect(applySummaries).toHaveBeenCalledTimes(1);
  });

  it("a logout while a write is in flight applies nothing", async () => {
    const store = await loaded([item(1)]);
    const applySummaries = vi.spyOn(usePlantsStore(), "applySummaries");
    let release!: (value: unknown) => void;
    api.post.mockReturnValue(new Promise((res) => (release = res)));
    const pending = store.addRecord(7, { date: T0 + DAY, usedFertilizer: false });
    epoch.abortAll();
    release({ record: item(9, 7, { date: T0 + DAY }), summary: summary(T0 + DAY) });
    await pending;
    expect(applySummaries).not.toHaveBeenCalled();
    expect(ids(store, 7)).not.toContain(9);
  });

  it("a failed write after a logout does not roll anything back", async () => {
    const store = await loaded([item(1), item(2)]);
    let fail!: (error: Error) => void;
    api.delete.mockReturnValue(new Promise((_, rej) => (fail = rej)));
    const pending = store.deleteRecord(7, 1);
    epoch.abortAll();
    store.commitHistory(7, { items: [], nextCursor: null, loadedAt: Date.now() });
    fail(new Error("aborted"));
    await expect(pending).rejects.toThrow("aborted");
    expect(store.recordsFor(7)).toEqual([]);
  });
});

describe("dropPlant and the round wrapper", () => {
  it("forgets one plant's history and keeps the others", async () => {
    api.get.mockResolvedValue(envelope([item(1)]));
    const store = await newStore();
    await store.ensureRecords(7);
    await store.ensureRecords(8);
    store.dropPlant(7);
    expect(store.isLoaded(7)).toBe(false);
    expect(store.isLoaded(8)).toBe(true);
  });

  it("ensureRecordsFor loads no histories", async () => {
    const store = await newStore();
    await store.ensureRecordsFor([1, 2, 3]);
    expect(api.get).not.toHaveBeenCalled();
  });
});
