// ─────────────────────────────────────────────────────────────────────────────
// saleTypes.d.ts
//
// Frontend types for the Sales domain.
//
// V2 API shape (APISale):
//   sale_id, sale_name, sale_seller, sale_new_price, sale_old_price,
//   sale_link, sale_image_url (string|null), sale_scraped_at (optional)
//
// Sales are streamed over SSE — each message event carries a single APISale.
// The SSE stream ends with a "done" event: { total: number }
// ─────────────────────────────────────────────────────────────────────────────

/** Frontend model for a sale item */
interface Sale {
  id: string;
  /** Truncated display name (max 45 chars) */
  name: string;
  /** Full, untruncated name */
  nameFull: string;
  seller: string;
  price: number;
  oldPrice: number;
  link: string;
  imageUrl?: string;
  /** ISO timestamp of when the scraper last saw this item */
  scrapedAt?: string;
  /** True if this sale was not present in the previous session's cache */
  isNew?: boolean;
}

/** A price point stored in the local price history cache */
interface PricePoint {
  price: number;
  timestamp: number;
}

// ── V2 API shapes ─────────────────────────────────────────────────────────────

/**
 * Raw sale object as emitted per SSE message event from GET /sales.
 * Each `message` event carries a single APISale (not an array).
 */
interface APISale {
  sale_id: string;
  sale_name: string;
  sale_seller: string;
  sale_new_price: number;
  sale_old_price: number;
  sale_link: string;
  sale_image_url?: string | null;
  /** Present when the scraper timestamp is available */
  sale_scraped_at?: string;
}

/** Payload of the SSE "done" event on the sales stream */
interface SalesDonePayload {
  total: number;
}
