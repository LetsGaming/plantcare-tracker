/**
 * Tests for the substrates store: list loading, the owner/public views and
 * the pessimistic mutations that upsert the server-confirmed substrate.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInstalledPinia, fakeJwt, memoryStore, resetStore } from "./helpers";

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
import { useSessionStore } from "@/stores/session";
import { useSubstratesStore } from "@/stores/substrates";

const apiSubstrate = (overrides: Partial<APISubstrate> = {}): APISubstrate =>
  ({
    substrate_id: 1,
    substrate_user_id: 1,
    substrate_name: "Aroid Mix",
    is_public: false,
    substrate_created_at: 1704067200,
    image_url: null,
    images: [],
    components: [],
    ...overrides,
  }) as APISubstrate;

const newStore = async () => {
  await createInstalledPinia();
  await useSessionStore().storeToken(fakeJwt({ id: 1, username: "alice", role: "user" }));
  return useSubstratesStore();
};

const ids = (list: Substrate[]) => list.map((s) => s.id);

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

describe("reading", () => {
  it("fetches the list once and derives the owner's and the public substrates", async () => {
    api.get.mockResolvedValue([
      apiSubstrate({ substrate_id: 1, substrate_user_id: 1 }),
      apiSubstrate({ substrate_id: 2, substrate_user_id: 9, is_public: true }),
    ]);
    const store = await newStore();
    await store.ensureLoaded();
    await store.ensureLoaded();
    expect(ids(store.privateSubstrates)).toEqual([1]);
    expect(ids(store.publicSubstrates)).toEqual([2]);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("shares one request between concurrent callers and refetches when forced", async () => {
    api.get.mockResolvedValue([apiSubstrate()]);
    const store = await newStore();
    await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);
    expect(api.get).toHaveBeenCalledTimes(1);
    await store.ensureLoaded({ force: true });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("loads a single substrate that is not in the list and upserts it", async () => {
    api.get.mockImplementation(async (url: string) =>
      url === "/substrates"
        ? [apiSubstrate({ substrate_id: 1 })]
        : apiSubstrate({ substrate_id: 77, substrate_name: "Remote" }),
    );
    const store = await newStore();
    const substrate = await store.getSubstrate(77);
    expect(api.get).toHaveBeenCalledWith("/substrates/77");
    expect(substrate.name).toBe("Remote");
    expect(ids(store.items)).toEqual([1, 77]);
  });

  it("serves a known substrate from memory unless forced", async () => {
    api.get.mockResolvedValue([apiSubstrate({ substrate_id: 1 })]);
    const store = await newStore();
    await store.getSubstrate(1);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});

describe("mutations", () => {
  it("creates a substrate and upserts the server response without refetching", async () => {
    api.get.mockResolvedValue([apiSubstrate({ substrate_id: 1 })]);
    const store = await newStore();
    await store.ensureLoaded();
    api.post.mockResolvedValue(apiSubstrate({ substrate_id: 2, substrate_name: "New" }));
    await store.addSubstrate({ name: "New", isPublic: false } as AddSubstrate);
    expect(ids(store.items)).toEqual([1, 2]);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("creates with components in two requests and keeps the final state", async () => {
    api.get.mockResolvedValue([]);
    const store = await newStore();
    await store.ensureLoaded();
    api.post.mockResolvedValueOnce(apiSubstrate({ substrate_id: 5 })).mockResolvedValueOnce(
      apiSubstrate({
        substrate_id: 5,
        components: [
          {
            component_id: 1,
            component_name: "Perlite",
            component_fineness: "coarse",
            component_parts: 2,
          },
        ],
      } as Partial<APISubstrate>),
    );
    const id = await store.addSubstrateWithComponents(
      { name: "Mix", isPublic: false } as AddSubstrate,
      { components: [{ componentId: 1, parts: 2 }] } as AddSubstrateComponents,
    );
    expect(id).toBe(5);
    expect(api.post).toHaveBeenNthCalledWith(2, "/substrates/5/components", {
      components: [{ componentId: 1, parts: 2 }],
    });
    expect(store.items).toHaveLength(1);
    expect(store.items[0].components).toHaveLength(1);
  });

  it("replaces the substrate with the server version after an edit", async () => {
    api.get.mockResolvedValue([apiSubstrate({ substrate_id: 1 })]);
    const store = await newStore();
    await store.ensureLoaded();
    api.patch.mockResolvedValue(apiSubstrate({ substrate_id: 1, substrate_name: "Renamed" }));
    await store.editSubstrate(1, { name: "Renamed" } as EditSubstrate);
    expect(api.patch).toHaveBeenCalledWith("/substrates/1", { name: "Renamed" });
    expect(store.items[0].name).toBe("Renamed");
  });

  it("replaces the component mix through the components endpoint", async () => {
    api.get.mockResolvedValue([apiSubstrate({ substrate_id: 1 })]);
    const store = await newStore();
    await store.ensureLoaded();
    api.patch.mockResolvedValue(apiSubstrate({ substrate_id: 1 }));
    await store.editSubstrateComponents(1, [{ componentId: 2, parts: 3 }]);
    expect(api.patch).toHaveBeenCalledWith("/substrates/1/components", {
      components: [{ componentId: 2, parts: 3 }],
    });
  });

  it("does not touch the list when a mutation fails", async () => {
    api.get.mockResolvedValue([apiSubstrate({ substrate_id: 1 })]);
    const store = await newStore();
    await store.ensureLoaded();
    api.patch.mockRejectedValue(new Error("403"));
    await expect(store.editSubstrate(1, { name: "x" } as EditSubstrate)).rejects.toThrow("403");
    expect(store.items[0].name).toBe("Aroid Mix");
  });

  it("removes a deleted substrate after the server confirms", async () => {
    api.get.mockResolvedValue([
      apiSubstrate({ substrate_id: 1 }),
      apiSubstrate({ substrate_id: 2 }),
    ]);
    const store = await newStore();
    await store.ensureLoaded();
    api.delete.mockResolvedValue(null);
    await store.deleteSubstrate(1);
    expect(ids(store.items)).toEqual([2]);
  });

  it("keeps a substrate whose delete failed", async () => {
    api.get.mockResolvedValue([apiSubstrate({ substrate_id: 1 })]);
    const store = await newStore();
    await store.ensureLoaded();
    api.delete.mockRejectedValue(new Error("403"));
    await expect(store.deleteSubstrate(1)).rejects.toThrow("403");
    expect(ids(store.items)).toEqual([1]);
  });
});

describe("uploadSubstrateImage", () => {
  it("uploads, then refreshes just this substrate", async () => {
    api.get.mockImplementation(async (url: string) =>
      url === "/substrates"
        ? [apiSubstrate({ substrate_id: 1 }), apiSubstrate({ substrate_id: 2 })]
        : apiSubstrate({ substrate_id: 1, image_url: "http://img/1.webp" }),
    );
    const store = await newStore();
    await store.ensureLoaded();
    const file = new File(["x"], "x.png");
    await store.uploadSubstrateImage(1, file);
    expect(ImageService.uploadImage).toHaveBeenCalledWith(file, "substrate", 1, undefined);
    expect(api.get).toHaveBeenLastCalledWith("/substrates/1");
    expect(ids(store.items)).toEqual([1, 2]);
  });

  it("skips the refresh when asked to", async () => {
    const store = await newStore();
    await store.uploadSubstrateImage(1, new File(["x"], "x.png"), undefined, false);
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe("persistence", () => {
  it("hydrates a fresh snapshot instead of calling the API", async () => {
    memoryStore.set("substrates_all", {
      data: [{ id: 3, userId: 1, name: "Cached", isPublic: false }],
      timestamp: Date.now(),
    });
    const store = await newStore();
    await store.ensureLoaded();
    expect(api.get).not.toHaveBeenCalled();
    expect(ids(store.items)).toEqual([3]);
  });
});
