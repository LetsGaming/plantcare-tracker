/**
 * mapping/SaleMapping.ts
 *
 * Maps the sales DTOs (SSE replay items, GET /sales/:id, GET /sales/summary)
 * to frozen frontend models. Times are epoch ms on both sides.
 */
const GENERATED_TILE_PREFIX = "data:image/svg";
const DISPLAY_NAME_MAX = 45;
const DISPLAY_NAME_CUT = 42;

/** Letter tiles generated instead of a photo are not photos; the app shows its own placeholder. */
const realPhoto = (url: string | null | undefined): string | undefined =>
  url && !url.startsWith(GENERATED_TILE_PREFIX) ? url : undefined;

export default class SaleMapper {
  /**
   * What a search over sales matches: the full name and the shop, never ids or links.
   * A newline separates them because a typed query cannot contain one, so no match spans both.
   */
  static searchKeyOf(nameFull: string, seller: string): string {
    return `${nameFull}\n${seller}`.toLowerCase();
  }

  /** `name` is cut to 45 characters for cards; `nameFull` keeps the original. */
  static mapSale(sale: APISale): Sale {
    const name =
      sale.sale_name.length > DISPLAY_NAME_MAX
        ? `${sale.sale_name.slice(0, DISPLAY_NAME_CUT)}...`
        : sale.sale_name;
    return Object.freeze({
      id: sale.sale_id,
      name,
      nameFull: sale.sale_name,
      seller: sale.sale_seller,
      price: sale.sale_new_price,
      oldPrice: sale.sale_old_price ?? null,
      discountPct: sale.sale_discount_pct ?? null,
      link: sale.sale_link,
      imageUrl: realPhoto(sale.sale_image_url),
      firstSeenAt: sale.sale_first_seen_at,
      scrapedAt: sale.sale_scraped_at,
      searchKey: SaleMapper.searchKeyOf(sale.sale_name, sale.sale_seller),
    });
  }

  static convertToSales(response: APISale | APISale[]): Sale[] {
    return Array.isArray(response)
      ? response.map((s) => this.mapSale(s))
      : [this.mapSale(response)];
  }

  static mapPricePoint(point: APISalePricePoint): SalePricePoint {
    return Object.freeze({ price: point.price, observedAt: point.observed_at });
  }

  /** GET /sales/:id: the sale and its price history, oldest first. */
  static mapDetail(detail: APISaleDetail): { sale: Sale; history: readonly SalePricePoint[] } {
    return {
      sale: SaleMapper.mapSale(detail),
      history: Object.freeze(
        (detail.history ?? []).map((point) => SaleMapper.mapPricePoint(point)),
      ),
    };
  }
}
