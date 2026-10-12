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

/** A persisted `sales_items` row; times are epoch milliseconds. */
export interface SaleRow {
  sale_id: string;
  source_key: string;
  seller: string;
  name: string;
  link: string;
  image_url: string | null;
  old_price: number | null;
  new_price: number;
  discount_pct: number | null;
  first_seen_at: number;
  last_seen_at: number;
  scraped_at: number;
  active: number;
}

/** API shape of a sale; times are epoch milliseconds. */
export interface SaleDto {
  sale_id: string;
  sale_name: string;
  sale_seller: string;
  sale_link: string;
  sale_image_url: string | null;
  sale_old_price: number | null;
  sale_new_price: number;
  sale_discount_pct: number | null;
  sale_first_seen_at: number;
  sale_scraped_at: number;
}

interface SaleProps {
  sale_id: string;
  sale_name: string;
  sale_seller: string;
  sale_link: string;
  sale_image_url: string | null;
  sale_old_price: number | null;
  sale_new_price: number;
  sale_discount_pct: number | null;
  sale_scraped_at: number;
}

const isPrice = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Whole-number discount of `newPrice` against `oldPrice`; null without an old price. */
export const discountPercent = (newPrice: number, oldPrice: number | null): number | null => {
  if (oldPrice === null) return null;
  if (!(oldPrice > newPrice) || !(oldPrice > 0)) return 0;
  return Math.round((1 - newPrice / oldPrice) * 100);
};

export class Sale {
  public readonly sale_id: string;
  public readonly sale_name: string;
  public readonly sale_seller: string;
  public readonly sale_link: string;
  public readonly sale_image_url: string | null;
  public readonly sale_old_price: number | null;
  public readonly sale_new_price: number;
  public readonly sale_discount_pct: number | null;
  /** Time the page holding this item was fetched, epoch milliseconds. */
  public readonly sale_scraped_at: number;

  private constructor(props: SaleProps) {
    this.sale_id = props.sale_id;
    this.sale_name = props.sale_name;
    this.sale_seller = props.sale_seller;
    this.sale_link = props.sale_link;
    this.sale_image_url = props.sale_image_url;
    this.sale_old_price = props.sale_old_price;
    this.sale_new_price = props.sale_new_price;
    this.sale_discount_pct = props.sale_discount_pct;
    this.sale_scraped_at = props.sale_scraped_at;
  }

  /**
   * Builds a Sale from raw scraper output stamped with the fetch time of its
   * page. Returns null without a link, without a positive new price, or when
   * a given price is not a finite non-negative number.
   */
  static fromRaw(raw: RawSaleItem, seller: string, scrapedAt: number): Sale | null {
    if (!raw.link || !isPrice(raw.newPrice) || raw.newPrice === 0) return null;
    const oldPrice = raw.oldPrice ?? null;
    if (oldPrice !== null && !isPrice(oldPrice)) return null;

    return new Sale({
      sale_id: Sale.generateId(seller, raw.link),
      sale_name: raw.name?.trim() ?? 'Unnamed Product',
      sale_seller: seller,
      sale_link: raw.link,
      sale_image_url: raw.img ?? null,
      sale_old_price: oldPrice,
      sale_new_price: raw.newPrice,
      sale_discount_pct: discountPercent(raw.newPrice, oldPrice),
      sale_scraped_at: scrapedAt,
    });
  }

  static toDto(row: SaleRow): SaleDto {
    return {
      sale_id: row.sale_id,
      sale_name: row.name,
      sale_seller: row.seller,
      sale_link: row.link,
      sale_image_url: row.image_url,
      sale_old_price: row.old_price,
      sale_new_price: row.new_price,
      sale_discount_pct: row.discount_pct,
      sale_first_seen_at: row.first_seen_at,
      sale_scraped_at: row.scraped_at,
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
      // Shopify serves one product under /products/<h>, /collections/<c>/products/<h>
      // and locale prefixes; ids must not depend on which path a strategy saw.
      const shopifyProduct = u.pathname.match(/\/products\/[^/]+/);
      u.pathname = (shopifyProduct ? shopifyProduct[0] : u.pathname).replace(/\/$/, '');
      return u.toString().toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  private static generateId(seller: string, link: string): string {
    const normalized = Sale.normalizeUrl(link);
    return crypto.createHash('sha1').update(`${seller.toLowerCase()}|${normalized}`).digest('hex');
  }
}
