/**
 * Characterization tests for PlantService: cache-first reads, derived
 * personal/public views, optimistic create/edit/delete with reconcile and
 * item-scoped rollback, and the dependent image refresh. ApiUtils and the
 * sibling services are mocked; storage is an in-memory map.
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

vi.mock("@/utils/apiUtils", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    isApiError: () => false,
  },
}));
vi.mock("@/stores/session", () => ({ currentUserId: () => 1 }));
vi.mock("@/services/ImageService", () => ({ default: { uploadImage: vi.fn(async () => ({})) } }));
vi.mock("@/services/WateringService", () => ({
  default: { invalidatePlantCache: vi.fn(async () => undefined) },
}));
vi.mock("@/services/SubstrateService", () => ({
  default: { getAllSubstrates: vi.fn(async () => [{ id: 5, name: "Aroid Mix" }]) },
}));

import ApiUtils from "@/utils/apiUtils";
import ImageService from "@/services/ImageService";
import WateringService from "@/services/WateringService";
import PlantService, { PlantEvents } from "@/services/PlantService";
import { BaseService } from "@/services/base/BaseService";

const apiPlant = (overrides: Partial<APIPlant> = {}): APIPlant => ({
  plant_id: 10,
  plant_user_id: 1,
  plant_name: "Monstera",
  plant_species: "Monstera deliciosa",
  is_public: false,
  plant_created_at: 1704067200,
  image_url: null,
  substrate: { substrate_id: 5, substrate_name: "Aroid Mix" },
  images: [],
  ...overrides,
});

/** Records every list the service announces through PLANTS_UPDATED. */
const recordEvents = () => {
  const snapshots: Plant[][] = [];
  const handler = (e: Event) => snapshots.push([...(e as CustomEvent<Plant[]>).detail]);
  document.addEventListener(PlantEvents.PLANTS_UPDATED, handler);
  return {
    snapshots,
    stop: () => document.removeEventListener(PlantEvents.PLANTS_UPDATED, handler),
  };
};

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  resetStore();
  BaseService.clearMemoryCache();
  vi.clearAllMocks();
});

describe("reading plants", () => {
  it("fetches the list once and serves later reads from the cache", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([
      apiPlant(),
      apiPlant({ plant_id: 11, plant_user_id: 2 }),
    ]);
    const first = await PlantService.getAllPlants();
    const second = await PlantService.getAllPlants();
    expect(ApiUtils.get).toHaveBeenCalledTimes(1);
    expect(ApiUtils.get).toHaveBeenCalledWith("/plants");
    expect(second).toEqual(first);
    expect(first[0]).toMatchObject({ id: 10, userId: 1, name: "Monstera", isPublic: false });
  });

  it("refetches with forceUpdate", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([apiPlant()]);
    await PlantService.getAllPlants();
    await PlantService.getAllPlants(true);
    expect(ApiUtils.get).toHaveBeenCalledTimes(2);
  });

  it("derives personal and public views from the cached list", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([
      apiPlant({ plant_id: 1, plant_user_id: 1, is_public: false }),
      apiPlant({ plant_id: 2, plant_user_id: 1, is_public: true }),
      apiPlant({ plant_id: 3, plant_user_id: 9, is_public: true }),
    ]);
    expect((await PlantService.getPersonalPlants()).map((p) => p.id)).toEqual([1, 2]);
    expect((await PlantService.getPublicPlants()).map((p) => p.id)).toEqual([2, 3]);
    expect(ApiUtils.get).toHaveBeenCalledTimes(1);
  });

  it("loads a single plant that is not in the list and upserts it into the cache", async () => {
    vi.mocked(ApiUtils.get).mockImplementation(async (url: string) =>
      url === "/plants"
        ? [apiPlant({ plant_id: 1 })]
        : apiPlant({ plant_id: 77, plant_name: "Remote" }),
    );
    const plant = await PlantService.getPlantById(77);
    expect(ApiUtils.get).toHaveBeenCalledWith("/plants/77");
    expect(plant.name).toBe("Remote");
    expect((await PlantService.getAllPlants()).map((p) => p.id)).toEqual([1, 77]);
  });

  it("shows one error toast and rethrows when the list request fails", async () => {
    vi.mocked(ApiUtils.get).mockRejectedValue(new Error("offline"));
    await expect(PlantService.getAllPlants()).rejects.toThrow("offline");
    expect(toast.showError).toHaveBeenCalledTimes(1);
  });
});

