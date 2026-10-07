/**
 * Characterization tests for WateringService: dictionary cache keyed by plant
 * id, the 404-to-empty fallback, fertilizer types, and optimistic record
 * mutations that never touch sibling plants' entries.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { memoryStore, resetStore, toast } from "./helpers";

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
  isApiError: (e: unknown) => (e as { isApi?: boolean })?.isApi === true,
}));
vi.mock("@/utils/apiUtils", () => ({ default: api }));

import WateringService, { WateringEvents } from "@/services/WateringService";
import { BaseService } from "@/services/base/BaseService";

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

const events: Array<Record<string, WateringRecord[]>> = [];
const onChanged = (e: Event) => events.push((e as CustomEvent).detail);

beforeEach(() => {
  resetStore();
  BaseService.clearMemoryCache();
  vi.clearAllMocks();
  events.length = 0;
  document.removeEventListener(WateringEvents.RECORDS_CHANGED, onChanged);
  document.addEventListener(WateringEvents.RECORDS_CHANGED, onChanged);
});

describe("reading", () => {
  it("maps API records, converting epoch seconds to milliseconds", async () => {
    api.get.mockResolvedValue([apiRecord()]);
    const records = await WateringService.getWateringRecords(7);
    expect(api.get).toHaveBeenCalledWith("/watering/plant/7");
    expect(records).toEqual([
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

  it("caches per plant: a second read of the same plant does not hit the API", async () => {
    api.get.mockResolvedValue([apiRecord()]);
    await WateringService.getWateringRecords(7);
    await WateringService.getWateringRecords(7);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("fetches another plant separately and keeps both entries", async () => {
    api.get.mockImplementation(async (url: string) =>
      url.endsWith("/7") ? [apiRecord()] : [apiRecord({ record_id: 2, plant_id: 8 })],
    );
    await WateringService.getWateringRecords(7);
    await WateringService.getWateringRecords(8);
    const stored = memoryStore.get("watering_records_data") as { data: Record<string, unknown[]> };
    expect(Object.keys(stored.data).sort()).toEqual(["7", "8"]);
  });

  it("treats a 404 as an empty history", async () => {
    api.get.mockRejectedValue(notFound());
    expect(await WateringService.getWateringRecords(99)).toEqual([]);
    expect(toast.showError).not.toHaveBeenCalled();
  });

  it("loads fertilizer types once", async () => {
    api.get.mockResolvedValue([{ fertilizer_id: 1, fertilizer_name: "organic" }]);
    expect(await WateringService.getFertilizerTypes()).toEqual([{ id: 1, name: "organic" }]);
    await WateringService.getFertilizerTypes();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/watering/fertilizer-types");
  });
});

describe("addWateringRecord (optimistic)", () => {
  it("paints a negative-id record immediately and reconciles with the server record", async () => {
    api.get.mockResolvedValue([apiRecord()]);
    await WateringService.getWateringRecords(7);
    let release!: (r: APIWateringRecord) => void;
    api.post.mockReturnValue(new Promise((res) => (release = res)));

    const pending = WateringService.addWateringRecord(7, {
      date: 1719475200000,
      usedFertilizer: false,
    });
    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));
    const painted = events[0]["7"];
    expect(painted).toHaveLength(2);
    expect(painted[1].id).toBeLessThan(0);
    expect(painted[1].plantName).toBe("Monstera");

    release(apiRecord({ record_id: 55, watering_date: 1719475200 }));
    const created = await pending;
    expect(created.id).toBe(55);
    expect(events.at(-1)!["7"].map((r) => r.id)).toEqual([1, 55]);
    expect(api.post).toHaveBeenCalledWith("/watering/7", {
      date: 1719475200000,
      usedFertilizer: false,
    });
  });

  it("leaves sibling plants untouched when the request fails and removes only the painted record", async () => {
    api.get.mockImplementation(async (url: string) =>
      url.endsWith("/7") ? [apiRecord()] : [apiRecord({ record_id: 2, plant_id: 8 })],
    );
    await WateringService.getWateringRecords(7);
    await WateringService.getWateringRecords(8);
    api.post.mockRejectedValue(new Error("400"));
    await expect(WateringService.addWateringRecord(7, { usedFertilizer: false })).rejects.toThrow(
      "400",
    );
    expect((await WateringService.getWateringRecords(7)).map((r) => r.id)).toEqual([1]);
    expect((await WateringService.getWateringRecords(8)).map((r) => r.id)).toEqual([2]);
    expect(toast.showError).toHaveBeenCalledTimes(1);
  });

  it("uses the cached fertilizer type name for the optimistic record", async () => {
    api.get.mockResolvedValue([{ fertilizer_id: 2, fertilizer_name: "synthetic" }]);
    await WateringService.getFertilizerTypes();
    api.get.mockResolvedValue([]);
    await WateringService.getWateringRecords(7);
    let release!: (r: APIWateringRecord) => void;
    api.post.mockReturnValue(new Promise((res) => (release = res)));
    const pending = WateringService.addWateringRecord(7, {
      usedFertilizer: true,
      fertilizerTypeId: 2,
    });
    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));
    expect(events[0]["7"][0].fertilizerType).toBe("synthetic");
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
});

describe("editWateringRecord and deleteWateringRecord", () => {
  it("patches by record id and swaps in the server record", async () => {
    api.get.mockResolvedValue([apiRecord(), apiRecord({ record_id: 2 })]);
    await WateringService.getWateringRecords(7);
    api.patch.mockResolvedValue(apiRecord({ record_id: 2, used_fertilizer: true }));
    await WateringService.editWateringRecord(7, 2, { usedFertilizer: true });
    expect(api.patch).toHaveBeenCalledWith("/watering/2", { usedFertilizer: true });
    const records = await WateringService.getWateringRecords(7);
    expect(records.map((r) => r.usedFertilizer)).toEqual([false, true]);
  });

  it("restores the previous record when an edit fails", async () => {
    api.get.mockResolvedValue([apiRecord()]);
    await WateringService.getWateringRecords(7);
    api.patch.mockRejectedValue(new Error("403"));
    await expect(
      WateringService.editWateringRecord(7, 1, { usedFertilizer: true }),
    ).rejects.toThrow("403");
    expect((await WateringService.getWateringRecords(7))[0].usedFertilizer).toBe(false);
  });

  it("removes a record immediately and re-inserts it at its index on failure", async () => {
    api.get.mockResolvedValue([
      apiRecord(),
      apiRecord({ record_id: 2 }),
      apiRecord({ record_id: 3 }),
    ]);
    await WateringService.getWateringRecords(7);
    api.delete.mockRejectedValue(new Error("500"));
    await expect(WateringService.deleteWateringRecord(7, 2)).rejects.toThrow("500");
    expect((await WateringService.getWateringRecords(7)).map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("keeps a deleted record out of the cache on success", async () => {
    api.get.mockResolvedValue([apiRecord(), apiRecord({ record_id: 2 })]);
    await WateringService.getWateringRecords(7);
    api.delete.mockResolvedValue(null);
    await WateringService.deleteWateringRecord(7, 1);
    expect(api.delete).toHaveBeenCalledWith("/watering/1");
    expect((await WateringService.getWateringRecords(7)).map((r) => r.id)).toEqual([2]);
  });
});

describe("cache invalidation", () => {
  it("drops one plant's entry and announces the change", async () => {
    api.get.mockResolvedValue([apiRecord()]);
    await WateringService.getWateringRecords(7);
    await WateringService.invalidatePlantCache(7);
    const stored = memoryStore.get("watering_records_data") as { data: Record<string, unknown> };
    expect(stored.data).toEqual({});
    expect(events.at(-1)).toEqual({});
  });

  it("removes the whole watering cache without an id", async () => {
    api.get.mockResolvedValue([apiRecord()]);
    await WateringService.getWateringRecords(7);
    await WateringService.invalidatePlantCache();
    expect(memoryStore.has("watering_records_data")).toBe(false);
  });
});
