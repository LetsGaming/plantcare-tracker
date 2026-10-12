/**
 * Tests for the sales store: SSE accumulation, the set of new ids, price
 * history and persistence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { watch } from "vue";
import { createInstalledPinia, memoryStore, resetStore } from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);
vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

type Handlers = {
  onMessage: (e: { data: unknown }) => void;
  onError?: (e: unknown) => void;
  onDone?: (d?: { total?: number }) => void;
};

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  isApiError: () => false,
  configureAuth: vi.fn(),
  script: (_h: Handlers): void => {},
  stream: vi.fn(),
}));
api.stream.mockImplementation(
  async (
    _endpoint: string,
    onMessage: Handlers["onMessage"],
    onError: Handlers["onError"],
    onDone: Handlers["onDone"],
  ) => {
    queueMicrotask(() => api.script({ onMessage, onError, onDone }));
    return () => {};
  },
);
vi.mock("@/utils/apiUtils", () => ({ default: api }));

import storageService from "@/services/general/StorageService";
import { MAX_PRICE_POINTS, nextHistory, useSalesStore } from "@/stores/sales";
import TabsPage from "@/views/TabsPage.vue";
import SalesDetails from "@/views/sales/SalesDetails.vue";

const apiSale = (id: string, price = 10): APISale => ({
  sale_id: id,
  sale_name: `Plant ${id}`,
  sale_seller: "Shop",
  sale_link: `https://shop.example/${id}`,
  sale_image_url: null,
  sale_old_price: 20,
  sale_new_price: price,
  sale_scraped_at: "2026-10-01T10:00:00.000Z",
});

const storedSale = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Plant ${id}`,
  nameFull: `Plant ${id}`,
  seller: "Shop",
  price: 10,
  oldPrice: 20,
  link: `https://shop.example/${id}`,
  ...extra,
});

const newStore = async () => {
  await createInstalledPinia();
  return useSalesStore();
};

const emit = (...batches: APISale[][]) => {
  api.script = (h) => {
    for (const batch of batches) h.onMessage({ data: batch });
    h.onDone?.({ total: batches.flat().length });
  };
};

const batchesOf = (count: number, size: number, prefix = "s"): APISale[][] =>
  Array.from({ length: count }, (_, b) =>
    Array.from({ length: size }, (_, i) => apiSale(`${prefix}${b * size + i}`)),
  );

const writesOf = (key: string): number =>
  vi.mocked(storageService.set).mock.calls.filter(([written]) => written === key).length;

const readKeys = (): string[] => vi.mocked(storageService.get).mock.calls.map(([key]) => key);

/** Counts assignments of a store property (each replaces the reference). */
const assignments = (read: () => unknown) => {
  const counter = { count: 0 };
  watch(read, () => counter.count++, { flush: "sync" });
  return counter;
};