describe("addPlant (optimistic)", () => {
  it("paints a temporary negative-id plant, then swaps it for the server plant", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([apiPlant({ plant_id: 1, plant_name: "Existing" })]);
    await PlantService.getAllPlants();
    const gate = deferred<APIPlant>();
    vi.mocked(ApiUtils.post).mockReturnValue(gate.promise as never);
    const events = recordEvents();

    const pending = PlantService.addPlant({
      name: "New",
      species: "Ficus",
      substrateId: 5,
      isPublic: true,
    });
    await vi.waitFor(() => expect(events.snapshots).toHaveLength(1));
    const painted = events.snapshots[0];
    expect(painted.map((p) => p.name)).toEqual(["Existing", "New"]);
    expect(painted[1].id).toBeLessThan(0);
    expect(painted[1].substrate).toEqual({ id: 5, name: "Aroid Mix" });

    gate.resolve(apiPlant({ plant_id: 42, plant_name: "New" }));
    const created = await pending;
    events.stop();

    expect(created.id).toBe(42);
    const final = events.snapshots.at(-1)!;
    expect(final.map((p) => p.id)).toEqual([1, 42]);
  });

  it("posts the payload without the image file", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([]);
    await PlantService.getAllPlants();
    vi.mocked(ApiUtils.post).mockResolvedValue(apiPlant({ plant_id: 5 }));
    await PlantService.addPlant({
      name: "N",
      species: "S",
      substrateId: 5,
      image: new File(["x"], "x.png"),
    });
    expect(ApiUtils.post).toHaveBeenCalledWith("/plants", {
      name: "N",
      species: "S",
      substrateId: 5,
    });
  });

  it("rolls back only the optimistic plant when the request fails", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([apiPlant({ plant_id: 1 })]);
    await PlantService.getAllPlants();
    vi.mocked(ApiUtils.post).mockRejectedValue(new Error("400"));
    await expect(
      PlantService.addPlant({ name: "Bad", species: "S", substrateId: 5 }),
    ).rejects.toThrow("400");
    expect((await PlantService.getAllPlants()).map((p) => p.id)).toEqual([1]);
    expect(toast.showError).toHaveBeenCalledTimes(1);
  });

  it("replaces an unloaded list with the single created plant (BUG-06)", async () => {
    vi.mocked(ApiUtils.post).mockResolvedValue(apiPlant({ plant_id: 42 }));
    await PlantService.addPlant({ name: "First", species: "S", substrateId: 5 });
    vi.mocked(ApiUtils.get).mockResolvedValue([
      apiPlant({ plant_id: 1 }),
      apiPlant({ plant_id: 2 }),
    ]);
    const list = await PlantService.getAllPlants();
    expect(list.map((p) => p.id)).toEqual([42]);
    expect(ApiUtils.get).not.toHaveBeenCalled();
  });
});

