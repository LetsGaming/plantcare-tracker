/**
 * Tests for the watering store: records keyed by plant id, the 404-to-empty
 * fallback, fertilizer types, optimistic record mutations that never touch
 * other plants' entries, and persistence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInstalledPinia, memoryStore, resetStore, toast } from "./helpers";

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

import { useWateringStore } from "@/stores/watering";

const apiRecord = (overrides: Partial<APIWateringRecord> = {}): APIWateringRecord => ({
  record_id: 1,
  plant_id: 7,
  plant_name: "Monstera",
  owner_id: 1,
  watering_date: 1719388800,
  used_fertilizer: false,
  fertilizer_type_id: null,
  fertilizer_type: null,
  ...overrides,
});

const notFound = () => Object.assign(new Error("not found"), { isApi: true, status: 404 });

const newStore = async () => {
  await createInstalledPinia();
  return useWateringStore();
};

const ids = (store: ReturnType<typeof useWateringStore>, plantId: number) =>
  store.recordsFor(plantId).map((r) => r.id);

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reading", () => {
  it("maps API records, converting epoch seconds to milliseconds", async () => {
    api.get.mockResolvedValue([apiRecord()]);
    const store = await newStore();
    await store.ensureRecords(7);
    expect(api.get).toHaveBeenCalledWith("/watering/plant/7");
    expect(store.recordsFor(7)).toEqual([
      expect.objectContaining({
        id: 1,
        plantId: 7,
        plantName: "Monstera",
        date_millis: 1719388800 * 1000,
        usedFertilizer: false,
        fertilizerTypeId: undefined,
        fertilizerType: undefined,
      }),
    ]);
  });

  it("loads each plant once and shares concurrent requests", async () => {
    api.get.mockResolvedValue([apiRecord()]);
    const store = await newStore();
    await Promise.all([store.ensureRecords(7), store.ensureRecords(7)]);
    await store.ensureRecords(7);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("refetches when forced", async () => {
    api.get.mockResolvedValue([apiRecord()]);
    const store = await newStore();
    await store.ensureRecords(7);
    await store.ensureRecords(7, { force: true });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("fetches another plant separately and keeps both entries", async () => {
    api.get.mockImplementation(async (url: string) =>
      url.endsWith("/7") ? [apiRecord()] : [apiRecord({ record_id: 2, plant_id: 8 })],
    );
    const store = await newStore();
    await store.ensureRecords(7);
    await store.ensureRecords(8);
    expect(ids(store, 7)).toEqual([1]);
    expect(ids(store, 8)).toEqual([2]);
  });

  it("treats a 404 as an empty history without a toast", async () => {
    api.get.mockRejectedValue(notFound());
    const store = await newStore();
    await store.ensureRecords(99);
    expect(store.recordsFor(99)).toEqual([]);
    expect(toast.showError).not.toHaveBeenCalled();
  });

  it("shows one toast and rethrows when the request fails", async () => {
    api.get.mockRejectedValue(new Error("offline"));
    const store = await newStore();
    await expect(store.ensureRecords(7)).rejects.toThrow("offline");
    expect(toast.showError).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list for a plant that is not loaded", async () => {
    const store = await newStore();
    expect(store.recordsFor(123)).toEqual([]);
  });

  it("loads fertilizer types once", async () => {
    api.get.mockResolvedValue([{ fertilizer_id: 1, fertilizer_name: "organic" }]);
    const store = await newStore();
    await store.ensureFertilizerTypes();
    await store.ensureFertilizerTypes();
    expect(store.fertilizerTypes).toEqual([{ id: 1, name: "organic" }]);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/watering/fertilizer-types");
  });
});

describe("addRecord (optimistic)", () => {
  it("paints a negative-id record immediately and reconciles with the server record", async () => {
    api.get.mockResolvedValue([apiRecord()]);
    const store = await newStore();
    await store.ensureRecords(7);
    let release!: (r: APIWateringRecord) => void;
    api.post.mockReturnValue(new Promise((res) => (release = res)));

    const pending = store.addRecord(7, { date: 1719475200000, usedFertilizer: false });
    await vi.waitFor(() => expect(store.recordsFor(7)).toHaveLength(2));
    const painted = store.recordsFor(7)[1];
    expect(painted.id).toBeLessThan(0);
    expect(painted.plantName).toBe("Monstera");

    release(apiRecord({ record_id: 55, watering_date: 1719475200 }));
    const created = await pending;
    expect(created.id).toBe(55);
    expect(ids(store, 7)).toEqual([1, 55]);
    expect(api.post).toHaveBeenCalledWith("/watering/7", {
      date: 1719475200000,
      usedFertilizer: false,
    });
  });

  it("leaves other plants untouched when the request fails and removes only the painted record", async () => {
    api.get.mockImplementation(async (url: string) =>
      url.endsWith("/7") ? [apiRecord()] : [apiRecord({ record_id: 2, plant_id: 8 })],
    );
    const store = await newStore();
    await store.ensureRecords(7);
    await store.ensureRecords(8);
    api.post.mockRejectedValue(new Error("400"));
    await expect(store.addRecord(7, { usedFertilizer: false })).rejects.toThrow("400");
    expect(ids(store, 7)).toEqual([1]);
    expect(ids(store, 8)).toEqual([2]);
    expect(toast.showError).toHaveBeenCalledTimes(1);
  });

  it("uses the loaded fertilizer type name for the optimistic record", async () => {
    api.get.mockResolvedValue([{ fertilizer_id: 2, fertilizer_name: "synthetic" }]);
    const store = await newStore();
    await store.ensureFertilizerTypes();
    let release!: (r: APIWateringRecord) => void;
    api.post.mockReturnValue(new Promise((res) => (release = res)));

    const pending = store.addRecord(7, { usedFertilizer: true, fertilizerTypeId: 2 });
    await vi.waitFor(() => expect(store.recordsFor(7)).toHaveLength(1));
    expect(store.recordsFor(7)[0].fertilizerType).toBe("synthetic");

    release(
      apiRecord({
        record_id: 3,
        used_fertilizer: true,
        fertilizer_type_id: 2,
        fertilizer_type: "synthetic",
      }),
    );
    await pending;
  });

  it("does not let a create before the first load hide the server history", async () => {
    api.post.mockResolvedValue(apiRecord({ record_id: 9 }));
    const store = await newStore();
    await store.addRecord(7, { usedFertilizer: false });

    api.get.mockResolvedValue([apiRecord({ record_id: 1 }), apiRecord({ record_id: 9 })]);
    await store.ensureRecords(7);
    expect(ids(store, 7)).toEqual([1, 9]);
  });
});

describe("editRecord and deleteRecord", () => {
  it("patches by record id and swaps in the server record", async () => {
    api.get.mockResolvedValue([apiRecord(), apiRecord({ record_id: 2 })]);
    const store = await newStore();
    await store.ensureRecords(7);
    api.patch.mockResolvedValue(apiRecord({ record_id: 2, used_fertilizer: true }));
    await store.editRecord(7, 2, { usedFertilizer: true });
    expect(api.patch).toHaveBeenCalledWith("/watering/2", { usedFertilizer: true });
    expect(store.recordsFor(7).map((r) => r.usedFertilizer)).toEqual([false, true]);
  });

  it("restores the previous record when an edit fails", async () => {
    api.get.mockResolvedValue([apiRecord()]);
    const store = await newStore();
    await store.ensureRecords(7);
    api.patch.mockRejectedValue(new Error("403"));
    await expect(store.editRecord(7, 1, { usedFertilizer: true })).rejects.toThrow("403");
    expect(store.recordsFor(7)[0].usedFertilizer).toBe(false);
  });

  it("removes a record immediately and re-inserts it at its index on failure", async () => {
    api.get.mockResolvedValue([
      apiRecord(),
      apiRecord({ record_id: 2 }),
      apiRecord({ record_id: 3 }),
    ]);
    const store = await newStore();
    await store.ensureRecords(7);
    api.delete.mockRejectedValue(new Error("500"));
    await expect(store.deleteRecord(7, 2)).rejects.toThrow("500");
    expect(ids(store, 7)).toEqual([1, 2, 3]);
  });

  it("keeps a deleted record out on success", async () => {
    api.get.mockResolvedValue([apiRecord(), apiRecord({ record_id: 2 })]);
    const store = await newStore();
    await store.ensureRecords(7);
    api.delete.mockResolvedValue(null);
    await store.deleteRecord(7, 1);
    expect(api.delete).toHaveBeenCalledWith("/watering/1");
    expect(ids(store, 7)).toEqual([2]);
  });
});

describe("dropPlant", () => {
  it("forgets one plant's records and keeps the others", async () => {
    api.get.mockImplementation(async (url: string) =>
      url.endsWith("/7") ? [apiRecord()] : [apiRecord({ record_id: 2, plant_id: 8 })],
    );
    const store = await newStore();
    await store.ensureRecords(7);
    await store.ensureRecords(8);
    store.dropPlant(7);
    expect(store.recordsFor(7)).toEqual([]);
    expect(ids(store, 8)).toEqual([2]);
  });
});

describe("persistence", () => {
  it("stores records and fertilizer types in the existing cache keys", async () => {
    vi.useFakeTimers();
    api.get.mockImplementation(async (url: string) =>
      url.endsWith("fertilizer-types")
        ? [{ fertilizer_id: 1, fertilizer_name: "organic" }]
        : [apiRecord()],
    );
    const store = await newStore();
    await store.ensureRecords(7);
    await store.ensureFertilizerTypes();
    await vi.advanceTimersByTimeAsync(500);

    const records = memoryStore.get("watering_records_data") as { data: Record<string, unknown[]> };
    expect(Object.keys(records.data)).toEqual(["7"]);
    const types = memoryStore.get("fertilizer_types_data") as { data: FertilizerType[] };
    expect(types.data).toEqual([{ id: 1, name: "organic" }]);
  });

  it("hydrates fresh snapshots instead of calling the API", async () => {
    memoryStore.set("watering_records_data", {
      data: { 7: [{ id: 4, plantId: 7 }] },
      timestamp: Date.now(),
    });
    memoryStore.set("fertilizer_types_data", {
      data: [{ id: 1, name: "organic" }],
      timestamp: Date.now(),
    });
    const store = await newStore();
    await store.ensureRecords(7);
    await store.ensureFertilizerTypes();
    expect(api.get).not.toHaveBeenCalled();
    expect(ids(store, 7)).toEqual([4]);
    expect(store.fertilizerTypes).toHaveLength(1);
  });

  it("writes nothing back after a reset", async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValue([apiRecord()]);
    const store = await newStore();
    await store.ensureRecords(7);
    store.$reset();
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.has("watering_records_data")).toBe(false);
    expect(store.recordsFor(7)).toEqual([]);
  });
});
