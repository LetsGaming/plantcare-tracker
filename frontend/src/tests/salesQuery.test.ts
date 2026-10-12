import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

import { activeFilterCount, applySalesQuery, defaultSalesQuery } from "@/utils/salesQuery";
import SaleMapper from "@/mapping/SaleMapping";
import ItemsOverview, { type OverviewItem } from "@/components/overview/ItemsOverview.vue";
import SalesOverview from "@/views/sales/SalesOverview.vue";

const sale = (id: string, over: Partial<Sale> = {}): Sale => ({
  id,
  name: `Plant ${id}`,
  nameFull: `Plant ${id}`,
  seller: "Leafy",
  price: 20,
  oldPrice: 40,
  link: `https://shop.example/${id}`,
  searchKey: `plant ${id} leafy`,
  ...over,
});

const sales: Sale[] = [
  sale("a", { price: 30, oldPrice: 40, seller: "Leafy" }),
  sale("b", { price: 10, oldPrice: 40, seller: "Jungle" }),
  sale("c", { price: 50, oldPrice: 50, seller: "Jungle" }),
  sale("d", { price: 20, oldPrice: null as unknown as number, seller: "Leafy" }),
];

const newIds = new Set(["b", "d"]);
const ctx = { locale: "en", isNew: (id: string) => newIds.has(id) };

const ids = (list: Sale[]) => list.map((s) => s.id);

describe("applySalesQuery", () => {
  it("puts new items first by default and breaks ties by name", () => {
    expect(ids(applySalesQuery(sales, defaultSalesQuery(), ctx))).toEqual(["b", "d", "a", "c"]);
  });

  it("asks isNew instead of reading a flag on the sale", () => {
    const flagged = [{ ...sale("a"), isNew: true } as Sale, sale("b")];
    const result = applySalesQuery(flagged, defaultSalesQuery(), {
      isNew: (id) => id === "b",
    });
    expect(ids(result)).toEqual(["b", "a"]);
  });

  it("sorts by discount, with items without a discount last", () => {
    const result = applySalesQuery(sales, { ...defaultSalesQuery(), sort: "discount" }, ctx);
    expect(ids(result)).toEqual(["b", "a", "c", "d"]);
  });

  it("sorts by price in both directions", () => {
    expect(ids(applySalesQuery(sales, { ...defaultSalesQuery(), sort: "priceAsc" }, ctx))).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
    expect(ids(applySalesQuery(sales, { ...defaultSalesQuery(), sort: "priceDesc" }, ctx))).toEqual(
      ["c", "a", "d", "b"],
    );
  });

  it("sorts by name with numbers in natural order", () => {
    const list = [sale("10"), sale("9"), sale("2")];
    expect(ids(applySalesQuery(list, { ...defaultSalesQuery(), sort: "name" }, ctx))).toEqual([
      "2",
      "9",
      "10",
    ]);
  });

  it("filters by shop, new, discount and price range together", () => {
    expect(ids(applySalesQuery(sales, { ...defaultSalesQuery(), shops: ["Jungle"] }, ctx))).toEqual(
      ["b", "c"],
    );
    expect(ids(applySalesQuery(sales, { ...defaultSalesQuery(), onlyNew: true }, ctx))).toEqual([
      "b",
      "d",
    ]);
    expect(ids(applySalesQuery(sales, { ...defaultSalesQuery(), minDiscount: 50 }, ctx))).toEqual([
      "b",
    ]);
    expect(
      ids(applySalesQuery(sales, { ...defaultSalesQuery(), minPrice: 15, maxPrice: 30 }, ctx)),
    ).toEqual(["d", "a"]);
  });

  it("does not change the list it is given", () => {
    const copy = [...sales];
    applySalesQuery(sales, { ...defaultSalesQuery(), sort: "priceDesc" }, ctx);
    expect(sales).toEqual(copy);
  });
});

describe("activeFilterCount", () => {
  it("counts narrowing filters and ignores the sort order", () => {
    expect(activeFilterCount({ ...defaultSalesQuery(), sort: "name" })).toBe(0);
    expect(
      activeFilterCount({
        ...defaultSalesQuery(),
        shops: ["Leafy"],
        onlyNew: true,
        minDiscount: 20,
        minPrice: 5,
        maxPrice: 80,
      }),
    ).toBe(5);
  });
});

describe("sales search", () => {
  const mapped = SaleMapper.mapSale({
    sale_id: "monstera-4711",
    sale_name: "Monstera Thai Constellation",
    sale_seller: "Leafy Rarities",
    sale_new_price: 89,
    sale_old_price: 120,
    sale_link: "https://leafy.example/p/monstera-4711",
    sale_image_url: "https://cdn.example/img/monstera.webp",
  });

  /** The cards SalesOverview hands to ItemsOverview, searched the way ItemsOverview searches. */
  const search = (query: string): OverviewItem[] => {
    const cards = (SalesOverview as any).computed.mappedSales.call({
      sales: [mapped],
      isNew: () => false,
    }) as OverviewItem[];
    const overview = {
      items: cards,
      currentSearch: "",
      filteredItems: [] as OverviewItem[],
      sortItems: (items: OverviewItem[]) => items,
    };
    (ItemsOverview as any).methods.filterItems.call(overview, query);
    return overview.filteredItems;
  };

  it("precomputes a lowercase key from the full name and the shop", () => {
    expect(mapped.searchKey).toBe("monstera thai constellation leafy rarities");
  });

  it("matches the name and the shop", () => {
    expect(search("Thai")).toHaveLength(1);
    expect(search("leafy rar")).toHaveLength(1);
  });

  it("does not match ids, links, image URLs or prices", () => {
    expect(search("4711")).toHaveLength(0);
    expect(search("https")).toHaveLength(0);
    expect(search("cdn.example")).toHaveLength(0);
    expect(search("89")).toHaveLength(0);
  });
});
