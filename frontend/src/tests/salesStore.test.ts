/**
 * Tests for the sales store: SSE accumulation, "new" flags, price history and
 * persistence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

import { useSalesStore } from "@/stores/sales";

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
    expect(store.items.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(store.status).toBe("ready");
    expect(store.streaming).toBe(false);
    expect(api.stream).toHaveBeenCalledWith(
      "/sales",
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("shows streamed sales before the stream completes", async () => {
    let finish!: () => void;
    api.script = (h) => {
      h.onMessage({ data: [apiSale("a")] });
      finish = () => h.onDone?.({ total: 1 });
    };
    const store = await newStore();
    const loading = store.load();
    await vi.waitFor(() => expect(store.visibleSales.map((s) => s.id)).toEqual(["a"]));
    expect(store.items).toEqual([]);
    expect(store.streaming).toBe(true);

    finish();
    await loading;
    expect(store.items.map((s) => s.id)).toEqual(["a"]);
    expect(store.incoming).toEqual([]);
  });

  it("flags only unseen sales as new on the next stream", async () => {
    emit([apiSale("a")]);
    const store = await newStore();
    await store.load();
    expect(store.items[0].isNew).toBe(true);

    emit([apiSale("a"), apiSale("z")]);
    await store.load({ force: true });
    expect(Object.fromEntries(store.items.map((s) => [s.id, s.isNew]))).toEqual({
      a: false,
      z: true,
    });
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
    expect(store.items.map((s) => s.id)).toEqual(["a"]);
    expect(store.incoming).toEqual([]);
    expect(store.streaming).toBe(false);
  });

  it("looks sales up by id", async () => {
    emit([apiSale("a")]);
    const store = await newStore();
    await store.load();
    expect(store.byId("a")?.id).toBe("a");
    expect(store.byId("missing")).toBeUndefined();
  });
});

describe("new flags", () => {
  it("counts new sales and clears the flag with markSeen", async () => {
    emit([apiSale("a"), apiSale("b")]);
    const store = await newStore();
    await store.load();
    expect(store.newCount).toBe(2);
    store.markSeen("a");
    expect(store.newCount).toBe(1);
    store.markSeen("missing");
    expect(store.newCount).toBe(1);
  });

  it("clears every new flag with markAllSeen", async () => {
    emit([apiSale("a"), apiSale("b")]);
    const store = await newStore();
    await store.load();
    store.markAllSeen();
    expect(store.newCount).toBe(0);
  });
});

describe("price history", () => {
  it("records a point per changed price and caps the history at 30", async () => {
    emit([apiSale("a", 10)]);
    const store = await newStore();
    await store.load();
    expect(store.historyOf("a").map((p) => p.price)).toEqual([10]);

    emit([apiSale("a", 10)]);
    await store.load({ force: true });
    expect(store.historyOf("a")).toHaveLength(1);

    for (let price = 11; price <= 45; price++) {
      store.addPricePoint({ id: "a", price } as Sale);
    }
    expect(store.historyOf("a")).toHaveLength(30);
    expect(store.historyOf("a").at(-1)!.price).toBe(45);
  });

  it("returns an empty history for an unknown sale", async () => {
    const store = await newStore();
    expect(store.historyOf("nope")).toEqual([]);
  });
});

describe("persistence", () => {
  it("stores sales and history as persistent entries after a completed stream", async () => {
    vi.useFakeTimers();
    emit([apiSale("a", 10)]);
    const store = await newStore();
    await store.load();
    await vi.advanceTimersByTimeAsync(500);

    const sales = memoryStore.get("sales_data") as { data: Sale[]; keepOnClear: boolean };
    expect(sales.keepOnClear).toBe(true);
    expect(sales.data.map((s) => s.id)).toEqual(["a"]);
    const history = memoryStore.get("sales_price_history") as {
      data: { id: string; points: unknown[] }[];
      keepOnClear: boolean;
    };
    expect(history.keepOnClear).toBe(true);
    expect(history.data).toEqual([{ id: "a", points: [expect.objectContaining({ price: 10 })] }]);
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
  });

  it("restores stored sales for the badge without streaming, even after they expired", async () => {
    memoryStore.set("sales_data", {
      data: [
        { id: "a", isNew: true },
        { id: "b", isNew: false },
      ],
      timestamp: Date.now() - 1000 * 60 * 60 * 24 * 30,
      keepOnClear: true,
    });
    const store = await newStore();
    await store.restore();
    expect(store.newCount).toBe(1);
    expect(api.stream).not.toHaveBeenCalled();
  });

  it("streams again when the restored sales are stale", async () => {
    memoryStore.set("sales_data", {
      data: [{ id: "a", isNew: true }],
      timestamp: Date.now() - 1000 * 60 * 60 * 24 * 30,
      keepOnClear: true,
    });
    emit([apiSale("z")]);
    const store = await newStore();
    await store.load();
    expect(api.stream).toHaveBeenCalledTimes(1);
    expect(store.items.map((s) => s.id)).toEqual(["z"]);
  });
});
