import { describe, expect, it } from "vitest";
import { activeFilterCount, applySalesQuery, defaultSalesQuery } from "@/utils/salesQuery";

const sale = (id: string, over: Partial<Sale> = {}): Sale => ({
  id,
  name: `Plant ${id}`,
  nameFull: `Plant ${id}`,
  seller: "Leafy",
  price: 20,
  oldPrice: 40,
  link: `https://shop.example/${id}`,
  ...over,
});

const sales: Sale[] = [
  sale("a", { price: 30, oldPrice: 40, seller: "Leafy" }),
  sale("b", { price: 10, oldPrice: 40, seller: "Jungle", isNew: true }),
  sale("c", { price: 50, oldPrice: 50, seller: "Jungle" }),
  sale("d", { price: 20, oldPrice: null as unknown as number, seller: "Leafy", isNew: true }),
];

const ids = (list: Sale[]) => list.map((s) => s.id);

describe("applySalesQuery", () => {
  it("puts new items first by default and breaks ties by name", () => {
    expect(ids(applySalesQuery(sales, defaultSalesQuery()))).toEqual(["b", "d", "a", "c"]);
  });

  it("sorts by discount, with items without a discount last", () => {
    const result = applySalesQuery(sales, { ...defaultSalesQuery(), sort: "discount" });
    expect(ids(result)).toEqual(["b", "a", "c", "d"]);
  });

  it("sorts by price in both directions", () => {
    expect(ids(applySalesQuery(sales, { ...defaultSalesQuery(), sort: "priceAsc" }))).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
    expect(ids(applySalesQuery(sales, { ...defaultSalesQuery(), sort: "priceDesc" }))).toEqual([
      "c",
      "a",
      "d",
      "b",
    ]);
  });

  it("sorts by name with numbers in natural order", () => {
    const list = [sale("10"), sale("9"), sale("2")];
    expect(ids(applySalesQuery(list, { ...defaultSalesQuery(), sort: "name" }))).toEqual([
      "2",
      "9",
      "10",
    ]);
  });

  it("filters by shop, new, discount and price range together", () => {
    expect(ids(applySalesQuery(sales, { ...defaultSalesQuery(), shops: ["Jungle"] }))).toEqual([
      "b",
      "c",
    ]);
    expect(ids(applySalesQuery(sales, { ...defaultSalesQuery(), onlyNew: true }))).toEqual([
      "b",
      "d",
    ]);
    expect(ids(applySalesQuery(sales, { ...defaultSalesQuery(), minDiscount: 50 }))).toEqual(["b"]);
    expect(
      ids(applySalesQuery(sales, { ...defaultSalesQuery(), minPrice: 15, maxPrice: 30 })),
    ).toEqual(["d", "a"]);
  });

  it("does not change the list it is given", () => {
    const copy = [...sales];
    applySalesQuery(sales, { ...defaultSalesQuery(), sort: "priceDesc" });
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