describe("editPlant (optimistic)", () => {
  it("paints the merged plant immediately and reconciles with the server response", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([apiPlant({ plant_id: 1, plant_name: "Old" })]);
    await PlantService.getAllPlants();
    const gate = deferred<APIPlant>();
    vi.mocked(ApiUtils.patch).mockReturnValue(gate.promise as never);
    const events = recordEvents();

    const pending = PlantService.editPlant(1, { name: "Renamed" });
    await vi.waitFor(() => expect(events.snapshots).toHaveLength(1));
    expect(events.snapshots[0][0]).toMatchObject({
      id: 1,
      name: "Renamed",
      species: "Monstera deliciosa",
    });

    gate.resolve(apiPlant({ plant_id: 1, plant_name: "Renamed (server)" }));
    await pending;
    events.stop();
    expect(ApiUtils.patch).toHaveBeenCalledWith("/plants/1", { name: "Renamed" });
    expect((await PlantService.getAllPlants())[0].name).toBe("Renamed (server)");
  });

  it("restores the previous plant when the request fails", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([apiPlant({ plant_id: 1, plant_name: "Old" })]);
    await PlantService.getAllPlants();
    vi.mocked(ApiUtils.patch).mockRejectedValue(new Error("403"));
    await expect(PlantService.editPlant(1, { name: "Nope" })).rejects.toThrow("403");
    expect((await PlantService.getAllPlants())[0].name).toBe("Old");
  });
});

describe("deletePlant (optimistic)", () => {
  it("removes the plant immediately and clears its watering cache after the server confirms", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([
      apiPlant({ plant_id: 1 }),
      apiPlant({ plant_id: 2 }),
    ]);
    await PlantService.getAllPlants();
    const gate = deferred<void>();
    vi.mocked(ApiUtils.delete).mockReturnValue(gate.promise as never);
    const events = recordEvents();

    const pending = PlantService.deletePlant(1);
    await vi.waitFor(() => expect(events.snapshots).toHaveLength(1));
    expect(events.snapshots[0].map((p) => p.id)).toEqual([2]);
    expect(WateringService.invalidatePlantCache).not.toHaveBeenCalled();

    gate.resolve();
    await pending;
    events.stop();
    expect(ApiUtils.delete).toHaveBeenCalledWith("/plants/1");
    expect(WateringService.invalidatePlantCache).toHaveBeenCalledWith(1);
  });

  it("re-inserts the plant at its original position and keeps the watering cache on failure", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([
      apiPlant({ plant_id: 1 }),
      apiPlant({ plant_id: 2 }),
      apiPlant({ plant_id: 3 }),
    ]);
    await PlantService.getAllPlants();
    vi.mocked(ApiUtils.delete).mockRejectedValue(new Error("404"));
    await expect(PlantService.deletePlant(2)).rejects.toThrow("404");
    expect((await PlantService.getAllPlants()).map((p) => p.id)).toEqual([1, 2, 3]);
    expect(WateringService.invalidatePlantCache).not.toHaveBeenCalled();
  });
});

describe("uploadPlantImage", () => {
  it("uploads through ImageService, then refreshes just this plant", async () => {
    vi.mocked(ApiUtils.get).mockImplementation(async (url: string) =>
      url === "/plants"
        ? [apiPlant({ plant_id: 1 }), apiPlant({ plant_id: 2 })]
        : apiPlant({ plant_id: 1, image_url: "http://img/1.webp" }),
    );
    await PlantService.getAllPlants();
    const file = new File(["x"], "x.png");
    await PlantService.uploadPlantImage(1, file, "2024-06-01");
    expect(ImageService.uploadImage).toHaveBeenCalledWith(file, "plant", 1, "2024-06-01");
    expect(ApiUtils.get).toHaveBeenLastCalledWith("/plants/1");
    const list = await PlantService.getAllPlants();
    expect(list.map((p) => p.id)).toEqual([1, 2]);
    expect(list[0].imageUrl).toBe("http://img/1.webp");
  });
});

describe("persistence", () => {
  it("stores the list under plants_all with a timestamp so it survives reloads", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([apiPlant()]);
    await PlantService.getAllPlants();
    const stored = memoryStore.get("plants_all") as { data: Plant[]; timestamp: number };
    expect(stored.data).toHaveLength(1);
    expect(typeof stored.timestamp).toBe("number");
  });
});
