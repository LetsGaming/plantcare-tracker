/**
 * Tests for the sales store on the server model: the SSE replay, the
 * watermark and seen ids, the badge summary, freshness and persistence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { watch } from "vue";
import {
  apiSale as apiSaleFixture,
  createInstalledPinia,
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
import { epoch } from "@/stores/resource";
import { NEW_WINDOW_DAYS, useSalesStore } from "@/stores/sales";
import TabsPage from "@/views/TabsPage.vue";
import SalesDetails from "@/views/sales/SalesDetails.vue";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);

/** A sale first seen `age` days ago. */
const apiSale = (id: string, price = 10, ageDays = 1): APISale =>
  apiSaleFixture({
    sale_id: id,
    sale_name: `Plant ${id}`,
    sale_seller: "Shop",
    sale_link: `https://shop.example/${id}`,
    sale_image_url: null,
    sale_old_price: 20,
    sale_new_price: price,
    sale_first_seen_at: NOW - ageDays * DAY,
    sale_scraped_at: NOW,
  });

const storedSale = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Plant ${id}`,
  nameFull: `Plant ${id}`,
  seller: "Shop",
  price: 10,
  oldPrice: 20,
  discountPct: 50,
  link: `https://shop.example/${id}`,
  firstSeenAt: NOW - DAY,
  scrapedAt: NOW,
  ...extra,
});

const summaryDto = (over: Partial<APISalesSummary> = {}): APISalesSummary => ({
  total: 3,
  new_since: 2,
  refreshed_at: NOW,
  latest_first_seen_at: NOW - DAY,
  ...over,
});