const ids = (list: readonly Sale[]) => list.map((s) => s.id);

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("streaming", () => {
  it("accumulates streamed batches and deduplicates by id", async () => {
    emit([apiSale("a"), apiSale("b")], [apiSale("b"), apiSale("c")]);
    const store = await newStore();
    await store.load();
    expect(ids(store.items)).toEqual(["a", "b", "c"]);
    expect(store.status).toBe("ready");
    expect(store.streaming).toBe(false);
    expect(api.stream).toHaveBeenCalledWith(
      "/sales",
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("shows a first stream before it completes", async () => {
    let finish!: () => void;
    api.script = (h) => {
      h.onMessage({ data: [apiSale("a")] });
      finish = () => h.onDone?.({ total: 1 });
    };
    const store = await newStore();
    const loading = store.load();
    await vi.waitFor(() => expect(ids(store.items)).toEqual(["a"]));
    expect(store.streaming).toBe(true);
    expect(store.fetchedAt).toBeNull();

    finish();
    await loading;
    expect(ids(store.items)).toEqual(["a"]);
    expect(store.status).toBe("ready");
  });

  it("publishes a first stream at most every 250 ms", async () => {
    vi.useFakeTimers();
    api.script = (h) => {
      h.onMessage({ data: [apiSale("a")] });
      setTimeout(() => h.onMessage({ data: [apiSale("b")] }), 100);
      setTimeout(() => h.onMessage({ data: [apiSale("c")] }), 150);
      setTimeout(() => h.onDone?.({ total: 3 }), 1000);
    };
    const store = await newStore();
    const seen: string[][] = [];
    watch(
      () => store.items,
      (items) => seen.push(ids(items)),
      { flush: "sync" },
    );
    const loading = store.load();
    await vi.advanceTimersByTimeAsync(1100);
    await loading;
    expect(seen).toEqual([["a"], ["a", "b", "c"], ["a", "b", "c"]]);
  });

  it("commits a 1,000 item refresh once and writes each entry once", async () => {
    vi.useFakeTimers();
    memoryStore.set("sales_data", {
      data: [storedSale("old")],
      timestamp: Date.now(),
      keepOnClear: true,
    });
    memoryStore.set("sales_new", { data: { ids: [] }, timestamp: Date.now(), keepOnClear: true });
    const store = await newStore();
    await store.restore();
    await vi.advanceTimersByTimeAsync(500);
    vi.mocked(storageService.set).mockClear();

    const items = assignments(() => store.items);
    const history = assignments(() => store.priceHistory);
    const newIds = assignments(() => store.newIds);
    emit(...batchesOf(10, 100));
    await store.load({ force: true });
    await vi.advanceTimersByTimeAsync(500);

    expect(store.items).toHaveLength(1000);
    expect(items.count).toBe(1);
    expect(history.count).toBe(1);
    expect(newIds.count).toBe(1);
    expect(writesOf("sales_data")).toBe(1);
    expect(writesOf("sales_price_history")).toBe(1);
    expect(writesOf("sales_new")).toBe(1);
    expect(writesOf("sales_query")).toBe(0);
  });

  it("does not stream again while the sales are fresh, and shares a running stream", async () => {
    emit([apiSale("a")]);
    const store = await newStore();
    await Promise.all([store.load(), store.load()]);
    await store.load();
    expect(api.stream).toHaveBeenCalledTimes(1);
  });

  it("rejects, keeps the previous sales and stores nothing when the stream reports an error", async () => {
    emit([apiSale("a")]);
    const store = await newStore();
    await store.load();

    api.script = (h) => {
      h.onMessage({ data: [apiSale("b")] });
      h.onError?.({ message: "Stream interrupted" });
    };
    await expect(store.load({ force: true })).rejects.toEqual({ message: "Stream interrupted" });
    expect(ids(store.items)).toEqual(["a"]);
    expect(store.newCount).toBe(1);
    expect(store.streaming).toBe(false);
  });

  it("drops a failed first stream it already showed", async () => {
    api.script = (h) => {
      h.onMessage({ data: [apiSale("a")] });
      h.onError?.({ message: "boom" });
    };
    const store = await newStore();
    await expect(store.load()).rejects.toBeDefined();
    expect(store.items).toEqual([]);
    expect(store.newCount).toBe(0);
  });

  it("looks sales up by id without scanning the list", async () => {
    emit([apiSale("a"), apiSale("b")]);
    const store = await newStore();
    await store.load();
    const find = vi.spyOn(Array.prototype, "find");
    expect(store.byId("a")?.id).toBe("a");
    expect(store.byId("missing")).toBeUndefined();
    expect(find).not.toHaveBeenCalled();
    find.mockRestore();
  });

  it("drops a stream that was running when the store was reset", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    let handlers!: Handlers;
    api.stream.mockImplementationOnce(async (_endpoint, onMessage, onError, onDone) => {
      handlers = { onMessage, onError, onDone };
      return close;
    });
    const store = await newStore();
    const loading = store.load();
    await vi.waitFor(() => expect(handlers).toBeDefined());
    handlers.onMessage({ data: [apiSale("a")] });
    handlers.onMessage({ data: [apiSale("b")] });
    expect(ids(store.items)).toEqual(["a"]);

    store.$reset();
    vi.mocked(storageService.set).mockClear();
    const touched = [
      assignments(() => store.items),
      assignments(() => store.newIds),
      assignments(() => store.status),
      assignments(() => store.fetchedAt),
      assignments(() => store.restored),
      assignments(() => store.priceHistory),
    ];
    await vi.advanceTimersByTimeAsync(300);
    handlers.onMessage({ data: [apiSale("c")] });
    handlers.onDone?.({ total: 3 });
    await loading;
    await vi.advanceTimersByTimeAsync(500);

    expect(touched.map((counter) => counter.count)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(store.items).toEqual([]);
    expect(store.status).toBe("idle");
    expect(store.streaming).toBe(false);
    expect(close).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(storageService.set).not.toHaveBeenCalled();
  });

  it("keeps the stream's sales frozen and out of reactivity", async () => {
    emit([apiSale("a")]);
    const store = await newStore();
    await store.load();
    expect(Object.isFrozen(store.items[0])).toBe(true);
    expect(store.items[0].searchKey).toBe("plant a\nshop");
  });
});

describe("new ids", () => {
  it("counts new sales and clears one with markSeen", async () => {
    emit([apiSale("a"), apiSale("b")]);
    const store = await newStore();
    await store.load();
    expect(store.newCount).toBe(2);
    store.markSeen("a");
    expect(store.newCount).toBe(1);
    expect(store.isNew("a")).toBe(false);
    expect(store.isNew("b")).toBe(true);
    store.markSeen("missing");
    expect(store.newCount).toBe(1);
  });

  it("clears every new id with markAllSeen", async () => {
    emit([apiSale("a"), apiSale("b")]);
    const store = await newStore();
    await store.load();
    store.markAllSeen();
    expect(store.newCount).toBe(0);
  });

  it("keeps unseen sales new and flags sales the last list did not have", async () => {
    emit([apiSale("a"), apiSale("b")]);
    const store = await newStore();
    await store.load();
    store.markSeen("a");

    emit([apiSale("a"), apiSale("b"), apiSale("z")]);
    await store.load({ force: true });
    expect(Object.fromEntries(ids(store.items).map((id) => [id, store.isNew(id)]))).toEqual({
      a: false,
      b: true,
      z: true,
    });
  });

  it("forgets new ids that are no longer listed", async () => {
    emit([apiSale("a"), apiSale("b")]);
    const store = await newStore();
    await store.load();

    emit([apiSale("b")]);
    await store.load({ force: true });
    expect(store.newIds).toEqual(["b"]);
  });

  it("orders and filters by the new ids, not by a flag on the sale", async () => {
    emit([apiSale("a"), apiSale("b")]);
    const store = await newStore();
    await store.load();
    store.markSeen("a");
    expect(ids(store.filteredSales)).toEqual(["b", "a"]);
    store.setQuery({ onlyNew: true });
    expect(ids(store.filteredSales)).toEqual(["b"]);
  });

  it("keeps a list ordered without the new ids when one is marked seen", async () => {
    emit([apiSale("a", 10), apiSale("b", 30)]);
    const store = await newStore();
    await store.load();
    store.setQuery({ sort: "priceAsc" });
    const listed = store.filteredSales;

    store.markSeen("a");
    expect(store.newCount).toBe(1);
    expect(store.filteredSales).toBe(listed);
  });

  it("marks 1,000 new sales seen with one assignment and one write", async () => {
    vi.useFakeTimers();
    emit(...batchesOf(10, 100));
    const store = await newStore();
    await store.load();
    await vi.advanceTimersByTimeAsync(500);
    expect(store.newCount).toBe(1000);
    vi.mocked(storageService.set).mockClear();

    const newIds = assignments(() => store.newIds);
    store.markAllSeen();
    await vi.advanceTimersByTimeAsync(500);

    expect(store.newCount).toBe(0);
    expect(newIds.count).toBe(1);
    expect(writesOf("sales_new")).toBe(1);
    expect(writesOf("sales_data")).toBe(0);
    expect(memoryStore.get("sales_new")).toMatchObject({ data: { ids: [] } });
  });

  it("clears the new ids when the store is reset", async () => {
    emit([apiSale("a")]);
    const store = await newStore();
    await store.load();
    expect(store.newCount).toBe(1);
    store.$reset();
    expect(store.newCount).toBe(0);
    expect(store.isNew("a")).toBe(false);
  });
});

describe("price history", () => {
  it("records a point per changed price", async () => {
    emit([apiSale("a", 10)]);
    const store = await newStore();
    await store.load();
    expect(store.historyOf("a").map((p) => p.price)).toEqual([10]);

    emit([apiSale("a", 10)]);
    await store.load({ force: true });
    expect(store.historyOf("a")).toHaveLength(1);

    emit([apiSale("a", 12)]);
    await store.load({ force: true });
    expect(store.historyOf("a").map((p) => p.price)).toEqual([10, 12]);
  });

  it("returns an empty history for an unknown sale", async () => {
    const store = await newStore();
    expect(store.historyOf("nope")).toEqual([]);
  });

  it("keeps only listed ids and at most 30 points each", () => {
    const points = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ price: i + 1, timestamp: i }));
    const sale = (id: string, price: number) => ({ id, price }) as Sale;
    const prev = { a: points(30), gone: points(3), legacy: points(45) };

    const next = nextHistory(prev, [sale("a", 99), sale("legacy", 45), sale("fresh", 5)], 1000);

    expect(Object.keys(next).sort()).toEqual(["a", "fresh", "legacy"]);
    expect(next.a).toHaveLength(MAX_PRICE_POINTS);
    expect(next.a.at(-1)).toEqual({ price: 99, timestamp: 1000 });
    expect(next.a[0].price).toBe(2);
    expect(next.legacy).toHaveLength(MAX_PRICE_POINTS);
    expect(next.legacy.at(-1)!.price).toBe(45);
    expect(next.fresh).toEqual([{ price: 5, timestamp: 1000 }]);
  });

  it("returns the same history when no price changed", () => {
    const prev = { a: [{ price: 10, timestamp: 1 }] };
    expect(nextHistory(prev, [{ id: "a", price: 10 } as Sale], 2)).toBe(prev);
  });
});

