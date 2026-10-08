import { discountPercent } from "@/utils/formatPrice";

export const SALES_SORTS = ["new", "discount", "priceAsc", "priceDesc", "name"] as const;
export type SalesSort = (typeof SALES_SORTS)[number];

export const DISCOUNT_STEPS = [0, 20, 30, 50] as const;

export interface SalesQuery {
  sort: SalesSort;
  /** Sellers to keep; empty keeps every shop. */
  shops: string[];
  onlyNew: boolean;
  /** Smallest discount in percent; 0 keeps everything. */
  minDiscount: number;
  minPrice: number | null;
  maxPrice: number | null;
}

export const DEFAULT_SALES_QUERY: SalesQuery = {
  sort: "new",
  shops: [],
  onlyNew: false,
  minDiscount: 0,
  minPrice: null,
  maxPrice: null,
};

export const defaultSalesQuery = (): SalesQuery => ({ ...DEFAULT_SALES_QUERY, shops: [] });

/** Number of narrowing filters in use; the sort order does not count. */
export const activeFilterCount = (query: SalesQuery): number =>
  [
    query.shops.length > 0,
    query.onlyNew,
    query.minDiscount > 0,
    query.minPrice !== null,
    query.maxPrice !== null,
  ].filter(Boolean).length;

const keeps = (sale: Sale, query: SalesQuery): boolean => {
  if (query.shops.length > 0 && !query.shops.includes(sale.seller)) return false;
  if (query.onlyNew && !sale.isNew) return false;
  if (query.minDiscount > 0 && discountPercent(sale.price, sale.oldPrice) < query.minDiscount) {
    return false;
  }
  if (query.minPrice !== null && sale.price < query.minPrice) return false;
  if (query.maxPrice !== null && sale.price > query.maxPrice) return false;
  return true;
};

const compare = (a: Sale, b: Sale, sort: SalesSort): number => {
  switch (sort) {
    case "new":
      return Number(Boolean(b.isNew)) - Number(Boolean(a.isNew));
    case "discount":
      return discountPercent(b.price, b.oldPrice) - discountPercent(a.price, a.oldPrice);
    case "priceAsc":
      return a.price - b.price;
    case "priceDesc":
      return b.price - a.price;
    case "name":
      return 0;
  }
};

/** Filters and orders sales; ties always fall back to the name so the order is stable. */
export const applySalesQuery = (sales: Sale[], query: SalesQuery, locale = "en"): Sale[] =>
  sales
    .filter((sale) => keeps(sale, query))
    .sort(
      (a, b) =>
        compare(a, b, query.sort) || a.name.localeCompare(b.name, locale, { numeric: true }),
    );