const stored = (key: string, data: unknown) =>
  memoryStore.set(key, { data, timestamp: Date.now(), keepOnClear: true });

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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  api.get.mockResolvedValue(summaryDto());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("replay", () => {
  it("accumulates streamed batches and deduplicates by id", async () => {
    emit([apiSale("a"), apiSale("b")], [apiSale("b"), apiSale("c")]);
    const store = await newStore();
    await store.replay();
    expect(ids(store.items)).toEqual(["a", "b", "c"]);
    expect(store.status).toBe("ready");
    expect(store.streaming).toBe(false);
    expect(store.summary.total).toBe(3);
    expect(api.stream).toHaveBeenCalledWith(
      "/sales",
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("commits a 2,000 item replay once and writes each entry once", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    stored("sales_data", [storedSale("old")]);
    const store = await newStore();
    await store.restore();
    await vi.advanceTimersByTimeAsync(500);
    vi.mocked(storageService.set).mockClear();

    const items = assignments(() => store.items);
    const seen = assignments(() => store.seen);
    emit(...batchesOf(20, 100));
    await store.replay();
    await vi.advanceTimersByTimeAsync(500);

    expect(store.items).toHaveLength(2000);
    expect(items.count).toBe(1);
    expect(seen.count).toBe(0);
    expect(writesOf("sales_data")).toBe(1);
    expect(writesOf("sales_summary")).toBe(1);
    expect(writesOf("sales_query")).toBe(0);
  });

  it("publishes a cold replay at most every 250 ms", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
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
    const loading = store.replay();
    await vi.advanceTimersByTimeAsync(1100);
    await loading;
    expect(seen).toEqual([["a"], ["a", "b", "c"], ["a", "b", "c"]]);
  });

  it("does not write sales_data when the replay leaves count and newest scrape unchanged", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    emit([apiSale("a")]);
    const store = await newStore();
    await store.replay();
    await vi.advanceTimersByTimeAsync(500);
    expect(writesOf("sales_data")).toBe(1);

    emit([apiSale("a")]);
    await store.replay();
    await vi.advanceTimersByTimeAsync(500);
    expect(writesOf("sales_data")).toBe(1);
  });

  it("shares a running replay", async () => {
    emit([apiSale("a")]);
    const store = await newStore();
    await Promise.all([store.replay(), store.replay()]);
    expect(api.stream).toHaveBeenCalledTimes(1);
  });

  it("rejects and keeps the previous sales when the stream reports an error", async () => {
    emit([apiSale("a")]);
    const store = await newStore();
    await store.replay();

    api.script = (h) => {
      h.onMessage({ data: [apiSale("b")] });
      h.onError?.({ message: "Stream interrupted" });
    };
    await expect(store.replay()).rejects.toEqual({ message: "Stream interrupted" });
    expect(ids(store.items)).toEqual(["a"]);
    expect(store.streaming).toBe(false);
  });

  it("drops a failed first replay it already showed", async () => {
    api.script = (h) => {
      h.onMessage({ data: [apiSale("a")] });
      h.onError?.({ message: "boom" });
    };
    const store = await newStore();
    await expect(store.replay()).rejects.toBeDefined();
    expect(store.items).toEqual([]);
  });

  it("looks sales up by id without scanning the list", async () => {
    emit([apiSale("a"), apiSale("b")]);
    const store = await newStore();
    await store.replay();
    const find = vi.spyOn(Array.prototype, "find");
    expect(store.byId("a")?.id).toBe("a");
    expect(store.byId("missing")).toBeUndefined();
    expect(find).not.toHaveBeenCalled();
    find.mockRestore();
  });

  it("drops a replay that was running when the store was reset", async () => {
    const close = vi.fn();
    let handlers!: Handlers;
    api.stream.mockImplementationOnce(async (_endpoint, onMessage, onError, onDone) => {
      handlers = { onMessage, onError, onDone };
      return close;
    });
    const store = await newStore();
    const loading = store.replay();
    await vi.waitFor(() => expect(handlers).toBeDefined());
    handlers.onMessage({ data: [apiSale("a")] });

    store.$reset();
    vi.mocked(storageService.set).mockClear();
    const touched = [
      assignments(() => store.items),
      assignments(() => store.seen),
      assignments(() => store.summary),
      assignments(() => store.status),
    ];
    handlers.onMessage({ data: [apiSale("c")] });
    handlers.onDone?.({ total: 3 });
    await loading;

    expect(touched.map((counter) => counter.count)).toEqual([0, 0, 0, 0]);
    expect(store.items).toEqual([]);
    expect(store.streaming).toBe(false);
    expect(close).toHaveBeenCalled();
    expect(storageService.set).not.toHaveBeenCalled();
  });

  it("drops the result of a replay that a logout overtook", async () => {
    let handlers!: Handlers;
    api.stream.mockImplementationOnce(async (_endpoint, onMessage, onError, onDone) => {
      handlers = { onMessage, onError, onDone };
      return () => {};
    });
    const store = await newStore();
    const loading = store.replay();
    await vi.waitFor(() => expect(handlers).toBeDefined());
    handlers.onMessage({ data: [apiSale("a")] });

    epoch.abortAll();
    handlers.onMessage({ data: [apiSale("b")] });
    handlers.onDone?.({ total: 2 });
    await expect(loading).resolves.toBeUndefined();

    expect(store.items).toEqual([]);
    expect(store.fetchedAt).toBeNull();
    expect(store.streaming).toBe(false);
  });

  it("swallows a failure of a replay that a logout overtook", async () => {
    let handlers!: Handlers;
    api.stream.mockImplementationOnce(async (_endpoint, onMessage, onError, onDone) => {
      handlers = { onMessage, onError, onDone };
      return () => {};
    });
    const store = await newStore();
    const loading = store.replay();
    await vi.waitFor(() => expect(handlers).toBeDefined());
    epoch.abortAll();
    handlers.onError?.(new Error("closed"));
    await expect(loading).resolves.toBeUndefined();
  });

  it("keeps the sales frozen with a search key", async () => {
    emit([apiSale("a")]);
    const store = await newStore();
    await store.replay();
    expect(Object.isFrozen(store.items[0])).toBe(true);
    expect(store.items[0].searchKey).toBe("plant a\nshop");
  });
});