describe("persistence", () => {
  it("stores sales, history and new ids as persistent entries after a completed stream", async () => {
    vi.useFakeTimers();
    emit([apiSale("a", 10)]);
    const store = await newStore();
    await store.load();
    await vi.advanceTimersByTimeAsync(500);

    const sales = memoryStore.get("sales_data") as { data: Sale[]; keepOnClear: boolean };
    expect(sales.keepOnClear).toBe(true);
    expect(ids(sales.data)).toEqual(["a"]);
    expect(sales.data[0]).not.toHaveProperty("isNew");
    expect(sales.data[0]).not.toHaveProperty("searchKey");
    const history = memoryStore.get("sales_price_history") as {
      data: { id: string; points: unknown[] }[];
      keepOnClear: boolean;
    };
    expect(history.keepOnClear).toBe(true);
    expect(history.data).toEqual([{ id: "a", points: [expect.objectContaining({ price: 10 })] }]);
    expect(memoryStore.get("sales_new")).toMatchObject({ data: { ids: ["a"] }, keepOnClear: true });
  });

  it("never stores a stream that is still running or failed", async () => {
    vi.useFakeTimers();
    api.script = (h) => {
      h.onMessage({ data: [apiSale("a")] });
      h.onError?.({ message: "boom" });
    };
    const store = await newStore();
    await expect(store.load()).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.has("sales_data")).toBe(false);
    expect(memoryStore.has("sales_new")).toBe(false);
  });

  it("never stores the partial list of a first stream, even when another load completes", async () => {
    vi.useFakeTimers();
    memoryStore.set("sales_data", { data: [], timestamp: Date.now(), keepOnClear: true });
    memoryStore.set("sales_new", { data: { ids: [] }, timestamp: Date.now(), keepOnClear: true });
    let finish!: () => void;
    api.script = (h) => {
      h.onMessage({ data: [apiSale("a")] });
      finish = () => {
        h.onMessage({ data: [apiSale("b")] });
        h.onDone?.({ total: 2 });
      };
    };
    const store = await newStore();
    await store.restore();
    expect(store.fetchedAt).not.toBeNull();

    const loading = store.load({ force: true });
    await vi.waitFor(() => expect(ids(store.items)).toEqual(["a"]));
    // Fresh and ready: returns at once, and its completion marks the list as changed.
    await store.load();
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.get("sales_data")).toMatchObject({ data: [] });

    finish();
    await loading;
    await vi.advanceTimersByTimeAsync(500);
    expect(ids((memoryStore.get("sales_data") as { data: Sale[] }).data)).toEqual(["a", "b"]);
  });

  it("forgets a restore that a reset overtook and reads the stored sales on the next load", async () => {
    memoryStore.set("sales_data", {
      data: [storedSale("a")],
      timestamp: Date.now(),
      keepOnClear: true,
    });
    emit([apiSale("z")]);
    const store = await newStore();
    const restoring = store.restore();
    store.$reset();
    await restoring;
    expect(store.restored).toBe(false);
    expect(store.items).toEqual([]);

    vi.mocked(storageService.get).mockClear();
    await store.load();
    expect(readKeys()).toContain("sales_data");
    expect(ids(store.items)).toEqual(["a"]);
    expect(store.restored).toBe(true);
    expect(api.stream).not.toHaveBeenCalled();
  });

  it("boots with only the new ids for the badge", async () => {
    memoryStore.set("sales_new", {
      data: { ids: ["x", "y"] },
      timestamp: Date.now() - 1000 * 60 * 60 * 24 * 30,
      keepOnClear: true,
    });
    memoryStore.set("sales_data", { data: [storedSale("x")], timestamp: 1, keepOnClear: true });
    const store = await newStore();

    await (TabsPage as any).mounted.call({ isAdmin: false });
    await vi.waitFor(() => expect(store.newCount).toBe(2));

    expect(readKeys()).toEqual(["sales_new"]);
    expect(store.items).toEqual([]);
    expect(api.stream).not.toHaveBeenCalled();
  });

  it("adopts an older release's flags at boot when no new ids are stored yet", async () => {
    memoryStore.set("sales_data", {
      data: [storedSale("a", { isNew: true }), storedSale("b", { isNew: false })],
      timestamp: 1,
      keepOnClear: true,
    });
    const store = await newStore();

    await (TabsPage as any).mounted.call({ isAdmin: false });
    await vi.waitFor(() => expect(store.restored).toBe(true));

    expect(store.newCount).toBe(1);
    expect(store.isNew("a")).toBe(true);
    expect(api.stream).not.toHaveBeenCalled();
  });

  it("logs a failed boot read instead of leaving it unhandled", async () => {
    const store = await newStore();
    const failure = new Error("storage unavailable");
    vi.spyOn(store, "$hydrate").mockRejectedValueOnce(failure);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await (TabsPage as any).mounted.call({ isAdmin: false });
    await vi.waitFor(() => expect(logged).toHaveBeenCalledWith(expect.any(String), failure));
    logged.mockRestore();
  });

  it("reads the new ids once when the boot read and a restore overlap", async () => {
    memoryStore.set("sales_new", {
      data: { ids: ["a"] },
      timestamp: Date.now(),
      keepOnClear: true,
    });
    memoryStore.set("sales_data", {
      data: [storedSale("a")],
      timestamp: Date.now(),
      keepOnClear: true,
    });
    const store = await newStore();

    await (TabsPage as any).mounted.call({ isAdmin: false });
    await store.restore();

    expect(readKeys().filter((key) => key === "sales_new")).toHaveLength(1);
    expect(store.newCount).toBe(1);
  });

  it("does not read the list again when a forced load follows a restore", async () => {
    memoryStore.set("sales_data", {
      data: [storedSale("a")],
      timestamp: Date.now(),
      keepOnClear: true,
    });
    const store = await newStore();
    await store.restore();
    vi.mocked(storageService.get).mockClear();

    emit([apiSale("a"), apiSale("b")]);
    await store.load({ force: true });

    expect(readKeys()).toEqual([]);
    expect(ids(store.items)).toEqual(["a", "b"]);
  });

  it("reads every entry once for concurrent loads", async () => {
    for (const key of ["sales_data", "sales_price_history", "sales_query", "sales_new"]) {
      memoryStore.set(key, {
        data: {
          sales_data: [storedSale("a")],
          sales_price_history: [],
          sales_query: {},
          sales_new: { ids: [] },
        }[key],
        timestamp: Date.now(),
        keepOnClear: true,
      });
    }
    const store = await newStore();
    await Promise.all([store.load(), store.load(), store.restore()]);
    await store.load();

    expect(readKeys().sort()).toEqual([
      "sales_data",
      "sales_new",
      "sales_price_history",
      "sales_query",
    ]);
    expect(api.stream).not.toHaveBeenCalled();
  });

  it("adopts the isNew flags of an older stored list once and drops them", async () => {
    vi.useFakeTimers();
    memoryStore.set("sales_data", {
      data: [
        storedSale("a", { isNew: true, searchKey: "stale key" }),
        storedSale("b", { isNew: false }),
      ],
      timestamp: Date.now() - 1000 * 60 * 60 * 24 * 30,
      keepOnClear: true,
    });
    const store = await newStore();
    await store.restore();
    expect(store.newCount).toBe(1);
    expect(store.isNew("a")).toBe(true);
    expect(store.byId("a")).not.toHaveProperty("isNew");
    expect(store.byId("a")?.searchKey).toBe("plant a\nshop");
    expect(api.stream).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    const sales = memoryStore.get("sales_data") as { data: Record<string, unknown>[] };
    expect(sales.data.some((sale) => "isNew" in sale)).toBe(false);
    expect(memoryStore.get("sales_new")).toMatchObject({ data: { ids: ["a"] } });
  });

  it("streams again when the restored sales are stale", async () => {
    memoryStore.set("sales_data", {
      data: [storedSale("a")],
      timestamp: Date.now() - 1000 * 60 * 60 * 24 * 30,
      keepOnClear: true,
    });
    emit([apiSale("z")]);
    const store = await newStore();
    await store.load();
    expect(api.stream).toHaveBeenCalledTimes(1);
    expect(ids(store.items)).toEqual(["z"]);
    expect(store.isNew("z")).toBe(true);
  });
});

