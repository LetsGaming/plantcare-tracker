// Frontend types for the Sales domain.
//
// GET /sales streams the stored sales over SSE: each message event carries an
// array of APISale, and a final "done" event carries { total }. Times are epoch ms.

/** Frozen frontend model for a sale item */
interface Sale {
  readonly id: string;
  /** Truncated display name (max 45 chars) */
  readonly name: string;
  /** Full, untruncated name */
  readonly nameFull: string;
  readonly seller: string;
  readonly price: number;
  /** Null when the shop shows no previous price. */
  readonly oldPrice: number | null;
  readonly discountPct: number | null;
  readonly link: string;
  /** Undefined for missing images and for generated letter tiles. */
  readonly imageUrl?: string;
  /** Epoch ms when the server first saw this item. */
  readonly firstSeenAt: number;
  /** Epoch ms of the page fetch that last saw this item. */
  readonly scrapedAt: number;
  /** Lowercase full name and seller; the only text a sales search matches. */
  readonly searchKey: string;
}

/** A price point stored in the local price history cache */
interface PricePoint {
  price: number;
  timestamp: number;
}

// ── V2 API shapes ─────────────────────────────────────────────────────────────

/** One sale as the SSE replay and GET /sales/:id send it. */
interface APISale {
  sale_id: string;
  sale_name: string;
  sale_seller: string;
  sale_link: string;
  sale_image_url: string | null;
  sale_old_price: number | null;
  sale_new_price: number;
  sale_discount_pct: number | null;
  /** Epoch ms. */
  sale_first_seen_at: number;
  /** Epoch ms. */
  sale_scraped_at: number;
}

/** One stored price observation; `observed_at` in epoch ms. */
interface APISalePricePoint {
  price: number;
  observed_at: number;
}

/** GET /sales/:id: the sale plus up to 30 price points, oldest first. */
interface APISaleDetail extends APISale {
  history: APISalePricePoint[];
}

/** GET /sales/summary?since=<ms> */
interface APISalesSummary {
  total: number;
  new_since: number;
  /** Null until the server has refreshed any source. */
  refreshed_at: number | null;
  latest_first_seen_at: number | null;
}

/** Frozen price point; `observedAt` in epoch ms. */
interface SalePricePoint {
  readonly price: number;
  readonly observedAt: number;
}

/** Payload of the SSE "done" event on the sales stream */
interface SalesDonePayload {
  total: number;
}