describe("new sales", () => {
  it("starts a fresh install with a watermark seven days back", async () => {
    const store = await newStore();
    expect(NEW_WINDOW_DAYS).toBe(7);
    expect(store.seen.watermark).toBe(NOW - 7 * DAY);
    expect(store.seen.ids).toEqual([]);
  });

  it("shows only the last seven days as new on a fresh install", async () => {
    emit([apiSale("recent", 10, 2), apiSale("edge", 10, 8), apiSale("old", 10, 40)]);
    const store = await newStore();
    await store.replay();
    expect(store.isNew("recent")).toBe(true);
    expect(store.isNew("edge")).toBe(false);
    expect(store.isNew("old")).toBe(false);
    expect(store.newCount).toBe(1);
  });

  it("is new when first seen after the watermark and not opened", async () => {
    emit([apiSale("a", 10, 1), apiSale("b", 10, 2)]);
    const store = await newStore();
    await store.replay();
    expect(store.newCount).toBe(2);

    store.markSeen("a");
    expect(store.isNew("a")).toBe(false);
    expect(store.isNew("b")).toBe(true);
    expect(store.seen.ids).toEqual(["a"]);
    expect(store.newCount).toBe(1);

    store.markSeen("a");
    store.markSeen("missing");
    expect(store.newCount).toBe(1);
  });

  it("keeps opened sales seen across a replay and flags later ones", async () => {
    emit([apiSale("a"), apiSale("b")]);
    const store = await newStore();
    await store.replay();
    store.markSeen("a");

    emit([apiSale("a"), apiSale("b"), apiSale("z", 10, 0.5)]);
    await store.replay();
    expect(Object.fromEntries(ids(store.items).map((id) => [id, store.isNew(id)]))).toEqual({
      a: false,
      b: true,
      z: true,
    });
  });

  it("prunes ids at or below the watermark and ids no longer listed at commit", async () => {
    emit([apiSale("a"), apiSale("b"), apiSale("c")]);
    const store = await newStore();
    await store.replay();
    store.markSeen("a");
    store.markSeen("b");
    store.markSeen("c");
    expect(store.seen.ids).toEqual(["a", "b", "c"]);

    emit([apiSale("a"), apiSale("c", 10, 20)]);
    await store.replay();
    expect(store.seen.ids).toEqual(["a"]);
  });

  it("marks everything seen with one assignment and one write", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    emit(...batchesOf(10, 100));
    const store = await newStore();
    await store.replay();
    await vi.advanceTimersByTimeAsync(500);
    expect(store.newCount).toBe(1000);
    vi.mocked(storageService.set).mockClear();

    const seen = assignments(() => store.seen);
    const items = assignments(() => store.items);
    store.markAllSeen();
    await vi.advanceTimersByTimeAsync(500);

    expect(store.newCount).toBe(0);
    expect(seen.count).toBe(1);
    expect(items.count).toBe(0);
    expect(store.seen.watermark).toBe(NOW - DAY);
    expect(store.seen.ids).toEqual([]);
    expect(writesOf("sales_seen")).toBe(1);
    expect(writesOf("sales_data")).toBe(0);
  });

  it("moves the watermark to the server's latest first seen", async () => {
    const store = await newStore();
    await store.loadSummary();
    store.markAllSeen();
    expect(store.seen.watermark).toBe(NOW - DAY);
  });

  it("orders and filters by the new state", async () => {
    emit([apiSale("a"), apiSale("b")]);
    const store = await newStore();
    await store.replay();
    store.markSeen("a");
    expect(ids(store.filteredSales)).toEqual(["b", "a"]);
    store.setQuery({ onlyNew: true });
    expect(ids(store.filteredSales)).toEqual(["b"]);
  });

  it("keeps a list ordered without the new state when one is marked seen", async () => {
    emit([apiSale("a", 10), apiSale("b", 30)]);
    const store = await newStore();
    await store.replay();
    store.setQuery({ sort: "priceAsc" });
    const listed = store.filteredSales;
    store.markSeen("a");
    expect(store.filteredSales).toBe(listed);
  });
});

