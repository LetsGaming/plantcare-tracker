import { describe, it, expect, vi, beforeEach } from "vitest";

const drivers = vi.hoisted(() => new Map<string, Map<string, unknown>>());
const reads = vi.hoisted(() => ({ calls: [] as { name: string; key: string }[] }));

vi.mock("@ionic/storage", () => ({
  Storage: class {
    private data: Map<string, unknown>;
    constructor(private readonly options: { name?: string } = {}) {
      const name = options.name ?? "_ionicstorage";
      if (!drivers.has(name)) drivers.set(name, new Map());
      this.data = drivers.get(name)!;
    }
    async create() {
      return this;
    }
    async get(key: string) {
      reads.calls.push({ name: this.options.name ?? "_ionicstorage", key });
      return this.data.get(key) ?? null;
    }
    async set(key: string, value: unknown) {
      this.data.set(key, value);
    }
    async remove(key: string) {
      this.data.delete(key);
    }
    async clear() {
      this.data.clear();
    }
    async keys() {
      return [...this.data.keys()];
    }
  },
}));

const kv = () => drivers.get("_ionicstorage")!;
const cache = () => drivers.get("plantcare_cache")!;

const load = async () => {
  vi.resetModules();
  return (await import("@/services/general/StorageService")).default;
};

beforeEach(() => {
  drivers.clear();
  reads.calls.length = 0;
});

describe("StorageService", () => {
  it("clears the account cache without reading any value", async () => {
    const storage = await load();
    await storage.set("plants_page", { data: [1] }, "cache");
    await storage.set("other_page", { data: [2] }, "cache");
    reads.calls.length = 0;
    await storage.clear();
    expect(reads.calls).toEqual([]);
    expect(cache().size).toBe(0);
  });

  it("keeps the token, theme and keepOnClear entries on clear", async () => {
    const storage = await load();
    await storage.set("auth_token", "abc");
    await storage.set("dark_mode", true);
    await storage.set("menu_collapsed", { data: true, keepOnClear: true });
    await storage.set("plants_page", { data: [1] }, "cache");
    await storage.clear();
    expect(await storage.get("auth_token")).toBe("abc");
    expect(await storage.get("dark_mode")).toBe(true);
    expect(await storage.get("menu_collapsed")).toEqual({ data: true, keepOnClear: true });
    expect(await storage.get("plants_page", "cache")).toBeNull();
  });

  it("wipes both areas on clearAll", async () => {
    const storage = await load();
    await storage.set("auth_token", "abc");
    await storage.set("plants_page", { data: [1] }, "cache");
    await storage.clearAll();
    expect(await storage.get("auth_token")).toBeNull();
    expect(await storage.get("plants_page", "cache")).toBeNull();
  });

  it("migrates once: removes obsolete keys and keeps settings and the token", async () => {
    drivers.set(
      "_ionicstorage",
      new Map<string, unknown>([
        ["auth_token", "abc"],
        ["snap_keep_photo", { data: true, keepOnClear: true, timestamp: 1 }],
        ["sales_price_history", { data: [1] }],
        ["sales_new", { data: [1] }],
        ["watering_records_data", { data: [1] }],
        ["plants_all", { data: [1] }],
        ["substrates_all", { data: [1] }],
        ["components_all", { data: [1] }],
      ]),
    );
    const storage = await load();
    expect(await storage.get("plants_all")).toBeNull();
    expect(await storage.get("sales_price_history")).toBeNull();
    expect(await storage.get("watering_records_data")).toBeNull();
    expect(await storage.get("auth_token")).toBe("abc");
    expect(await storage.get("snap_keep_photo")).toMatchObject({ data: true });

    await storage.set("plants_all", { data: ["written later"] });
    const again = await load();
    expect(await again.get("plants_all")).toEqual({ data: ["written later"] });
  });

  it("cleans orphan account keys in a browser that already ran the first migration", async () => {
    drivers.set(
      "_ionicstorage",
      new Map<string, unknown>([
        ["storage_split_v1", true],
        ["auth_token", "abc"],
        ["more_info_data", { data: { "en:Monty": [] } }],
        ["fertilizer_types_data", { data: [1] }],
        ["components_fineness_levels", { data: [1] }],
      ]),
    );
    const storage = await load();
    expect(await storage.get("more_info_data")).toBeNull();
    expect(await storage.get("fertilizer_types_data")).toBeNull();
    expect(await storage.get("components_fineness_levels")).toBeNull();
    expect(await storage.get("storage_split_v1")).toBeNull();
    expect(await storage.get("auth_token")).toBe("abc");
  });

  it("starts with an empty store without failing", async () => {
    const storage = await load();
    expect(await storage.get("anything")).toBeNull();
    expect(kv().size).toBeGreaterThan(0);
  });
});
