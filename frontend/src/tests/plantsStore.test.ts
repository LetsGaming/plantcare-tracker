/**
 * Tests for the plants store: cache-first reads, derived personal/public
 * lists, optimistic create/edit/delete with reconcile and item-scoped
 * rollback, the dependent image refresh and L2 persistence. ApiUtils and the
 * sibling services are mocked; storage is an in-memory map.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInstalledPinia, fakeJwt, memoryStore, resetStore, toast } from "./helpers";

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
    configureAuth: vi.fn(),
  },
}));
vi.mock("@/services/ImageService", () => ({ default: { uploadImage: vi.fn(async () => ({})) } }));

import ApiUtils from "@/utils/apiUtils";
import ImageService from "@/services/ImageService";
import { useWateringStore } from "@/stores/watering";
import { useSubstratesStore } from "@/stores/substrates";
import { useSessionStore } from "@/stores/session";
import { usePlantsStore } from "@/stores/plants";

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

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const newStore = async () => {
  await createInstalledPinia();
  await useSessionStore().storeToken(fakeJwt({ id: 1, username: "alice", role: "user" }));
  const substrates = useSubstratesStore();
  substrates.items = [{ id: 5, name: "Aroid Mix" } as Substrate];
  substrates.status = "ready";
  substrates.fetchedAt = Date.now();
  return usePlantsStore();
};

const ids = (plants: Plant[]) => plants.map((p) => p.id);

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reading plants", () => {
  it("fetches the list once and serves later reads from memory", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([
      apiPlant(),
      apiPlant({ plant_id: 11, plant_user_id: 2 }),
    ]);
    const store = await newStore();
    await store.ensureLoaded();
    await store.ensureLoaded();
    expect(ApiUtils.get).toHaveBeenCalledTimes(1);
    expect(ApiUtils.get).toHaveBeenCalledWith("/plants");
    expect(store.items[0]).toMatchObject({ id: 10, userId: 1, name: "Monstera", isPublic: false });
    expect(store.status).toBe("ready");
  });

  it("shares one request between concurrent callers", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([apiPlant()]);
    const store = await newStore();
    await Promise.all([store.ensureLoaded(), store.ensureLoaded(), store.ensureLoaded()]);
    expect(ApiUtils.get).toHaveBeenCalledTimes(1);
  });

  it("refetches when forced", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([apiPlant()]);
    const store = await newStore();
    await store.ensureLoaded();
    await store.ensureLoaded({ force: true });
    expect(ApiUtils.get).toHaveBeenCalledTimes(2);
  });

  it("refetches once the data is stale", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([apiPlant()]);
    const store = await newStore();
    await store.ensureLoaded();
    store.fetchedAt = Date.now() - 1000 * 60 * 60 * 24 * 30;
    await store.ensureLoaded();
    expect(ApiUtils.get).toHaveBeenCalledTimes(2);
  });

  it("derives personal and public lists from the loaded plants", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([
      apiPlant({ plant_id: 1, plant_user_id: 1, is_public: false }),
      apiPlant({ plant_id: 2, plant_user_id: 1, is_public: true }),
      apiPlant({ plant_id: 3, plant_user_id: 9, is_public: true }),
    ]);
    const store = await newStore();
    await store.ensureLoaded();
    expect(ids(store.personalPlants)).toEqual([1, 2]);
    expect(ids(store.publicPlants)).toEqual([2, 3]);
    expect(ApiUtils.get).toHaveBeenCalledTimes(1);
  });

  it("loads a single plant that is not in the list and upserts it", async () => {
    vi.mocked(ApiUtils.get).mockImplementation(async (url: string) =>
      url === "/plants"
        ? [apiPlant({ plant_id: 1 })]
        : apiPlant({ plant_id: 77, plant_name: "Remote" }),
    );
    const store = await newStore();
    const plant = await store.getPlant(77);
    expect(ApiUtils.get).toHaveBeenCalledWith("/plants/77");
    expect(plant.name).toBe("Remote");
    expect(ids(store.items)).toEqual([1, 77]);
  });

  it("serves a known plant without a request unless forced", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([apiPlant({ plant_id: 1 })]);
    const store = await newStore();
    await store.getPlant(1);
    expect(ApiUtils.get).toHaveBeenCalledTimes(1);
    vi.mocked(ApiUtils.get).mockResolvedValue(apiPlant({ plant_id: 1, plant_name: "Fresh" }));
    expect((await store.getPlant(1, true)).name).toBe("Fresh");
  });

  it("shows one error toast, rethrows and keeps the status honest when the request fails", async () => {
    vi.mocked(ApiUtils.get).mockRejectedValue(new Error("offline"));
    const store = await newStore();
    await expect(store.ensureLoaded()).rejects.toThrow("offline");
    expect(toast.showError).toHaveBeenCalledTimes(1);
    expect(store.status).toBe("error");
  });

  it("keeps showing loaded plants when a refresh fails", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValueOnce([apiPlant()]);
    const store = await newStore();
    await store.ensureLoaded();
    vi.mocked(ApiUtils.get).mockRejectedValue(new Error("offline"));
    await expect(store.ensureLoaded({ force: true })).rejects.toThrow();
    expect(store.items).toHaveLength(1);
    expect(store.status).toBe("ready");
  });
});

describe("addPlant (optimistic)", () => {
  it("paints a temporary negative-id plant, then swaps it for the server plant", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([apiPlant({ plant_id: 1, plant_name: "Existing" })]);
    const store = await newStore();
    await store.ensureLoaded();
    const gate = deferred<APIPlant>();
    vi.mocked(ApiUtils.post).mockReturnValue(gate.promise as never);

    const pending = store.addPlant({
      name: "New",
      species: "Ficus",
      substrateId: 5,
      isPublic: true,
    });
    await vi.waitFor(() => expect(store.items).toHaveLength(2));
    expect(store.items.map((p) => p.name)).toEqual(["Existing", "New"]);
    expect(store.items[1].id).toBeLessThan(0);
    expect(store.items[1].userId).toBe(1);
    expect(store.items[1].substrate).toEqual({ id: 5, name: "Aroid Mix" });

    gate.resolve(apiPlant({ plant_id: 42, plant_name: "New" }));
    const created = await pending;

    expect(created.id).toBe(42);
    expect(ids(store.items)).toEqual([1, 42]);
  });

  it("posts the payload without the image file", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([]);
    const store = await newStore();
    await store.ensureLoaded();
    vi.mocked(ApiUtils.post).mockResolvedValue(apiPlant({ plant_id: 5 }));
    await store.addPlant({
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
    const store = await newStore();
    await store.ensureLoaded();
    vi.mocked(ApiUtils.post).mockRejectedValue(new Error("400"));
    await expect(store.addPlant({ name: "Bad", species: "S", substrateId: 5 })).rejects.toThrow(
      "400",
    );
    expect(ids(store.items)).toEqual([1]);
    expect(toast.showError).toHaveBeenCalledTimes(1);
  });

  it("does not let a create before the first load hide the server list", async () => {
    vi.mocked(ApiUtils.post).mockResolvedValue(apiPlant({ plant_id: 42 }));
    const store = await newStore();
    await store.addPlant({ name: "First", species: "S", substrateId: 5 });
    expect(store.status).toBe("idle");

    vi.mocked(ApiUtils.get).mockResolvedValue([
      apiPlant({ plant_id: 1 }),
      apiPlant({ plant_id: 2 }),
      apiPlant({ plant_id: 42 }),
    ]);
    await store.ensureLoaded();
    expect(ids(store.items)).toEqual([1, 2, 42]);
  });
});

describe("editPlant (optimistic)", () => {
  it("paints the merged plant immediately and reconciles with the server response", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([apiPlant({ plant_id: 1, plant_name: "Old" })]);
    const store = await newStore();
    await store.ensureLoaded();
    const gate = deferred<APIPlant>();
    vi.mocked(ApiUtils.patch).mockReturnValue(gate.promise as never);

    const pending = store.editPlant(1, { name: "Renamed" });
    await vi.waitFor(() => expect(store.items[0].name).toBe("Renamed"));
    expect(store.items[0]).toMatchObject({ id: 1, species: "Monstera deliciosa" });

    gate.resolve(apiPlant({ plant_id: 1, plant_name: "Renamed (server)" }));
    await pending;
    expect(ApiUtils.patch).toHaveBeenCalledWith("/plants/1", { name: "Renamed" });
    expect(store.items[0].name).toBe("Renamed (server)");
  });

  it("restores the previous plant when the request fails", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([apiPlant({ plant_id: 1, plant_name: "Old" })]);
    const store = await newStore();
    await store.ensureLoaded();
    vi.mocked(ApiUtils.patch).mockRejectedValue(new Error("403"));
    await expect(store.editPlant(1, { name: "Nope" })).rejects.toThrow("403");
    expect(store.items[0].name).toBe("Old");
  });
});

describe("deletePlant (optimistic)", () => {
  it("removes the plant immediately and clears its watering cache after the server confirms", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([
      apiPlant({ plant_id: 1 }),
      apiPlant({ plant_id: 2 }),
    ]);
    const store = await newStore();
    await store.ensureLoaded();
    const gate = deferred<void>();
    vi.mocked(ApiUtils.delete).mockReturnValue(gate.promise as never);

    const dropPlant = vi.spyOn(useWateringStore(), "dropPlant");

    const pending = store.deletePlant(1);
    await vi.waitFor(() => expect(ids(store.items)).toEqual([2]));
    expect(dropPlant).not.toHaveBeenCalled();

    gate.resolve();
    await pending;
    expect(ApiUtils.delete).toHaveBeenCalledWith("/plants/1");
    expect(dropPlant).toHaveBeenCalledWith(1);
  });

  it("re-inserts the plant at its original position and keeps the watering cache on failure", async () => {
    vi.mocked(ApiUtils.get).mockResolvedValue([
      apiPlant({ plant_id: 1 }),
      apiPlant({ plant_id: 2 }),
      apiPlant({ plant_id: 3 }),
    ]);
    const store = await newStore();
    await store.ensureLoaded();
    vi.mocked(ApiUtils.delete).mockRejectedValue(new Error("404"));
    const dropPlant = vi.spyOn(useWateringStore(), "dropPlant");
    await expect(store.deletePlant(2)).rejects.toThrow("404");
    expect(ids(store.items)).toEqual([1, 2, 3]);
    expect(dropPlant).not.toHaveBeenCalled();
  });
});

describe("uploadPlantImage", () => {
  it("uploads through ImageService, then refreshes just this plant", async () => {
    vi.mocked(ApiUtils.get).mockImplementation(async (url: string) =>
      url === "/plants"
        ? [apiPlant({ plant_id: 1 }), apiPlant({ plant_id: 2 })]
        : apiPlant({ plant_id: 1, image_url: "http://img/1.webp" }),
    );
    const store = await newStore();
    await store.ensureLoaded();
    const file = new File(["x"], "x.png");
    await store.uploadPlantImage(1, file, "2024-06-01");
    expect(ImageService.uploadImage).toHaveBeenCalledWith(file, "plant", 1, "2024-06-01");
    expect(ApiUtils.get).toHaveBeenLastCalledWith("/plants/1");
    expect(ids(store.items)).toEqual([1, 2]);
    expect(store.items[0].imageUrl).toBe("http://img/1.webp");
  });
});

describe("persistence", () => {
  it("stores the list under plants_all with its fetch time so it survives reloads", async () => {
    vi.useFakeTimers();
    vi.mocked(ApiUtils.get).mockResolvedValue([apiPlant()]);
    const store = await newStore();
    await store.ensureLoaded();
    await vi.advanceTimersByTimeAsync(500);
    const stored = memoryStore.get("plants_all") as {
      data: Plant[];
      timestamp: number;
      keepOnClear: boolean;
    };
    expect(stored.data).toHaveLength(1);
    expect(stored.timestamp).toBe(store.fetchedAt);
    expect(stored.keepOnClear).toBe(false);
  });

  it("hydrates a fresh snapshot instead of calling the API", async () => {
    memoryStore.set("plants_all", {
      data: [{ id: 3, userId: 1, name: "Cached", isPublic: false }],
      timestamp: Date.now(),
      keepOnClear: false,
    });
    const store = await newStore();
    await store.ensureLoaded();
    expect(ApiUtils.get).not.toHaveBeenCalled();
    expect(ids(store.items)).toEqual([3]);
    expect(store.status).toBe("ready");
  });

  it("ignores an expired snapshot and fetches", async () => {
    memoryStore.set("plants_all", {
      data: [{ id: 3 }],
      timestamp: Date.now() - 1000 * 60 * 60 * 24 * 30,
    });
    vi.mocked(ApiUtils.get).mockResolvedValue([apiPlant({ plant_id: 8 })]);
    const store = await newStore();
    await store.ensureLoaded();
    expect(ids(store.items)).toEqual([8]);
  });

  it("writes nothing back after a reset, so the next account cannot read an empty fresh entry", async () => {
    vi.useFakeTimers();
    vi.mocked(ApiUtils.get).mockResolvedValue([apiPlant()]);
    const store = await newStore();
    await store.ensureLoaded();
    store.$reset();
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.has("plants_all")).toBe(false);
    expect(store.items).toEqual([]);
    expect(store.status).toBe("idle");
  });
});