describe("summary and freshness", () => {
  it("reads the badge from the server with the watermark as since", async () => {
    const store = await newStore();
    await store.loadSummary();
    expect(api.get).toHaveBeenCalledWith(`/sales/summary?since=${NOW - 7 * DAY}`);
    expect(store.newCount).toBe(2);
    expect(store.summary).toMatchObject({ total: 3, refreshedAt: NOW });
  });

  it("subtracts the opened ids from the server's new count", async () => {
    stored("sales_seen", { watermark: NOW - 7 * DAY, ids: ["a"] });
    const store = await newStore();
    await store.loadSummary();
    expect(store.newCount).toBe(1);
  });

  it("drops a summary that a logout overtook", async () => {
    let answer!: (value: APISalesSummary) => void;
    api.get.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const store = await newStore();
    const loading = store.loadSummary();
    await vi.waitFor(() => expect(api.get).toHaveBeenCalled());
    epoch.abortAll();
    answer(summaryDto());
    await expect(loading).resolves.toBeNull();
    expect(store.newCount).toBe(0);
  });

  it("replays when no list is stored", async () => {
    emit([apiSale("a")]);
    const store = await newStore();
    await store.ensureFresh();
    expect(api.stream).toHaveBeenCalledTimes(1);
    expect(ids(store.items)).toEqual(["a"]);
    expect(store.summary.listRefreshedAt).toBe(NOW);
  });

  it("skips the replay when refreshed_at is unchanged", async () => {
    emit([apiSale("a")]);
    const store = await newStore();
    await store.ensureFresh();
    api.stream.mockClear();

    await store.ensureFresh();
    expect(api.stream).not.toHaveBeenCalled();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("replays when the server refreshed after the stored list", async () => {
    emit([apiSale("a")]);
    const store = await newStore();
    await store.ensureFresh();
    api.stream.mockClear();

    api.get.mockResolvedValue(summaryDto({ refreshed_at: NOW + 1000 }));
    emit([apiSale("a"), apiSale("b")]);
    await store.ensureFresh();
    expect(api.stream).toHaveBeenCalledTimes(1);
    expect(ids(store.items)).toEqual(["a", "b"]);
  });

  it("keeps a stored list when the summary fails", async () => {
    stored("sales_data", [storedSale("a")]);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    api.get.mockRejectedValue(new Error("offline"));
    const store = await newStore();
    await store.ensureFresh();
    expect(api.stream).not.toHaveBeenCalled();
    expect(ids(store.items)).toEqual(["a"]);
    logged.mockRestore();
  });
});

describe("persistence", () => {
  it("stores the list, the seen record and the summary after a replay", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    emit([apiSale("a")]);
    const store = await newStore();
    await store.replay();
    await vi.advanceTimersByTimeAsync(500);

    const sales = memoryStore.get("sales_data") as { data: Sale[]; keepOnClear: boolean };
    expect(sales.keepOnClear).toBe(true);
    expect(ids(sales.data)).toEqual(["a"]);
    expect(sales.data[0]).not.toHaveProperty("searchKey");
    expect(memoryStore.get("sales_seen")).toMatchObject({
      data: { watermark: NOW - 7 * DAY, ids: [] },
      keepOnClear: true,
    });
    expect(memoryStore.get("sales_summary")).toMatchObject({
      data: { total: 1, newCount: 1 },
      keepOnClear: true,
    });
    expect(memoryStore.has("sales_price_history")).toBe(false);
    expect(memoryStore.has("sales_new")).toBe(false);
  });

  it("never stores a replay that is still running or failed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    api.script = (h) => {
      h.onMessage({ data: [apiSale("a")] });
      h.onError?.({ message: "boom" });
    };
    const store = await newStore();
    await expect(store.replay()).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(500);
    expect(memoryStore.has("sales_data")).toBe(false);
  });

  it("boots with only the summary and the seen record", async () => {
    stored("sales_summary", { total: 5, newCount: 3, refreshedAt: NOW, listRefreshedAt: NOW });
    stored("sales_seen", { watermark: NOW - DAY, ids: [] });
    stored("sales_data", [storedSale("x")]);
    stored("sales_query", {});
    const store = await newStore();

    await (TabsPage as any).mounted.call({ isAdmin: false });
    await vi.waitFor(() => expect(store.newCount).toBe(3));
    await vi.waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining("/sales/summary")),
    );

    expect([...readKeys()].sort()).toEqual(["sales_seen", "sales_summary"]);
    expect(store.items).toEqual([]);
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

  it("reads every entry once for concurrent restores and a boot read", async () => {
    stored("sales_data", [storedSale("a")]);
    stored("sales_query", {});
    stored("sales_summary", { total: 1, newCount: 1, refreshedAt: NOW });
    stored("sales_seen", { watermark: NOW - 7 * DAY, ids: [] });
    const store = await newStore();
    await (TabsPage as any).mounted.call({ isAdmin: false });
    await Promise.all([store.restore(), store.restore()]);

    expect([...readKeys()].sort()).toEqual([
      "sales_data",
      "sales_query",
      "sales_seen",
      "sales_summary",
    ]);
  });

  it("ignores a list stored by an older release", async () => {
    stored("sales_data", [
      { id: "a", name: "Plant a", nameFull: "Plant a", seller: "Shop", price: 10, isNew: true },
    ]);
    emit([apiSale("z")]);
    const store = await newStore();
    await store.restore();
    expect(store.items).toEqual([]);

    await store.ensureFresh();
    expect(ids(store.items)).toEqual(["z"]);
  });

  it("forgets a restore that a reset overtook and reads again on the next restore", async () => {
    stored("sales_data", [storedSale("a")]);
    const store = await newStore();
    const restoring = store.restore();
    store.$reset();
    await restoring;
    expect(store.restored).toBe(false);
    expect(store.items).toEqual([]);

    await store.restore();
    expect(ids(store.items)).toEqual(["a"]);
    expect(store.restored).toBe(true);
  });
});

