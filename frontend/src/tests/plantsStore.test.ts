/**
 * Tests for the plants store on the paged summary contract: `mine` loaded in
 * full with tz_offset, `public` paged with server search, single copy-on-write
 * summary commits, detail fetches, optimistic writes that merge the detail DTO
 * and the persisted entries. ApiUtils and the sibling services are mocked;
 * storage is an in-memory map.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  apiImageDto,
  apiPlantDetail,
  apiPlantListItem,
  apiWateringSummary,
  createInstalledPinia,
  envelope,
  fakeJwt,
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

import { isProxy } from "vue";
import ApiUtils from "@/utils/apiUtils";
import ImageService from "@/services/ImageService";
import { epoch } from "@/stores/resource";
import { useWateringStore } from "@/stores/watering";
import { useSubstratesStore } from "@/stores/substrates";
import { useSessionStore } from "@/stores/session";
import { usePlantsStore } from "@/stores/plants";

const item = (id: number, overrides: Partial<APIPlantListItem> = {}): APIPlantListItem =>
  apiPlantListItem({
    plant_id: id,
    plant_name: `Plant ${id}`,
    user_id: 1,
    watering: apiWateringSummary(),
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

interface Routes {
  mine?: (params: URLSearchParams) => unknown;
  public?: (params: URLSearchParams) => unknown;
  one?: (id: number) => unknown;
}

const route = (routes: Routes) =>
  vi.mocked(ApiUtils.get).mockImplementation((async (path: string) => {
    const url = new URL(path, "http://test");
    const single = /^\/plants\/(\d+)$/.exec(url.pathname);
    if (single) return routes.one?.(Number(single[1]));
    const scope = url.searchParams.get("scope") === "mine" ? routes.mine : routes.public;
    return scope?.(url.searchParams);
  }) as never);

const page = (items: APIPlantListItem[], next: string | null = null, total?: number) =>
  envelope(items, next, total).data;

const newStore = async (
  claims: Record<string, unknown> = { id: 1, username: "alice", role: "user" },
) => {
  await createInstalledPinia();
  await useSessionStore().storeToken(fakeJwt(claims));
  const substrates = useSubstratesStore();
  substrates.items = [{ id: 5, name: "Aroid Mix" } as Substrate];
  substrates.status = "ready";
  substrates.fetchedAt = Date.now();
  return usePlantsStore();
};

const ids = (plants: readonly PlantView[]) => plants.map((p) => p.id);

const requested = (): URL[] =>
  vi.mocked(ApiUtils.get).mock.calls.map(([path]) => new URL(path as string, "http://test"));

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("own plants (mine)", () => {
  it("loads every plant in pages of 100 with the client's tz_offset and serves later reads from memory", async () => {
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-120);
    route({
      mine: (params) =>
        params.get("cursor") === null ? page([item(1), item(2)], "c1", 3) : page([item(3)], null),
    });
    const store = await newStore();
    await store.ensureMine();
    await store.ensureMine();

    const calls = requested();
    expect(calls).toHaveLength(2);
    expect(calls[0].searchParams.get("scope")).toBe("mine");
    expect(calls[0].searchParams.get("limit")).toBe("100");
    expect(calls[0].searchParams.get("tz_offset")).toBe("120");
    expect(calls[1].searchParams.get("cursor")).toBe("c1");
    expect(ids(store.personalPlants)).toEqual([1, 2, 3]);
    expect(store.mine.status).toBe("ready");
    expect(store.personalPlants[0]).toMatchObject({ name: "Plant 1", userId: 1 });
  });

  it("shares one load between concurrent callers and refetches when forced", async () => {
    route({ mine: () => page([item(1)]) });
    const store = await newStore();
    await Promise.all([store.ensureMine(), store.ensureMine(), store.ensureLoaded()]);
    expect(ApiUtils.get).toHaveBeenCalledTimes(1);
    await store.ensureMine({ force: true });
    expect(ApiUtils.get).toHaveBeenCalledTimes(2);
  });

  it("refetches once the data is stale", async () => {
    route({ mine: () => page([item(1)]) });
    const store = await newStore();
    await store.ensureMine();
    store.mine.fetchedAt = Date.now() - 1000 * 60 * 60 * 24 * 30;
    await store.ensureMine();
    expect(ApiUtils.get).toHaveBeenCalledTimes(2);
  });

  it("shows one error toast, rethrows and keeps the status honest when the request fails", async () => {
    vi.mocked(ApiUtils.get).mockRejectedValue(new Error("offline"));
    const store = await newStore();
    await expect(store.ensureMine()).rejects.toThrow("offline");
    expect(toast.showError).toHaveBeenCalledTimes(1);
    expect(store.mine.status).toBe("error");
  });

  it("keeps showing loaded plants when a refresh fails", async () => {
    route({ mine: () => page([item(1)]) });
    const store = await newStore();
    await store.ensureMine();
    vi.mocked(ApiUtils.get).mockRejectedValue(new Error("offline"));
    await expect(store.ensureMine({ force: true })).rejects.toThrow();
    expect(store.personalPlants).toHaveLength(1);
    expect(store.mine.status).toBe("ready");
  });

  it("drops a load that was in flight when the session ended", async () => {
    const gate = deferred<unknown>();
    vi.mocked(ApiUtils.get).mockReturnValue(gate.promise as never);
    const store = await newStore();
    const pending = store.ensureMine();
    await vi.waitFor(() => expect(ApiUtils.get).toHaveBeenCalled());

    epoch.abortAll();
    gate.resolve(page([item(1)]));
    await pending;

    expect(store.personalPlants).toEqual([]);
    expect(store.mine.status).not.toBe("ready");
    expect(toast.showError).not.toHaveBeenCalled();
  });

  it("does not ask for own plants as a guest", async () => {
    route({ public: () => page([item(9, { user_id: 7, watering: null })]) });
    const store = await newStore({ id: 0, username: "guest", role: "guest" });
    await store.ensureMine();
    await store.ensurePublic();
    expect(requested().map((url) => url.searchParams.get("scope"))).toEqual(["public"]);
    expect(store.personalPlants).toEqual([]);
    expect(ids(store.publicPlants)).toEqual([9]);
  });
});

describe("public plants", () => {
  it("loads the first page with the default sort and appends the next page", async () => {
    route({
      public: (params) =>
        params.get("cursor") === null
          ? page([item(1, { user_id: 7, watering: null })], "c1", 2)
          : page([item(2, { user_id: 7, watering: null })]),
    });
    const store = await newStore();
    await store.ensurePublic();
    expect(requested()[0].searchParams.get("limit")).toBe("30");
    expect(requested()[0].searchParams.get("tz_offset")).toBeNull();
    expect(store.public.total).toBe(2);

    await store.loadMorePublic();
    expect(requested()[1].searchParams.get("cursor")).toBe("c1");
    expect(ids(store.publicPlants)).toEqual([1, 2]);
    expect(store.public.nextCursor).toBeNull();
  });

  it("searches on the server: a new query resets the paging and the list", async () => {
    route({
      public: (params) =>
        params.get("q") === "fern"
          ? page([item(5, { plant_name: "Fern", watering: null })], null, 1)
          : page([item(1, { watering: null }), item(2, { watering: null })], "c1", 40),
    });
    const store = await newStore();
    await store.ensurePublic();
    expect(store.public.nextCursor).toBe("c1");

    await store.setPublicQuery("  fern ");
    const last = requested().at(-1)!;
    expect(last.searchParams.get("q")).toBe("fern");
    expect(last.searchParams.get("cursor")).toBeNull();
    expect(ids(store.publicPlants)).toEqual([5]);
    expect(store.public.nextCursor).toBeNull();
    expect(store.public.total).toBe(1);

    const calls = requested().length;
    await store.setPublicQuery("fern");
    expect(requested()).toHaveLength(calls);
  });

  it("drops the answer of an older query", async () => {
    const slow = deferred<unknown>();
    vi.mocked(ApiUtils.get).mockImplementation((async (path: string) => {
      const q = new URL(path, "http://test").searchParams.get("q");
      if (q === "a") return slow.promise;
      return page([item(2, { plant_name: "Newer", watering: null })]);
    }) as never);
    const store = await newStore();
    const first = store.setPublicQuery("a");
    const second = store.setPublicQuery("ab");
    await second;
    slow.resolve(page([item(1, { plant_name: "Older", watering: null })]));
    await first;
    expect(ids(store.publicPlants)).toEqual([2]);
  });

  it("keeps only the default first page persisted", async () => {
    vi.useFakeTimers();
    route({
      public: (params) =>
        params.get("q") === "x"
          ? page([item(5, { watering: null })])
          : page([item(1, { watering: null })], "c1"),
    });
    const store = await newStore();
    await store.ensurePublic();
    await vi.advanceTimersByTimeAsync(500);
    const stored = memoryStore.get("plants_public") as { data: { items: PlantView[] } };
    expect(ids(stored.data.items)).toEqual([1]);

    await store.setPublicQuery("x");
    await vi.advanceTimersByTimeAsync(500);
    expect(ids((memoryStore.get("plants_public") as typeof stored).data.items)).toEqual([1]);
  });

  const storePublicSnapshot = () =>
    memoryStore.set("plants_public", {
      data: {
        items: [{ id: 3, userId: 7, name: "Cached", searchText: "cached" }],
        nextCursor: null,
        total: 1,
        fetchedAt: Date.now(),
      },
      timestamp: Date.now(),
      keepOnClear: false,
    });

  it("hydrates the stored first page before the first load and makes no request while it is fresh", async () => {
    storePublicSnapshot();
    const store = await newStore();
    await store.ensurePublic();
    expect(ApiUtils.get).not.toHaveBeenCalled();
    expect(ids(store.publicPlants)).toEqual([3]);
    expect(store.public.status).toBe("ready");
  });

  it("revalidates a hydrated page with a conditional first-page request", async () => {
    storePublicSnapshot();
    route({ public: () => page([item(8, { user_id: 7, watering: null })]) });
    const store = await newStore();
    await store.ensurePublic();
    await store.ensurePublic({ force: true });
    expect(ApiUtils.get).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ApiUtils.get).mock.calls[0][2]).toEqual({ conditional: true });
    expect(ids(store.publicPlants)).toEqual([8]);
  });

  it("answers a 304 by keeping the hydrated page", async () => {
    storePublicSnapshot();
    vi.mocked(ApiUtils.get).mockResolvedValue({ notModified: true } as never);
    const store = await newStore();
    await store.ensurePublic();
    await store.ensurePublic({ force: true });
    expect(ids(store.publicPlants)).toEqual([3]);
    expect(store.public.status).toBe("ready");
  });
});

describe("details", () => {
  it("fetches one plant with images and tz_offset and keeps it when it is in no list", async () => {
    route({
      one: (id) =>
        apiPlantDetail({ plant_id: id, plant_name: "Remote", images: [apiImageDto({ id: 3 })] }),
    });
    const store = await newStore();
    const plant = await store.getPlant(77);
    const call = requested()[0];
    expect(call.pathname).toBe("/plants/77");
    expect(call.searchParams.has("tz_offset")).toBe(true);
    expect(plant.images).toHaveLength(1);
    expect(store.byId(77)).toBe(plant);
    expect(ids(store.personalPlants)).toEqual([]);
  });

  it("refetches a plant known only from a list, and serves a detailed one without a request", async () => {
    route({
      mine: () => page([item(1)]),
      one: (id) => apiPlantDetail({ plant_id: id, plant_name: "Detailed", user_id: 1 }),
    });
    const store = await newStore();
    await store.ensureMine();
    expect(store.byId(1)?.images).toBeUndefined();

    const detailed = await store.getPlant(1);
    expect(detailed.images).toHaveLength(1);
    expect(store.personalPlants[0]).toBe(detailed);
    const calls = requested().length;
    expect(await store.getPlant(1)).toBe(detailed);
    expect(requested()).toHaveLength(calls);
  });
});

describe("applySummaries", () => {
  const summary = (lastWateredAt: number | null): WateringSummary => ({
    lastWateredAt,
    lastFertilizedAt: null,
    avgIntervalDays: null,
  });

  it("updates one plant with a single commit and leaves the others untouched", async () => {
    route({ mine: () => page([item(1), item(2), item(3)]) });
    const store = await newStore();
    await store.ensureMine();
    const before = store.personalPlants;

    store.applySummaries(new Map([[2, summary(1000)]]));

    const after = store.personalPlants;
    expect(after).not.toBe(before);
    expect(Object.isFrozen(after[1])).toBe(true);
    expect(after[1].watering).toEqual(summary(1000));
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(before[1].watering?.lastWateredAt).toBeNull();
  });

  it("commits every summary of a batch in one new list and ignores unknown plants", async () => {
    route({ mine: () => page([item(1), item(2), item(3)]) });
    const store = await newStore();
    await store.ensureMine();
    const commits: unknown[] = [];
    store.$subscribe(() => commits.push(store.mine.items), { flush: "sync" });

    store.applySummaries(
      new Map([
        [1, summary(10)],
        [3, summary(30)],
        [99, summary(99)],
      ]),
    );

    expect(store.personalPlants.map((p) => p.watering?.lastWateredAt)).toEqual([10, null, 30]);
    expect(new Set(commits).size).toBe(1);
  });

  it("does not touch a list that does not hold the plant", async () => {
    route({ mine: () => page([item(1)]) });
    const store = await newStore();
    await store.ensureMine();
    const before = store.personalPlants;
    store.applySummaries(new Map([[50, summary(5)]]));
    expect(store.personalPlants).toBe(before);
  });

  it("also updates the public list and the persisted first page", async () => {
    vi.useFakeTimers();
    route({
      mine: () => page([item(1, { is_public: true })]),
      public: () =>
        page([
          item(1, { is_public: true, watering: null }),
          item(2, { user_id: 7, watering: null }),
        ]),
    });
    const store = await newStore();
    await store.ensureMine();
    await store.ensurePublic();
    await vi.advanceTimersByTimeAsync(500);

    store.applySummaries(new Map([[1, summary(4000)]]));
    await vi.advanceTimersByTimeAsync(500);

    expect(store.publicPlants[0].watering).toEqual(summary(4000));
    expect(store.public.firstPage?.items[0].watering).toEqual(summary(4000));
    const stored = memoryStore.get("plants_public") as { data: { items: PlantView[] } };
    expect(stored.data.items[0].watering?.lastWateredAt).toBe(4000);
  });
});

describe("addPlant (optimistic)", () => {
  it("paints a temporary negative-id plant, then swaps it for the detail the server returns", async () => {
    route({ mine: () => page([item(1, { plant_name: "Existing" })]) });
    const store = await newStore();
    await store.ensureMine();
    const gate = deferred<APIPlantDetail>();
    vi.mocked(ApiUtils.post).mockReturnValue(gate.promise as never);

    const pending = store.addPlant({
      name: "New",
      species: "Ficus",
      substrateId: 5,
      isPublic: true,
    });
    await vi.waitFor(() => expect(store.personalPlants).toHaveLength(2));
    const painted = store.personalPlants[1];
    expect(painted.id).toBeLessThan(0);
    expect(painted).toMatchObject({
      name: "New",
      userId: 1,
      speciesName: "Ficus",
      substrate: { id: 5, name: "Aroid Mix" },
      searchText: "new\nficus",
    });
    expect(painted.watering).toEqual({
      lastWateredAt: null,
      lastFertilizedAt: null,
      avgIntervalDays: null,
    });

    gate.resolve(apiPlantDetail({ plant_id: 42, plant_name: "New", user_id: 1, is_public: true }));
    const created = await pending;

    expect(created.id).toBe(42);
    expect(ids(store.personalPlants)).toEqual([1, 42]);
    expect(store.personalPlants[1]).toBe(created);
    expect(store.public.fetchedAt).toBe(0);
  });

  it("posts the payload with tz_offset and without the image file", async () => {
    route({ mine: () => page([]) });
    const store = await newStore();
    await store.ensureMine();
    vi.mocked(ApiUtils.post).mockResolvedValue(apiPlantDetail({ plant_id: 5 }));
    await store.addPlant({
      name: "N",
      species: "S",
      substrateId: 5,
      image: new File(["x"], "x.png"),
    });
    const [path, body] = vi.mocked(ApiUtils.post).mock.calls[0];
    expect(path).toBe("/plants");
    expect(body).toEqual({
      name: "N",
      species: "S",
      substrateId: 5,
      tz_offset: expect.any(Number),
    });
  });

  it("creates a name-only plant without a substrate lookup or substrateId in the body", async () => {
    route({ mine: () => page([]) });
    const store = await newStore();
    await store.ensureMine();
    const lookup = vi.spyOn(store, "substrateName");
    vi.mocked(ApiUtils.post).mockResolvedValue(
      apiPlantDetail({ plant_id: 3, species_name: null, substrate: null }),
    );
    const created = await store.addPlant({ name: "Solo", species: "", substrateId: null });
    expect(lookup).not.toHaveBeenCalled();
    expect(vi.mocked(ApiUtils.post).mock.calls[0][1]).toEqual({
      name: "Solo",
      species: "",
      tz_offset: expect.any(Number),
    });
    expect(created).toMatchObject({ id: 3, speciesName: null, substrate: null });
  });

  it("rolls back only the optimistic plant when the request fails", async () => {
    route({ mine: () => page([item(1)]) });
    const store = await newStore();
    await store.ensureMine();
    const before = store.personalPlants;
    vi.mocked(ApiUtils.post).mockRejectedValue(new Error("boom"));
    await expect(store.addPlant({ name: "Nope", substrateId: null })).rejects.toThrow("boom");
    expect(store.personalPlants).toBe(before);
  });
});

describe("editPlant (optimistic)", () => {
  it("keeps the position, sends tz_offset and merges the detail into every list", async () => {
    route({
      mine: () => page([item(1), item(2, { is_public: true })]),
      public: () => page([item(2, { is_public: true, watering: null })]),
    });
    const store = await newStore();
    await store.ensureMine();
    await store.ensurePublic();
    const gate = deferred<APIPlantDetail>();
    vi.mocked(ApiUtils.patch).mockReturnValue(gate.promise as never);

    const pending = store.editPlant(2, { name: "Renamed", species: "  Ficus " });
    await vi.waitFor(() => expect(store.personalPlants[1].name).toBe("Renamed"));
    expect(ids(store.personalPlants)).toEqual([1, 2]);
    expect(store.personalPlants[1].speciesName).toBe("Ficus");
    expect(store.personalPlants[1].searchText).toBe("renamed\nficus");

    gate.resolve(
      apiPlantDetail({ plant_id: 2, plant_name: "Renamed", is_public: true, user_id: 1 }),
    );
    const updated = await pending;

    const [path, body] = vi.mocked(ApiUtils.patch).mock.calls[0];
    expect(path).toBe("/plants/2");
    expect(body).toMatchObject({ name: "Renamed", tz_offset: expect.any(Number) });
    expect(store.personalPlants[1]).toBe(updated);
    expect(store.publicPlants[0]).toBe(updated);
    expect(store.public.firstPage?.items[0]).toBe(updated);
  });

  it("removes a plant that became private from the public list", async () => {
    route({
      mine: () => page([item(2, { is_public: true })]),
      public: () =>
        page([
          item(2, { is_public: true, watering: null }),
          item(9, { user_id: 7, watering: null }),
        ]),
    });
    const store = await newStore();
    await store.ensureMine();
    await store.ensurePublic();
    vi.mocked(ApiUtils.patch).mockResolvedValue(
      apiPlantDetail({ plant_id: 2, is_public: false, user_id: 1 }),
    );
    await store.editPlant(2, { isPublic: false });
    expect(ids(store.publicPlants)).toEqual([9]);
    expect(ids(store.public.firstPage!.items)).toEqual([9]);
  });

  it("clears the substrate optimistically and restores the plant when the request fails", async () => {
    route({ mine: () => page([item(1)]) });
    const store = await newStore();
    await store.ensureMine();
    const before = store.personalPlants;
    vi.mocked(ApiUtils.patch).mockRejectedValue(new Error("boom"));
    await expect(store.editPlant(1, { substrateId: null })).rejects.toThrow("boom");
    expect(store.personalPlants).toBe(before);
    expect(store.personalPlants[0].substrate).toEqual({ id: 5, name: "Aroid Mix" });
  });
});

describe("deletePlant (optimistic)", () => {
  it("removes the plant from every list at once and clears its watering cache after the server confirms", async () => {
    route({
      mine: () => page([item(1, { is_public: true }), item(2)]),
      public: () => page([item(1, { is_public: true, watering: null })]),
    });
    const store = await newStore();
    await store.ensureMine();
    await store.ensurePublic();
    const gate = deferred<void>();
    vi.mocked(ApiUtils.delete).mockReturnValue(gate.promise as never);
    const dropPlant = vi.spyOn(useWateringStore(), "dropPlant");

    const pending = store.deletePlant(1);
    await vi.waitFor(() => expect(ids(store.personalPlants)).toEqual([2]));
    expect(dropPlant).not.toHaveBeenCalled();

    gate.resolve();
    await pending;
    expect(ApiUtils.delete).toHaveBeenCalledWith("/plants/1");
    expect(dropPlant).toHaveBeenCalledWith(1);
    expect(store.publicPlants).toEqual([]);
    expect(store.public.firstPage?.items).toEqual([]);
  });

  it("re-inserts the plant at its original position and keeps the watering cache on failure", async () => {
    route({ mine: () => page([item(1), item(2), item(3)]) });
    const store = await newStore();
    await store.ensureMine();
    vi.mocked(ApiUtils.delete).mockRejectedValue(new Error("404"));
    const dropPlant = vi.spyOn(useWateringStore(), "dropPlant");
    await expect(store.deletePlant(2)).rejects.toThrow("404");
    expect(ids(store.personalPlants)).toEqual([1, 2, 3]);
    expect(dropPlant).not.toHaveBeenCalled();
  });
});

describe("uploadPlantImage", () => {
  it("uploads through ImageService, then refreshes just this plant", async () => {
    route({
      mine: () => page([item(1), item(2)]),
      one: (id) => apiPlantDetail({ plant_id: id, user_id: 1, plant_name: "Fresh" }),
    });
    const store = await newStore();
    await store.ensureMine();
    const file = new File(["x"], "x.png");
    await store.uploadPlantImage(1, file, "2024-06-01");
    expect(ImageService.uploadImage).toHaveBeenCalledWith(file, "plant", 1, "2024-06-01");
    expect(requested().at(-1)!.pathname).toBe("/plants/1");
    expect(ids(store.personalPlants)).toEqual([1, 2]);
    expect(store.personalPlants[0].name).toBe("Fresh");
    expect(store.personalPlants[0].images).toHaveLength(1);
  });
});

describe("persistence", () => {
  it("stores the owned list under plants_mine, not plants_all", async () => {
    vi.useFakeTimers();
    route({ mine: () => page([item(1)]) });
    const store = await newStore();
    await store.ensureMine();
    await vi.advanceTimersByTimeAsync(500);
    const stored = memoryStore.get("plants_mine") as {
      data: { items: PlantView[]; fetchedAt: number };
      timestamp: number;
    };
    expect(stored.data.items).toHaveLength(1);
    expect(stored.timestamp).toBe(store.mine.fetchedAt);
    expect(memoryStore.has("plants_all")).toBe(false);
  });

  it("hydrates a fresh snapshot instead of calling the API", async () => {
    memoryStore.set("plants_mine", {
      data: {
        items: [{ id: 3, userId: 1, name: "Cached", searchText: "cached" }],
        nextCursor: null,
        total: 1,
        fetchedAt: Date.now(),
      },
      timestamp: Date.now(),
      keepOnClear: false,
    });
    const store = await newStore();
    await store.ensureMine();
    expect(ApiUtils.get).not.toHaveBeenCalled();
    expect(ids(store.personalPlants)).toEqual([3]);
    expect(store.mine.status).toBe("ready");
    expect(Object.isFrozen(store.personalPlants[0])).toBe(true);
  });

  it("ignores an expired snapshot and fetches", async () => {
    memoryStore.set("plants_mine", {
      data: { items: [{ id: 3 }], nextCursor: null, total: 1, fetchedAt: 1 },
      timestamp: Date.now() - 1000 * 60 * 60 * 24 * 30,
    });
    route({ mine: () => page([item(8)]) });
    const store = await newStore();
    await store.ensureMine();
    expect(ids(store.personalPlants)).toEqual([8]);
  });

  it("writes nothing back after a reset", async () => {
    vi.useFakeTimers();
    route({ mine: () => page([item(1)]) });
    const store = await newStore();
    await store.ensureMine();
    store.$reset();
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.has("plants_mine")).toBe(false);
    expect(store.personalPlants).toEqual([]);
    expect(store.mine.status).toBe("idle");
  });
});

describe("copy-on-write lists", () => {
  it("holds frozen items in raw arrays that Vue does not wrap", async () => {
    route({ mine: () => page([item(1)]), public: () => page([item(2, { watering: null })]) });
    const store = await newStore();
    await store.ensureMine();
    await store.ensurePublic();
    for (const list of [store.personalPlants, store.publicPlants]) {
      expect(isProxy(list)).toBe(false);
      expect(Object.isFrozen(list[0])).toBe(true);
    }
  });

  it("replaces the array on every update and leaves the previous one untouched", async () => {
    route({ mine: () => page([item(1), item(2)]) });
    const store = await newStore();
    await store.ensureMine();
    const first = store.personalPlants;
    const snapshot = [...first];

    vi.mocked(ApiUtils.get).mockResolvedValue(
      apiPlantDetail({ plant_id: 2, user_id: 1, plant_name: "Two" }),
    );
    await store.fetchOne(2);

    expect(store.personalPlants).not.toBe(first);
    expect([...first]).toEqual(snapshot);
    expect(store.byId(2)?.name).toBe("Two");
  });

  it("looks plants up through an id index instead of scanning the list", async () => {
    route({ mine: () => page(Array.from({ length: 50 }, (_, i) => item(i + 1))) });
    const store = await newStore();
    await store.ensureMine();
    store.byId(1);
    const find = vi.spyOn(Array.prototype, "find");
    const findIndex = vi.spyOn(Array.prototype, "findIndex");
    expect(store.byId(37)?.id).toBe(37);
    expect(find).not.toHaveBeenCalled();
    expect(findIndex).not.toHaveBeenCalled();
  });
});
