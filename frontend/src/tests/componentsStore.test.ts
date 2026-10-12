/**
 * Tests for the components store: the paged catalogue, details by id, the
 * fineness levels and the admin mutations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isProxy } from "vue";
import {
  apiComponentListItem,
  apiImageDto,
  createInstalledPinia,
  envelope,
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
  put: vi.fn(),
  delete: vi.fn(),
  isApiError: () => false,
  configureAuth: vi.fn(),
}));
vi.mock("@/utils/apiUtils", () => ({ default: api }));

import ImageService from "@/services/ImageService";
import storageService from "@/services/general/StorageService";
import { epoch } from "@/stores/resource";
import { useComponentsStore } from "@/stores/components";
import { useSubstratesStore } from "@/stores/substrates";

const page = (items: APIComponentListItem[], next: string | null = null) =>
  envelope(items, next, items.length).data;

const item = (id: number, name = `Component ${id}`) => apiComponentListItem({ id, name });

const detail = (
  overrides: Partial<APIComponentListItem> & { images?: APIImageDTO[] } = {},
): APIComponentDetail => ({ ...apiComponentListItem(overrides), images: overrides.images ?? [] });

const newStore = async () => {
  await createInstalledPinia();
  return useComponentsStore();
};

const ids = (store: ReturnType<typeof useComponentsStore>) => store.items.map((c) => c.id);

const urlsOf = (): string[] => api.get.mock.calls.map(([url]) => String(url));

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reading the catalogue", () => {
  it("loads it once through the paged endpoint in name order", async () => {
    api.get.mockResolvedValue(page([item(1, "Perlite"), item(2, "Bark")]));
    const store = await newStore();
    await store.ensureLoaded();
    await store.ensureLoaded();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/components?limit=100&sort=name");
    expect(store.items[0]).toMatchObject({ id: 1, name: "Perlite", fineness: "Fine" });
    expect(store.status).toBe("ready");
  });

  it("follows the cursor until the catalogue is complete and commits once", async () => {
    api.get.mockImplementation(async (url: string) =>
      url.includes("cursor=c2") ? page([item(3)]) : page([item(1), item(2)], "c2"),
    );
    const store = await newStore();
    await store.ensureLoaded();
    expect(urlsOf()).toEqual([
      "/components?limit=100&sort=name",
      "/components?limit=100&cursor=c2&sort=name",
    ]);
    expect(ids(store)).toEqual([1, 2, 3]);
  });

  it("holds frozen list views without images", async () => {
    api.get.mockResolvedValue(page([item(1)]));
    const store = await newStore();
    await store.ensureLoaded();
    expect(isProxy(store.items)).toBe(false);
    expect(Object.isFrozen(store.items[0])).toBe(true);
    expect(store.items[0].images).toBeUndefined();
  });

  it("loads fineness levels once", async () => {
    api.get.mockResolvedValue([{ fineness_id: 1, fineness_name: "coarse" }]);
    const store = await newStore();
    await store.ensureFinenessLevels();
    await store.ensureFinenessLevels();
    expect(store.finenessLevels).toEqual([{ fineness_id: 1, fineness_name: "coarse" }]);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/components/fineness-levels");
  });
});

describe("selectableComponents", () => {
  it("sorts the catalogue by name once and keeps the same array until the catalogue changes", async () => {
    api.get.mockResolvedValue(
      page([item(1, "perlite"), item(2, "Bark"), item(3, "Coco coir"), item(4, "Agave grit")]),
    );
    const store = await newStore();
    await store.ensureLoaded();
    const localeCompare = vi.spyOn(String.prototype, "localeCompare");
    try {
      const first = store.selectableComponents;
      expect(first.map((c) => c.name)).toEqual(["Agave grit", "Bark", "Coco coir", "perlite"]);
      expect(store.selectableComponents).toBe(first);
      expect(localeCompare).not.toHaveBeenCalled();
    } finally {
      localeCompare.mockRestore();
    }
    const before = store.selectableComponents;
    api.post.mockResolvedValue(detail({ id: 5, name: "Zeolite" }));
    await store.addComponent({ name: "Zeolite", finenessId: 1 } as AddComponent);
    expect(store.selectableComponents).not.toBe(before);
    expect(store.selectableComponents.at(-1)?.name).toBe("Zeolite");
  });

  it("carries a resolved label and lowercase search text", async () => {
    api.get.mockResolvedValue(page([apiComponentListItem({ id: 1, name: "Perlite" })]));
    const store = await newStore();
    await store.ensureLoaded();
    expect(store.selectableComponents[0]).toEqual({
      id: 1,
      name: "Perlite",
      fineness: "Fine",
      searchText: "perlite\nfine",
    });
    expect(Object.isFrozen(store.selectableComponents[0])).toBe(true);
  });
});

describe("details by id", () => {
  it("fetches only the component and never the catalogue or the substrates list", async () => {
    api.get.mockResolvedValue(detail({ id: 9, name: "Pumice", images: [apiImageDto()] }));
    const store = await newStore();
    const substrates = useSubstratesStore();
    const ensureSubstrates = vi.spyOn(substrates, "ensureLoaded");

    const component = await store.getComponent(9);

    expect(urlsOf()).toEqual(["/components/9"]);
    expect(ensureSubstrates).not.toHaveBeenCalled();
    expect(component.name).toBe("Pumice");
    expect(component.images).toHaveLength(1);
    expect(store.status).toBe("idle");
    expect(store.items).toHaveLength(0);
  });

  it("serves a cached detail until forced and prefers it over the catalogue entry", async () => {
    api.get.mockResolvedValue(page([item(9, "Pumice")]));
    const store = await newStore();
    await store.ensureLoaded();
    expect(store.byId(9)?.images).toBeUndefined();

    api.get.mockResolvedValue(detail({ id: 9, name: "Pumice", images: [apiImageDto()] }));
    await store.getComponent(9);
    await store.getComponent(9);
    expect(urlsOf().filter((url) => url === "/components/9")).toHaveLength(1);
    expect(store.byId(9)?.images).toHaveLength(1);

    api.get.mockResolvedValue(detail({ id: 9, name: "Pumice 2" }));
    await store.getComponent(9, true);
    expect(store.byId(9)?.name).toBe("Pumice 2");
    expect(store.items[0].name).toBe("Pumice 2");
  });

  it("does not add a fetched detail to a catalogue that is not loaded", async () => {
    api.get.mockResolvedValue(detail({ id: 9 }));
    const store = await newStore();
    await store.getComponent(9);
    expect(store.items).toHaveLength(0);
    expect(store.byId(9)?.id).toBe(9);
  });

  it("drops a detail that arrives after the session ended", async () => {
    let resolve!: (value: APIComponentDetail) => void;
    api.get.mockReturnValue(new Promise((done) => (resolve = done)));
    const store = await newStore();
    const pending = store.getComponent(9);
    epoch.abortAll();
    resolve(detail({ id: 9 }));
    await pending;
    expect(store.byId(9)).toBeUndefined();
  });
});

describe("substrates that use a component", () => {
  it("merges own and public results, removes duplicates and sorts by name", async () => {
    api.get.mockImplementation(async (url: string) => {
      const substrate = (id: number, name: string, isPublic: boolean) => ({
        id,
        name,
        is_public: isPublic,
      });
      return url.includes("scope=mine")
        ? envelope([substrate(2, "Beta", true), substrate(1, "alpha", false)]).data
        : envelope([substrate(2, "Beta", true), substrate(3, "Gamma", true)]).data;
    });
    const store = await newStore();
    await store.loadUsedIn(5);
    expect(urlsOf().every((url) => url.includes("component_id=5"))).toBe(true);
    expect(urlsOf().some((url) => url.includes("scope=mine"))).toBe(true);
    expect(urlsOf().some((url) => url.includes("scope=public"))).toBe(true);
    expect(store.usedIn[5].map((s) => s.name)).toEqual(["alpha", "Beta", "Gamma"]);
    expect(store.usedIn[5].find((s) => s.id === 1)?.isPublic).toBe(false);
  });
});

describe("admin mutations", () => {
  it("adds a component with the fineness id and upserts the server's version", async () => {
    api.get.mockResolvedValue(page([item(1)]));
    const store = await newStore();
    await store.ensureLoaded();
    api.post.mockResolvedValue(detail({ id: 2, name: "Grit" }));
    const created = await store.addComponent({ name: "Grit", finenessId: 3 } as AddComponent);
    expect(api.post).toHaveBeenCalledWith("/components", { name: "Grit", fineness: 3 });
    expect(created.id).toBe(2);
    expect(ids(store)).toEqual([1, 2]);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("edits a component with PUT and replaces it in place", async () => {
    api.get.mockResolvedValue(page([item(1), item(2)]));
    const store = await newStore();
    await store.ensureLoaded();
    api.put.mockResolvedValue(detail({ id: 1, name: "Renamed" }));
    await store.editComponent(1, { name: "Renamed" } as EditComponent);
    expect(api.put).toHaveBeenCalledWith("/components/1", { name: "Renamed" });
    expect(store.items.map((c) => c.name)).toEqual(["Renamed", "Component 2"]);
  });

  it("removes a deleted component after the server confirms and resolves despite the empty 204 body", async () => {
    api.get.mockResolvedValue(page([item(1), item(2)]));
    const store = await newStore();
    await store.ensureLoaded();
    api.delete.mockResolvedValue(null);
    await expect(store.deleteComponent(1)).resolves.toBeUndefined();
    expect(ids(store)).toEqual([2]);
  });

  it("keeps the list when a mutation fails", async () => {
    api.get.mockResolvedValue(page([item(1)]));
    const store = await newStore();
    await store.ensureLoaded();
    api.delete.mockRejectedValue(new Error("403"));
    await expect(store.deleteComponent(1)).rejects.toThrow("403");
    expect(ids(store)).toEqual([1]);
  });

  it("uploads an image, then refreshes just this component", async () => {
    api.get.mockImplementation(async (url: string) =>
      url.startsWith("/components?")
        ? page([item(1)])
        : detail({ id: 1, cover: apiImageDto({ url: "http://img/c.webp" }) }),
    );
    const store = await newStore();
    await store.ensureLoaded();
    const file = new File(["x"], "x.png");
    await store.uploadComponentImage(1, file);
    expect(ImageService.uploadImage).toHaveBeenCalledWith(file, "component", 1);
    expect(store.items[0].cover?.url).toBe("http://img/c.webp");
  });
});

describe("invalidating the substrates", () => {
  const withFreshSubstrates = async () => {
    api.get.mockResolvedValue(page([item(1), item(2)]));
    const store = await newStore();
    await store.ensureLoaded();
    const substrates = useSubstratesStore();
    substrates.fetchedAt = Date.now();
    substrates.status = "ready";
    return { store, substrates };
  };

  it("marks the substrates stale after an edit", async () => {
    const { store, substrates } = await withFreshSubstrates();
    expect(substrates.isStale).toBe(false);
    api.put.mockResolvedValue(detail({ id: 1, name: "Renamed" }));
    await store.editComponent(1, { name: "Renamed" } as EditComponent);
    expect(substrates.isStale).toBe(true);
  });

  it("marks the substrates stale after a delete", async () => {
    const { store, substrates } = await withFreshSubstrates();
    api.delete.mockResolvedValue(null);
    await store.deleteComponent(1);
    expect(substrates.isStale).toBe(true);
  });

  it("leaves the substrates alone when the write fails or a component is added", async () => {
    const { store, substrates } = await withFreshSubstrates();
    api.put.mockRejectedValue(new Error("500"));
    await expect(store.editComponent(1, { name: "x" } as EditComponent)).rejects.toThrow();
    api.delete.mockRejectedValue(new Error("500"));
    await expect(store.deleteComponent(1)).rejects.toThrow();
    api.post.mockResolvedValue(detail({ id: 3 }));
    await store.addComponent({ name: "New", finenessId: 1 } as AddComponent);
    expect(substrates.isStale).toBe(false);
  });
});

describe("a session that ends mid load", () => {
  it("drops a catalogue that arrives after the logout", async () => {
    let resolve!: (value: unknown) => void;
    api.get.mockReturnValue(new Promise((done) => (resolve = done)));
    const store = await newStore();
    const loading = store.ensureLoaded();
    epoch.abortAll();
    resolve(page([item(1)]));
    await loading;
    expect(store.items).toHaveLength(0);
    expect(store.status).not.toBe("ready");
    expect(store.fetchedAt).toBeNull();
  });

  it("swallows a catalogue failure that arrives after the logout", async () => {
    let reject!: (error: Error) => void;
    api.get.mockReturnValue(new Promise((_, fail) => (reject = fail)));
    const store = await newStore();
    const loading = store.ensureLoaded();
    epoch.abortAll();
    reject(new Error("aborted"));
    await expect(loading).resolves.toBeUndefined();
    expect(store.status).not.toBe("error");
  });

  it("does not commit fineness levels that arrive after the logout", async () => {
    let resolve!: (value: unknown) => void;
    api.get.mockReturnValue(new Promise((done) => (resolve = done)));
    const store = await newStore();
    const loading = store.ensureFinenessLevels();
    epoch.abortAll();
    resolve([{ fineness_id: 1, fineness_name: "coarse" }]);
    await loading;
    expect(store.finenessLevels).toEqual([]);
  });
});

describe("persistence", () => {
  const snapshot = (items: unknown[], fetchedAt: number) => ({
    data: { items, nextCursor: null, total: items.length, fetchedAt },
    timestamp: fetchedAt,
  });
  const cachedView = (id: number, name: string) => ({
    id,
    name,
    finenessId: 1,
    fineness: "Fine",
    cover: null,
    searchText: `${name.toLowerCase()}\nfine`,
  });

  it("hydrates a fresh catalogue without a request, and the fineness levels from their own key", async () => {
    memoryStore.set("components_catalogue", snapshot([cachedView(4, "Cached")], Date.now()));
    memoryStore.set("components_fineness_levels", {
      data: [{ fineness_id: 1, fineness_name: "coarse" }],
      timestamp: Date.now(),
    });
    const store = await newStore();
    await store.ensureLoaded();
    await store.ensureFinenessLevels();
    expect(api.get).not.toHaveBeenCalled();
    expect(ids(store)).toEqual([4]);
    expect(Object.isFrozen(store.items[0])).toBe(true);
    expect(store.finenessLevels).toHaveLength(1);
  });

  it("shows a stale snapshot first, then replaces it with the refreshed catalogue", async () => {
    const dayAgo = Date.now() - 25 * 60 * 60 * 1000;
    memoryStore.set("components_catalogue", snapshot([cachedView(4, "Old")], dayAgo));
    let resolve!: (value: unknown) => void;
    api.get.mockReturnValue(new Promise((done) => (resolve = done)));
    const store = await newStore();

    const loading = store.ensureLoaded();
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(ids(store)).toEqual([4]);

    resolve(page([item(7, "Fresh")]));
    await loading;
    expect(ids(store)).toEqual([7]);
    expect(store.isStale).toBe(false);
  });

  it("does not read the retired catalogue key", async () => {
    memoryStore.set("components_all", {
      data: [{ id: 4, name: "Legacy", fineness: "fine" }],
      timestamp: Date.now(),
    });
    api.get.mockResolvedValue(page([item(1)]));
    const store = await newStore();
    await store.ensureLoaded();
    expect(ids(store)).toEqual([1]);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});

const writesOf = (key: string): number =>
  vi.mocked(storageService.set).mock.calls.filter(([stored]) => stored === key).length;

describe("copy-on-write list", () => {
  it("replaces the raw array on upsert and delete and shares untouched items", async () => {
    api.get.mockResolvedValue(page([item(1, "Old"), item(2)]));
    const store = await newStore();
    await store.ensureLoaded();
    expect(isProxy(store.items)).toBe(false);

    const loaded = store.items;
    const untouched = loaded[1];
    api.put.mockResolvedValue(detail({ id: 1, name: "New" }));
    await store.editComponent(1, { name: "New" } as EditComponent);
    const edited = store.items;
    expect(edited).not.toBe(loaded);
    expect(loaded[0].name).toBe("Old");
    expect(edited[0].name).toBe("New");
    expect(edited[1]).toBe(untouched);

    api.delete.mockResolvedValue(null);
    await store.deleteComponent(2);
    expect(edited).toHaveLength(2);
    expect(ids(store)).toEqual([1]);
  });

  it("looks components up through an id index instead of scanning the list", async () => {
    api.get.mockResolvedValue(page(Array.from({ length: 100 }, (_, i) => item(i + 1))));
    const store = await newStore();
    await store.ensureLoaded();
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

describe("persisted writes", () => {
  it("writes the catalogue once per fetch and not for actions that leave it unchanged", async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValue(page([item(1)]));
    const store = await newStore();

    await store.ensureLoaded();
    await vi.advanceTimersByTimeAsync(500);
    expect(writesOf("components_catalogue")).toBe(1);

    await store.ensureLoaded();
    api.get.mockRejectedValue(new Error("offline"));
    await expect(store.ensureLoaded({ force: true })).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(500);
    expect(writesOf("components_catalogue")).toBe(1);
  });

  it("writes the fineness levels once and keeps them apart from the catalogue", async () => {
    vi.useFakeTimers();
    api.get.mockImplementation(async (url: string) =>
      url.startsWith("/components?")
        ? page([item(1)])
        : [{ fineness_id: 1, fineness_name: "coarse" }],
    );
    const store = await newStore();
    await store.ensureLoaded();
    await vi.advanceTimersByTimeAsync(500);
    await store.ensureFinenessLevels();
    await vi.advanceTimersByTimeAsync(500);
    expect(writesOf("components_catalogue")).toBe(1);
    expect(writesOf("components_fineness_levels")).toBe(1);
  });
});