describe("query", () => {
  it("filters and orders the sales without touching the stored ones", async () => {
    emit([apiSale("a", 10), apiSale("b", 30)]);
    const store = await newStore();
    await store.replay();
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
  type Page = Record<string, any>;
  const options = SalesDetails as any;

  const detailDto = (id: string): APISaleDetail => ({
    ...apiSale(id),
    history: [
      { price: 12, observed_at: NOW - 2 * DAY },
      { price: 10, observed_at: NOW - DAY },
    ],
  });

  const detailsPage = (store: ReturnType<typeof useSalesStore>, id = "a"): Page => {
    const page: Page = {
      ...options.data(),
      id,
      byId: store.byId,
      restore: () => store.restore(),
      loadDetail: (saleId: string) => store.loadDetail(saleId),
      markSeen: vi.fn(),
    };
    Object.defineProperty(page, "sale", {
      get: () => page.detail?.sale ?? store.byId(page.id) ?? null,
    });
    for (const [name, method] of Object.entries(options.methods)) {
      if (!(name in page)) page[name] = (method as (...args: unknown[]) => unknown).bind(page);
    }
    return page;
  };

  it("loads the history from /sales/:id and never opens a stream", async () => {
    api.get.mockImplementation(async (url: string) =>
      url.startsWith("/sales/a") ? detailDto("a") : summaryDto(),
    );
    const store = await newStore();
    const page = detailsPage(store);

    await options.ionViewWillEnter.call(page);

    expect(api.get).toHaveBeenCalledWith("/sales/a");
    expect(api.stream).not.toHaveBeenCalled();
    expect(page.phase).toBe("ready");
    expect(page.detail.history.map((p: SalePricePoint) => p.price)).toEqual([12, 10]);
  });

  it("shows the sale from the stored list while the history loads", async () => {
    stored("sales_data", [storedSale("a")]);
    let answer!: (dto: APISaleDetail) => void;
    api.get.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const store = await newStore();
    const page = detailsPage(store);

    const entering = options.ionViewWillEnter.call(page);
    await vi.waitFor(() => expect(page.phase).toBe("ready"));
    expect(page.detail).toBeNull();

    answer(detailDto("a"));
    await entering;
    expect(page.detail.history).toHaveLength(2);
  });

  it("reports not found for an unknown sale", async () => {
    api.get.mockRejectedValue(Object.assign(new Error("missing"), { status: 404 }));
    const store = await newStore();
    const page = detailsPage(store, "zzz");
    await options.ionViewWillEnter.call(page);
    expect(page.phase).toBe("not-found");
    expect(api.stream).not.toHaveBeenCalled();
  });

  it("refreshes only that item on pull to refresh", async () => {
    api.get.mockResolvedValue(detailDto("a"));
    const store = await newStore();
    const page = detailsPage(store);
    await options.ionViewWillEnter.call(page);
    api.get.mockClear();

    await page.refresh();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/sales/a");
    expect(api.stream).not.toHaveBeenCalled();
  });

  it("marks the sale seen only once the page finished entering", async () => {
    api.get.mockResolvedValue(detailDto("a"));
    const store = await newStore();
    const page = detailsPage(store);

    await options.ionViewWillEnter.call(page);
    expect(page.markSeen).not.toHaveBeenCalled();

    await options.ionViewDidEnter.call(page);
    expect(page.markSeen).toHaveBeenCalledTimes(1);
    expect(page.markSeen).toHaveBeenCalledWith("a", expect.any(Number));
  });

  it("does not mark the sale seen when the page is left before it finished entering", async () => {
    api.get.mockResolvedValue(detailDto("a"));
    const store = await newStore();
    const page = detailsPage(store);

    const entering = options.ionViewWillEnter.call(page);
    options.ionViewWillLeave.call(page);
    await entering;

    expect(page.phase).toBe("ready");
    expect(page.markSeen).not.toHaveBeenCalled();
  });
});
