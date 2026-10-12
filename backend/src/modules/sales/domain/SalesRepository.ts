/**
 * modules/sales/domain/SalesRepository.ts
 *
 * Persistence port for scraped sales, their price history and the refresh
 * state of each source. All times are epoch milliseconds.
 */

import type { Cursor, CursorTypes, Page } from '../../../core/pagination';
import type { Sale, SaleRow } from './Sale';

/** Sort key of sales cursors: newest first by `first_seen_at`, ties by `sale_id`. */
export const SALES_SORT = 'first_seen';

/** Types a sales cursor must carry: `first_seen_at` is a number, `sale_id` a string. */
export const SALES_CURSOR_TYPES: CursorTypes = { valueType: 'number', idType: 'string' };

export interface PricePoint {
  price: number;
  observed_at: number;
}

export interface SalesSummary {
  /** Active items. */
  total: number;
  /** Active items first seen after `since`. */
  new_since: number;
  /** Latest successful refresh of any source, else the latest time any item was seen. */
  refreshed_at: number | null;
  latest_first_seen_at: number | null;
}

export interface SalesSourceState {
  source_key: string;
  last_attempt_at: number | null;
  last_success_at: number | null;
  consecutive_failures: number;
  next_due_at: number | null;
}

export type SalesSourceStatePatch = Partial<Omit<SalesSourceState, 'source_key'>>;

export interface SnapshotResult {
  upserted: number;
  pricePointsAdded: number;
  deactivated: number;
}

export interface RetentionResult {
  items: number;
  pricePoints: number;
}

export interface SalesPageRequest {
  limit: number;
  cursor: Cursor | null;
}

export interface SalesRepository {
  /**
   * Writes one scrape of a source in a single transaction: upserts every
   * sale (keeping `first_seen_at`), records a price point when the price
   * changed, and deactivates this source's items missing from `sales`. An
   * empty snapshot deactivates nothing.
   */
  applySourceSnapshot(
    sourceKey: string,
    seller: string,
    sales: readonly Sale[],
    runAt: number,
  ): Promise<SnapshotResult>;

  /** Active items, newest first; `nextCursor` resumes after the last item. */
  pageActive(request: SalesPageRequest): Promise<Page<SaleRow>>;

  findById(saleId: string): Promise<SaleRow | null>;

  /** The latest price points of a sale, oldest first. */
  history(saleId: string): Promise<PricePoint[]>;

  summary(since: number): Promise<SalesSummary>;

  /** Deletes long inactive items (with their points) and old price points. */
  pruneRetention(now: number): Promise<RetentionResult>;

  getSourceState(sourceKey: string): Promise<SalesSourceState | null>;

  /** Creates the state row when missing and updates only the given fields. */
  setSourceState(sourceKey: string, patch: SalesSourceStatePatch): Promise<void>;
}
