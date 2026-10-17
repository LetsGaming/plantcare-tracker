/**
 * Tests for the substrates store on the paged summary contract: the owner's
 * list loaded whole, the public list paged and searched on the server, details
 * by id, one-request writes and the "used in" lookup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isProxy } from "vue";
import {
  apiSubstrateDetail,
  apiSubstrateListItem,
  createInstalledPinia,
  envelope,
  fakeJwt,
  memoryStore,
  resetStore,
} from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);
vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);
vi.mock("@/services/ImageService", () => ({ default: { uploadImage: vi.fn(async () => ({})) } }));

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  isApiError: () => false,
  configureAuth: vi.fn(),
}));
vi.mock("@/utils/apiUtils", () => ({ default: api }));

import ImageService from "@/services/ImageService";
import storageService from "@/services/general/StorageService";
import { epoch } from "@/stores/resource";
import { useSessionStore } from "@/stores/session";
import { useSubstratesStore } from "@/stores/substrates";
import { usePlantsStore } from "@/stores/plants";

const item = (id: number, overrides: Partial<APISubstrateListItem> = {}) =>
  apiSubstrateListItem({ id, name: `Mix ${id}`, user_id: 1, is_public: false, ...overrides });

const detail = (id: number, overrides: Partial<APISubstrateDetail> = {}) =>
  apiSubstrateDetail({
    substrate_id: id,
    substrate_name: `Mix ${id}`,
    substrate_user_id: 1,
    is_public: false,
    ...overrides,
  });

const part = (id: number, parts: number): APISubstrateComponent => ({
  component_id: id,
  component_name: `C${id}`,
  component_fineness: "Coarse",
  component_parts: parts,
});

const page = (items: APISubstrateListItem[], next: string | null = null, total?: number) =>
  envelope(items, next, total).data;

const newStore = async (
  claims: Record<string, unknown> = { id: 1, username: "alice", role: "user" },
) => {
  await createInstalledPinia();
  await useSessionStore().storeToken(fakeJwt(claims));
  return useSubstratesStore();
};

const ids = (list: readonly SubstrateView[]) => list.map((s) => s.id);
const urlsOf = (): string[] => api.get.mock.calls.map(([url]) => String(url));
const paramsOf = (url: string) => new URL(url, "http://test").searchParams;

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("own substrates", () => {
  it("loads scope=mine in pages of at most 100 and commits once", async () => {
    api.get
      .mockResolvedValueOnce(page([item(1), item(2)], "c1"))
      .mockResolvedValueOnce(page([item(3)]));
    const store = await newStore();
    await store.ensureMine();
    await store.ensureMine();

    expect(urlsOf()).toHaveLength(2);
    for (const url of urlsOf()) {
      const params = paramsOf(url);
      expect(params.get("scope")).toBe("mine");
      expect(Number(params.get("limit"))).toBeLessThanOrEqual(100);
    }
    expect(paramsOf(urlsOf()[1]).get("cursor")).toBe("c1");
    expect(ids(store.personalSubstrates)).toEqual([1, 2, 3]);
    expect(store.personalSubstrates.every((s) => s.components === null)).toBe(true);
  });

  it("shares one run between concurrent callers and refetches when forced", async () => {
    api.get.mockResolvedValue(page([item(1)]));
    const store = await newStore();
    await Promise.all([store.ensureLoaded(), store.ensureMine()]);
    expect(api.get).toHaveBeenCalledTimes(1);
    await store.ensureMine({ force: true });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("asks nothing for a guest", async () => {
    const store = await newStore({ id: 0, username: "guest", role: "guest" });
    await store.ensureMine();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("drops a list that arrives after the logout", async () => {
    let resolve!: (value: unknown) => void;
    api.get.mockReturnValue(new Promise((done) => (resolve = done)));
    const store = await newStore();
    const loading = store.ensureMine();
    epoch.abortAll();
    resolve(page([item(1)]));
    await loading;
    expect(store.mine.items).toHaveLength(0);
  });

  it("swallows the failure of a load from an ended session", async () => {
    let reject!: (reason: unknown) => void;
    api.get.mockReturnValue(new Promise((_, fail) => (reject = fail)));
    const store = await newStore();
    const loading = store.ensureMine();
    epoch.abortAll();
    reject(new Error("aborted"));
    await expect(loading).resolves.toBeUndefined();
  });
});

describe("public substrates", () => {
  it("loads the first page, then the next one with the cursor", async () => {
    api.get
      .mockResolvedValueOnce(page([item(10, { is_public: true })], "c1", 40))
      .mockResolvedValueOnce(page([item(11, { is_public: true })]));
    const store = await newStore();
    await store.ensurePublic();
    expect(paramsOf(urlsOf()[0]).get("scope")).toBe("public");
    expect(Number(paramsOf(urlsOf()[0]).get("limit"))).toBeLessThanOrEqual(100);
    expect(store.public.total).toBe(40);

    await store.loadMorePublic();
    expect(paramsOf(urlsOf()[1]).get("cursor")).toBe("c1");
    expect(ids(store.publicSubstrates)).toEqual([10, 11]);
  });

  it("searches on the server, resets paging and treats the same query as a no-op", async () => {
    api.get
      .mockResolvedValueOnce(page([item(10, { is_public: true })], "c1"))
      .mockResolvedValueOnce(page([item(12, { is_public: true, name: "Bark" })]));
    const store = await newStore();
    await store.ensurePublic();

    await store.setPublicQuery("bark");
    await store.setPublicQuery("bark");

    expect(api.get).toHaveBeenCalledTimes(2);
    const params = paramsOf(urlsOf()[1]);
    expect(params.get("q")).toBe("bark");
    expect(params.get("cursor")).toBeNull();
    expect(ids(store.publicSubstrates)).toEqual([12]);
  });

  it("persists only the default first page", async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValue(page([item(10, { is_public: true })]));
    const store = await newStore();
    await store.ensurePublic();
    await vi.advanceTimersByTimeAsync(500);
    const writes = () =>
      vi.mocked(storageService.set).mock.calls.filter(([key]) => key === "substrates_public")
        .length;
    expect(writes()).toBe(1);

    await store.setPublicQuery("bark");
    await vi.advanceTimersByTimeAsync(500);
    expect(writes()).toBe(1);
  });
});

describe("details by id", () => {
  it("fetches only the substrate and never the list or the component catalogue", async () => {
    api.get.mockResolvedValue(detail(9, { images: [] }));
    const store = await newStore();
    const substrate = await store.getSubstrate(9);

    expect(urlsOf()).toEqual(["/substrates/9"]);
    expect(substrate.components).toHaveLength(2);
    expect(store.mine.status).toBe("idle");
    expect(store.detailOf(9)).toBe(substrate);

    await store.getSubstrate(9);
    expect(api.get).toHaveBeenCalledTimes(1);
    await store.getSubstrate(9, true);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("keeps the light entry of a listed substrate in step with its detail", async () => {
    api.get
      .mockResolvedValueOnce(page([item(1)]))
      .mockResolvedValueOnce(detail(1, { substrate_name: "Renamed" }));
    const store = await newStore();
    await store.ensureMine();
    await store.getSubstrate(1);
    expect(store.mine.items[0].name).toBe("Renamed");
    expect(store.mine.items[0].components).toBeNull();
    expect(store.detailOf(1)?.components).toHaveLength(2);
  });

  it("drops a detail that arrives after the logout", async () => {
    let resolve!: (value: unknown) => void;
    api.get.mockReturnValue(new Promise((done) => (resolve = done)));
    const store = await newStore();
    const pending = store.fetchOne(9);
    epoch.abortAll();
    resolve(detail(9));
    await pending;
    expect(store.detailOf(9)).toBeUndefined();
  });
});

describe("writes", () => {
  it("creates a substrate with its mix in a single request", async () => {
    api.post.mockResolvedValue(detail(5, { components: [part(1, 2)] }));
    const store = await newStore();
    const created = await store.addSubstrate({
      name: "Mix",
      isPublic: false,
      components: [{ componentId: 1, parts: 2 }],
    });

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/substrates", {
      name: "Mix",
      isPublic: false,
      components: [{ componentId: 1, parts: 2 }],
    });
    expect(api.patch).not.toHaveBeenCalled();
    expect(created.id).toBe(5);
    expect(ids(store.personalSubstrates)).toEqual([5]);
    expect(store.detailOf(5)?.components).toHaveLength(1);
    expect(api.get).not.toHaveBeenCalled();
  });

  it("asks the public list to refresh after a public substrate is created", async () => {
    api.post.mockResolvedValue(detail(5, { is_public: true }));
    const store = await newStore();
    await store.addSubstrate({ name: "Mix", isPublic: true });
    expect(store.isPublicStale).toBe(true);
  });

  it("sends the full remaining mix in one request and the removal persists", async () => {
    api.get.mockResolvedValueOnce(page([item(1)]));
    const store = await newStore();
    await store.ensureMine();
    api.patch.mockResolvedValue(detail(1, { components: [part(1, 1), part(3, 3)] }));

    const edited = await store.editSubstrate(1, {
      name: "Mix 1",
      components: [
        { componentId: 1, parts: 1 },
        { componentId: 3, parts: 3 },
      ],
    });

    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).toHaveBeenCalledWith("/substrates/1", {
      name: "Mix 1",
      components: [
        { componentId: 1, parts: 1 },
        { componentId: 3, parts: 3 },
      ],
    });
    expect(edited.components?.map((c) => c.id)).toEqual([1, 3]);
    expect(store.detailOf(1)?.components?.map((c) => c.id)).toEqual([1, 3]);
    expect(store.mine.items[0].componentCount).toBe(2);
  });

  it("moves a substrate made private out of the public list", async () => {
    api.get.mockResolvedValueOnce(page([item(1, { is_public: true })]));
    const store = await newStore();
    await store.ensurePublic();
    api.patch.mockResolvedValue(detail(1, { is_public: false }));
    await store.editSubstrate(1, { isPublic: false });
    expect(store.publicSubstrates).toHaveLength(0);
  });

  it("does not touch the lists when a write fails", async () => {
    api.get.mockResolvedValueOnce(page([item(1)]));
    const store = await newStore();
    await store.ensureMine();
    api.patch.mockRejectedValue(new Error("403"));
    await expect(store.editSubstrate(1, { name: "x" })).rejects.toThrow("403");
    expect(store.mine.items[0].name).toBe("Mix 1");
  });

  it("removes a deleted substrate everywhere after the server confirms", async () => {
    api.get.mockResolvedValueOnce(page([item(1), item(2)]));
    const store = await newStore();
    await store.ensureMine();
    api.delete.mockResolvedValue(null);
    await store.deleteSubstrate(1);
    expect(ids(store.personalSubstrates)).toEqual([2]);
  });

  it("keeps a substrate whose delete failed", async () => {
    api.get.mockResolvedValueOnce(page([item(1)]));
    const store = await newStore();
    await store.ensureMine();
    api.delete.mockRejectedValue(new Error("403"));
    await expect(store.deleteSubstrate(1)).rejects.toThrow("403");
    expect(ids(store.personalSubstrates)).toEqual([1]);
  });

  it("uploads, then refreshes just this substrate", async () => {
    api.get.mockResolvedValue(detail(1));
    const store = await newStore();
    const file = new File(["x"], "x.png");
    await store.uploadSubstrateImage(1, file);
    expect(ImageService.uploadImage).toHaveBeenCalledWith(file, "substrate", 1, undefined);
    expect(urlsOf()).toEqual(["/substrates/1"]);
  });

  it("skips the refresh when asked to", async () => {
    const store = await newStore();
    await store.uploadSubstrateImage(1, new File(["x"], "x.png"), undefined, false);
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe("substrates that use a component", () => {
  it("merges own and public results, removes duplicates and sorts by name", async () => {
    api.get.mockImplementation(async (url: string) => {
      const row = (id: number, name: string, isPublic: boolean) =>
        item(id, { name, is_public: isPublic });
      return url.includes("scope=mine")
        ? page([row(2, "Beta", true), row(1, "alpha", false)])
        : page([row(2, "Beta", true), row(3, "Gamma", true)]);
    });
    const store = await newStore();
    await store.loadUsedByComponent(5);

    expect(urlsOf().every((url) => paramsOf(url).get("component_id") === "5")).toBe(true);
    expect(urlsOf().some((url) => url.includes("scope=mine"))).toBe(true);
    expect(urlsOf().some((url) => url.includes("scope=public"))).toBe(true);
    expect(store.usedByComponent[5].map((s) => s.name)).toEqual(["alpha", "Beta", "Gamma"]);
    expect(store.usedByComponent[5].find((s) => s.id === 1)?.isPublic).toBe(false);
  });

  it("drops a result that arrives after the logout", async () => {
    let resolve!: (value: unknown) => void;
    api.get.mockReturnValue(new Promise((done) => (resolve = done)));
    const store = await newStore();
    const pending = store.loadUsedByComponent(5);
    epoch.abortAll();
    resolve(page([item(1)]));
    await pending;
    expect(store.usedByComponent[5]).toBeUndefined();
  });
});

describe("invalidate", () => {
  it("makes the next load refetch", async () => {
    api.get.mockResolvedValue(page([item(1)]));
    const store = await newStore();
    await store.ensureMine();
    await store.ensureMine();
    expect(api.get).toHaveBeenCalledTimes(1);

    store.invalidate();
    expect(store.isStale).toBe(true);
    await store.ensureMine();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("drops cached details and rewrites the persisted snapshot as expired", async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValue(page([item(1)]));
    const store = await newStore();
    await store.ensureMine();
    await vi.advanceTimersByTimeAsync(500);
    const written = () =>
      vi
        .mocked(storageService.set)
        .mock.calls.filter(([key]) => key === "substrates_mine")
        .map(([, value]) => value as { timestamp: number });
    expect(written()).toHaveLength(1);

    store.invalidate();
    await vi.advanceTimersByTimeAsync(500);
    expect(written()).toHaveLength(2);
    expect(Date.now() - written()[1].timestamp).toBeGreaterThan(24 * 60 * 60 * 1000);
    expect(store.detailOf(1)).toBeUndefined();
  });

  it("does not revive a stored snapshot as fresh after it was invalidated", async () => {
    memoryStore.set("substrates_mine", {
      data: { items: [{ id: 3, name: "Cached" }], nextCursor: null, total: null, fetchedAt: 1 },
      timestamp: Date.now(),
    });
    api.get.mockResolvedValue(page([item(4)]));
    const store = await newStore();
    store.invalidate();
    await store.ensureMine();
    expect(ids(store.personalSubstrates)).toEqual([4]);
  });
});

describe("persistence and structure", () => {
  it("hydrates a fresh own snapshot instead of calling the API", async () => {
    memoryStore.set("substrates_mine", {
      data: {
        items: [Object.freeze({ id: 3, name: "Cached", userId: 1, isPublic: false })],
        nextCursor: null,
        total: null,
        fetchedAt: Date.now(),
      },
      timestamp: Date.now(),
    });
    const store = await newStore();
    await store.ensureMine();
    expect(api.get).not.toHaveBeenCalled();
    expect(ids(store.personalSubstrates)).toEqual([3]);
  });

  it("holds frozen items in raw arrays and looks them up through an id index", async () => {
    api.get.mockResolvedValue(page(Array.from({ length: 100 }, (_, i) => item(i + 1))));
    const store = await newStore();
    await store.ensureMine();
    expect(isProxy(store.mine.items)).toBe(false);
    expect(store.mine.items.every((s) => Object.isFrozen(s))).toBe(true);
    expect(store.byId(1)?.id).toBe(1);

    const find = vi.spyOn(Array.prototype, "find");
    const findIndex = vi.spyOn(Array.prototype, "findIndex");
    try {
      expect(store.byId(100)?.id).toBe(100);
      expect(store.byId(999)).toBeUndefined();
      expect(find).not.toHaveBeenCalled();
      expect(findIndex).not.toHaveBeenCalled();
    } finally {
      find.mockRestore();
      findIndex.mockRestore();
    }
  });
});

describe("detail freshness", () => {
  it("refetches a cached detail once it is older than the cache lifetime", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    api.get.mockResolvedValue(detail(9));
    const store = await newStore();
    await store.getSubstrate(9);
    await store.getSubstrate(9);
    expect(api.get).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 48 * 60 * 60 * 1000);
    await store.getSubstrate(9);
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});

describe("plants follow substrate changes", () => {
  it("renames the substrate on the plants that use it after an edit", async () => {
    api.get.mockResolvedValueOnce(page([item(5)]));
    const store = await newStore();
    await store.ensureMine();
    const plants = usePlantsStore();
    const patch = vi.spyOn(plants, "patchSubstrate");
    api.patch.mockResolvedValue(detail(5, { substrate_name: "Renamed" }));
    await store.editSubstrate(5, { name: "Renamed" });
    expect(patch).toHaveBeenCalledWith(5, "Renamed");
  });

  it("clears the substrate on the plants that use it after a delete", async () => {
    api.get.mockResolvedValueOnce(page([item(5)]));
    const store = await newStore();
    await store.ensureMine();
    const patch = vi.spyOn(usePlantsStore(), "patchSubstrate");
    api.delete.mockResolvedValue(null);
    await store.deleteSubstrate(5);
    expect(patch).toHaveBeenCalledWith(5, null);
  });

  it("does not touch the plants when the delete fails", async () => {
    const store = await newStore();
    const patch = vi.spyOn(usePlantsStore(), "patchSubstrate");
    api.delete.mockRejectedValue(new Error("403"));
    await expect(store.deleteSubstrate(5)).rejects.toThrow("403");
    expect(patch).not.toHaveBeenCalled();
  });
});