describe("query", () => {
  it("filters and orders the sales without touching the stored ones", async () => {
    emit([apiSale("a", 10), apiSale("b", 30)]);
    const store = await newStore();
    await store.load();
    store.setQuery({ sort: "priceDesc", minPrice: 20 });
    expect(ids(store.filteredSales)).toEqual(["b"]);
    expect(ids(store.items)).toEqual(["a", "b"]);
    expect(store.sellers).toEqual(["Shop"]);
  });

  it("resets the filters but keeps the sort order", async () => {
    const store = await newStore();
    store.setQuery({ sort: "name", onlyNew: true, minDiscount: 30 });
    store.resetQuery();
    expect(store.query).toMatchObject({ sort: "name", onlyNew: false, minDiscount: 0 });
  });
});

describe("sales details", () => {
  type Page = Record<string, any> & { markSeen: ReturnType<typeof vi.fn> };
  const options = SalesDetails as any;

  /** The details page's data, hooks and methods on a plain object, with markSeen spied. */
  const detailsPage = (store: ReturnType<typeof useSalesStore>, id = "a"): Page => {
    const page: Page = {
      ...options.data(),
      id,
      markSeen: vi.fn(),
      loadSales: (opts: { force?: boolean }) => store.load(opts),
    };
    Object.defineProperty(page, "sale", { get: () => store.byId(page.id) ?? null });
    for (const [name, method] of Object.entries(options.methods)) {
      if (!(name in page)) page[name] = (method as (...args: unknown[]) => unknown).bind(page);
    }
    return page;
  };

  const frames = () => new Promise((resolve) => setTimeout(resolve, 50));

  it("marks the sale seen only once the page finished entering", async () => {
    emit([apiSale("a")]);
    const store = await newStore();
    const page = detailsPage(store);

    await options.ionViewWillEnter.call(page);
    await frames();
    expect(page.markSeen).not.toHaveBeenCalled();

    await options.ionViewDidEnter.call(page);
    expect(page.markSeen).toHaveBeenCalledTimes(1);
    expect(page.markSeen).toHaveBeenCalledWith("a");
  });

  it("marks the sale seen once when it loads after the transition", async () => {
    let finish!: () => void;
    api.script = (h) => {
      finish = () => {
        h.onMessage({ data: [apiSale("a")] });
        h.onDone?.({ total: 1 });
      };
    };
    const store = await newStore();
    const page = detailsPage(store);

    const entering = options.ionViewWillEnter.call(page);
    const entered = options.ionViewDidEnter.call(page);
    await vi.waitFor(() => expect(finish).toBeDefined());
    expect(page.markSeen).not.toHaveBeenCalled();

    finish();
    await Promise.all([entering, entered]);
    expect(page.markSeen).toHaveBeenCalledTimes(1);
  });

  it("does not mark the sale seen when the page is left before it finished entering", async () => {
    emit([apiSale("a")]);
    const store = await newStore();
    const page = detailsPage(store);

    const entering = options.ionViewWillEnter.call(page);
    options.ionViewWillLeave.call(page);
    await entering;
    await frames();

    expect(page.phase).toBe("ready");
    expect(page.markSeen).not.toHaveBeenCalled();
  });
});
