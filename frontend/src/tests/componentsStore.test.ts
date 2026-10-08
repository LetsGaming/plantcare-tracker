/**
 * Tests for the components store: the catalogue, fineness levels and the
 * admin mutations that upsert the server's version.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInstalledPinia, memoryStore, resetStore } from "./helpers";

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
import { useComponentsStore } from "@/stores/components";

const apiComponent = (overrides: Partial<APIComponent> = {}): APIComponent =>
  ({
    component_id: 1,
    component_name: "Perlite",
    fineness_id: 1,
    component_fineness: "coarse",
    image_url: null,
    images: [],
    ...overrides,
  }) as APIComponent;

const newStore = async () => {
  await createInstalledPinia();
  return useComponentsStore();
};

const ids = (store: ReturnType<typeof useComponentsStore>) => store.items.map((c) => c.id);

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

describe("reading", () => {
  it("maps and loads the catalogue once", async () => {
    api.get.mockResolvedValue([apiComponent(), apiComponent({ component_id: 2 })]);
    const store = await newStore();
    await store.ensureLoaded();
    await store.ensureLoaded();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/components");
    expect(store.items[0]).toMatchObject({ id: 1, name: "Perlite", fineness: "coarse" });
  });

  it("loads a component that is missing from the list and upserts it", async () => {
    api.get.mockImplementation(async (url: string) =>
      url === "/components"
        ? [apiComponent()]
        : apiComponent({ component_id: 9, component_name: "Pumice" }),
    );
    const store = await newStore();
    const component = await store.getComponent(9);
    expect(api.get).toHaveBeenCalledWith("/components/9");
    expect(component.name).toBe("Pumice");
    expect(ids(store)).toEqual([1, 9]);
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

describe("admin mutations", () => {
  it("adds a component and upserts the server's version", async () => {
    api.get.mockResolvedValue([apiComponent()]);
    const store = await newStore();
    await store.ensureLoaded();
    api.post.mockResolvedValue(apiComponent({ component_id: 2, component_name: "Grit" }));
    const created = await store.addComponent({ name: "Grit", finenessId: 1 } as AddComponent);
    expect(created.id).toBe(2);
    expect(ids(store)).toEqual([1, 2]);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("edits a component with PUT and replaces it in place", async () => {
    api.get.mockResolvedValue([apiComponent(), apiComponent({ component_id: 2 })]);
    const store = await newStore();
    await store.ensureLoaded();
    api.put.mockResolvedValue(apiComponent({ component_id: 1, component_name: "Renamed" }));
    await store.editComponent(1, { name: "Renamed" } as EditComponent);
    expect(api.put).toHaveBeenCalledWith("/components/1", { name: "Renamed" });
    expect(store.items.map((c) => c.name)).toEqual(["Renamed", "Perlite"]);
  });

  it("removes a deleted component after the server confirms and resolves despite the empty 204 body", async () => {
    api.get.mockResolvedValue([apiComponent(), apiComponent({ component_id: 2 })]);
    const store = await newStore();
    await store.ensureLoaded();
    api.delete.mockResolvedValue(null);
    await expect(store.deleteComponent(1)).resolves.toBeUndefined();
    expect(ids(store)).toEqual([2]);
  });

  it("keeps the list when a mutation fails", async () => {
    api.get.mockResolvedValue([apiComponent()]);
    const store = await newStore();
    await store.ensureLoaded();
    api.delete.mockRejectedValue(new Error("403"));
    await expect(store.deleteComponent(1)).rejects.toThrow("403");
    expect(ids(store)).toEqual([1]);
  });

  it("uploads an image, then refreshes just this component", async () => {
    api.get.mockImplementation(async (url: string) =>
      url === "/components"
        ? [apiComponent()]
        : apiComponent({ component_id: 1, image_url: "http://img/c.webp" }),
    );
    const store = await newStore();
    await store.ensureLoaded();
    const file = new File(["x"], "x.png");
    await store.uploadComponentImage(1, file);
    expect(ImageService.uploadImage).toHaveBeenCalledWith(file, "component", 1);
    expect(store.items[0].imageUrl).toBe("http://img/c.webp");
  });
});

describe("persistence", () => {
  it("hydrates the catalogue and the fineness levels from their own keys", async () => {
    memoryStore.set("components_all", {
      data: [{ id: 4, name: "Cached", fineness: "fine" }],
      timestamp: Date.now(),
    });
    memoryStore.set("components_fineness_levels", {
      data: [{ fineness_id: 1, fineness_name: "coarse" }],
      timestamp: Date.now(),
    });
    const store = await newStore();
    await store.ensureLoaded();
    await store.ensureFinenessLevels();
    expect(api.get).not.toHaveBeenCalled();
    expect(ids(store)).toEqual([4]);
    expect(store.finenessLevels).toHaveLength(1);
  });
});
