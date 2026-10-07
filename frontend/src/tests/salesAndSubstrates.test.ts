/**
 * Characterization tests for SalesService (SSE accumulation, "new" flags,
 * price history) and SubstrateService (pessimistic mutations that upsert the
 * server-confirmed substrate into the cache).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { memoryStore, resetStore } from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);
vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);
vi.mock("@/stores/session", () => ({ currentUserId: () => 1 }));
vi.mock("@/services/ImageService", () => ({ default: { uploadImage: vi.fn() } }));

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

import SalesService, { SaleEvents } from "@/services/SalesServices";
import SubstrateService, { SubstrateEvents } from "@/services/SubstrateService";
import { BaseService } from "@/services/base/BaseService";

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

beforeEach(() => {
  resetStore();
  BaseService.clearMemoryCache();
  vi.clearAllMocks();
});

describe("SalesService", () => {
  it("accumulates streamed batches, deduplicates by id and stores the result as persistent", async () => {
    api.script = (h) => {
      h.onMessage({ data: [apiSale("a"), apiSale("b")] });
      h.onMessage({ data: [apiSale("b"), apiSale("c")] });
      h.onDone?.({ total: 3 });
    };
    const updates: Sale[][] = [];
    const sales = await SalesService.getAllSales({ onUpdate: (chunk) => updates.push(chunk) });
    expect(sales.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(updates.map((u) => u.length)).toEqual([2, 1]);
    const stored = memoryStore.get("sales_data") as { keepOnClear: boolean };
    expect(stored.keepOnClear).toBe(true);
  });

  it("flags only unseen sales as new on the next stream", async () => {
    api.script = (h) => {
      h.onMessage({ data: [apiSale("a")] });
      h.onDone?.({ total: 1 });
    };
    const first = await SalesService.getAllSales();
    expect(first[0].isNew).toBe(true);

    api.script = (h) => {
      h.onMessage({ data: [apiSale("a"), apiSale("z")] });
      h.onDone?.({ total: 2 });
    };
    const second = await SalesService.getAllSales({ forceUpdate: true });
    expect(Object.fromEntries(second.map((s) => [s.id, s.isNew]))).toEqual({ a: false, z: true });
  });

  it("counts new sales and clears the flag with markSaleAsSeen, announcing SALE_SEEN", async () => {
    api.script = (h) => {
      h.onMessage({ data: [apiSale("a"), apiSale("b")] });
      h.onDone?.({ total: 2 });
    };
    await SalesService.getAllSales();
    expect(await SalesService.getNewSalesCount()).toBe(2);
    const seen = vi.fn();
    document.addEventListener(SaleEvents.SALE_SEEN, seen);
    await SalesService.markSaleAsSeen("a");
    document.removeEventListener(SaleEvents.SALE_SEEN, seen);
    expect(seen).toHaveBeenCalledOnce();
    expect(await SalesService.getNewSalesCount()).toBe(1);
  });

  it("rejects when the stream reports an error and caches nothing", async () => {
    api.script = (h) => h.onError?.({ message: "Stream interrupted" });
    await expect(SalesService.getAllSales()).rejects.toEqual({ message: "Stream interrupted" });
    expect(memoryStore.has("sales_data")).toBe(false);
  });

  it("records a price point per sale, skipping unchanged prices and capping history at 30", async () => {
    api.script = (h) => {
      h.onMessage({ data: [apiSale("a", 10)] });
      h.onDone?.({ total: 1 });
    };
    await SalesService.getAllSales();
    expect((await SalesService.getPriceHistory("a")).map((p) => p.price)).toEqual([10]);

    api.script = (h) => {
      h.onMessage({ data: [apiSale("a", 10)] });
      h.onDone?.({ total: 1 });
    };
    await SalesService.getAllSales({ forceUpdate: true });
    expect(await SalesService.getPriceHistory("a")).toHaveLength(1);

    for (let price = 11; price <= 45; price++) {
      await SalesService.addPricePoint({ id: "a", price } as Sale);
    }
    const history = await SalesService.getPriceHistory("a");
    expect(history).toHaveLength(30);
    expect(history.at(-1)!.price).toBe(45);
  });

  it("resolves a sale by id from the stream result", async () => {
    api.script = (h) => {
      h.onMessage({ data: [apiSale("a")] });
      h.onDone?.({ total: 1 });
    };
    expect((await SalesService.getSaleById("a"))?.id).toBe("a");
    expect(await SalesService.getSaleById("missing")).toBeNull();
  });
});

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

describe("SubstrateService", () => {
  it("fetches the list once and derives the owner's substrates", async () => {
    api.get.mockResolvedValue([
      apiSubstrate({ substrate_id: 1, substrate_user_id: 1 }),
      apiSubstrate({ substrate_id: 2, substrate_user_id: 9, is_public: true }),
    ]);
    expect((await SubstrateService.getPrivateSubstrates()).map((s) => s.id)).toEqual([1]);
    expect((await SubstrateService.getPublicSubstrates()).map((s) => s.id)).toEqual([2]);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("creates a substrate and upserts the server response without refetching", async () => {
    api.get.mockResolvedValue([apiSubstrate({ substrate_id: 1 })]);
    await SubstrateService.getAllSubstrates();
    api.post.mockResolvedValue(apiSubstrate({ substrate_id: 2, substrate_name: "New" }));
    const events = vi.fn();
    document.addEventListener(SubstrateEvents.SUBSTRATES_UPDATED, events);
    await SubstrateService.addSubstrate({ name: "New", isPublic: false } as AddSubstrate);
    document.removeEventListener(SubstrateEvents.SUBSTRATES_UPDATED, events);
    expect(events).toHaveBeenCalled();
    expect((await SubstrateService.getAllSubstrates()).map((s) => s.id)).toEqual([1, 2]);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("creates with components in two requests and keeps the final state", async () => {
    api.get.mockResolvedValue([]);
    await SubstrateService.getAllSubstrates();
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
    const id = await SubstrateService.addSubstrateWithComponents(
      { name: "Mix", isPublic: false } as AddSubstrate,
      { components: [{ componentId: 1, parts: 2 }] } as AddSubstrateComponents,
    );
    expect(id).toBe(5);
    expect(api.post).toHaveBeenNthCalledWith(2, "/substrates/5/components", {
      components: [{ componentId: 1, parts: 2 }],
    });
    const list = await SubstrateService.getAllSubstrates();
    expect(list).toHaveLength(1);
    expect(list[0].components).toHaveLength(1);
  });

  it("does not touch the cache when a mutation fails", async () => {
    api.get.mockResolvedValue([apiSubstrate({ substrate_id: 1 })]);
    await SubstrateService.getAllSubstrates();
    api.patch.mockRejectedValue(new Error("403"));
    await expect(SubstrateService.editSubstrate(1, { name: "x" } as EditSubstrate)).rejects.toThrow(
      "403",
    );
    expect((await SubstrateService.getAllSubstrates())[0].name).toBe("Aroid Mix");
  });

  it("removes a deleted substrate from the cache after the server confirms", async () => {
    api.get.mockResolvedValue([
      apiSubstrate({ substrate_id: 1 }),
      apiSubstrate({ substrate_id: 2 }),
    ]);
    await SubstrateService.getAllSubstrates();
    api.delete.mockResolvedValue(null);
    await SubstrateService.deleteSubstrate(1);
    expect((await SubstrateService.getAllSubstrates()).map((s) => s.id)).toEqual([2]);
  });
});
