/**
 * mapping/SaleMapping.ts
 *
 * Maps V2 API sale shapes to frontend models.
 *
 * V2 source type (APISale):
 *   sale_id, sale_name, sale_seller, sale_new_price, sale_old_price,
 *   sale_link, sale_image_url (string|null|undefined), sale_scraped_at (optional)
 *
 * Sales are received over SSE — each `message` event carries a single APISale.
 */
export default class SaleMapper {
  /**
   * Maps a single V2 APISale to the frontend Sale model.
   *
   * name is truncated to 45 characters for display. nameFull retains
   * the original untruncated value for tooltips and detail views.
   */
  static mapSale(sale: APISale): Sale {
    return {
      id: sale.sale_id,
      name: sale.sale_name.length > 45 ? `${sale.sale_name.slice(0, 42)}...` : sale.sale_name,
      nameFull: sale.sale_name,
      seller: sale.sale_seller,
      price: sale.sale_new_price,
      oldPrice: sale.sale_old_price,
      link: sale.sale_link,
      imageUrl: sale.sale_image_url ?? undefined,
      scrapedAt: sale.sale_scraped_at,
    };
  }

  /**
   * Converts a V2 API response (single item or array) to Sale[].
   */
  static convertToSales(response: APISale | APISale[]): Sale[] {
    return Array.isArray(response)
      ? response.map((s) => this.mapSale(s))
      : [this.mapSale(response)];
  }
}
