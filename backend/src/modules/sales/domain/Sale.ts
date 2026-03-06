/**
 * modules/sales/domain/Sale.ts
 *
 * The Sale entity. Pure TypeScript — zero framework dependencies.
 * Business invariants (valid link, valid price) are enforced here.
 */

import crypto from 'crypto';

export interface RawSaleItem {
  name?: string | null;
  link?: string | null;
  img?: string | null;
  oldPrice?: number | null;
  newPrice?: number | null;
}

export interface SaleData {
  sale_id: string;
  sale_name: string;
  sale_seller: string;
  sale_link: string;
  sale_image_url: string | null;
  sale_old_price: number | null;
  sale_new_price: number;
  sale_scraped_at: string;
}

export class Sale {
  public readonly sale_id: string;
  public readonly sale_name: string;
  public readonly sale_seller: string;
  public readonly sale_link: string;
  public readonly sale_image_url: string | null;
  public readonly sale_old_price: number | null;
  public readonly sale_new_price: number;
  public readonly sale_scraped_at: string;

  private constructor(data: SaleData) {
    this.sale_id = data.sale_id;
    this.sale_name = data.sale_name;
    this.sale_seller = data.sale_seller;
    this.sale_link = data.sale_link;
    this.sale_image_url = data.sale_image_url;
    this.sale_old_price = data.sale_old_price;
    this.sale_new_price = data.sale_new_price;
    this.sale_scraped_at = data.sale_scraped_at;
  }

  /**
   * Factory: builds a Sale from raw scraper output.
   * Returns null if the item lacks required fields (link, newPrice).
   */
  static fromRaw(raw: RawSaleItem, seller: string): Sale | null {
    if (!raw.link || !raw.newPrice) return null;

    return new Sale({
      sale_id: Sale.generateId(seller, raw.link),
      sale_name: raw.name?.trim() ?? 'Unnamed Product',
      sale_seller: seller,
      sale_link: raw.link,
      sale_image_url: raw.img ?? null,
      sale_old_price: raw.oldPrice ?? null,
      sale_new_price: raw.newPrice,
      sale_scraped_at: new Date().toISOString(),
    });
  }

  toJSON(): SaleData {
    return {
      sale_id: this.sale_id,
      sale_name: this.sale_name,
      sale_seller: this.sale_seller,
      sale_link: this.sale_link,
      sale_image_url: this.sale_image_url,
      sale_old_price: this.sale_old_price,
      sale_new_price: this.sale_new_price,
      sale_scraped_at: this.sale_scraped_at,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private static normalizeUrl(url: string): string {
    try {
      const u = new URL(url);
      u.protocol = 'https:';
      u.hostname = u.hostname.replace(/^www\./, '');
      u.hash = '';
      u.search = '';
      u.pathname = u.pathname.replace(/\/$/, '');
      return u.toString().toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  private static generateId(seller: string, link: string): string {
    const normalized = Sale.normalizeUrl(link);
    return crypto
      .createHash('sha1')
      .update(`${seller.toLowerCase()}|${normalized}`)
      .digest('hex');
  }
}
