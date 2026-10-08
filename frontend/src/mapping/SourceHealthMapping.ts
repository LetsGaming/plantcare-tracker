/**
 * mapping/SourceHealthMapping.ts
 *
 * Maps scrape source health rows from the API to the frontend model.
 */

import { statusRank } from "@/utils/sourceStatus";

export default class SourceHealthMapper {
  static mapSourceHealth(row: APISourceHealth): SourceHealth {
    return {
      key: row.source_key,
      kind: row.kind,
      seller: row.seller,
      status: row.status,
      strategy: row.active_strategy,
      itemCount: row.last_item_count,
      consecutiveFailures: row.consecutive_failures,
      lastSuccessAt: row.last_success_at ?? undefined,
      lastFailureAt: row.last_failure_at ?? undefined,
      lastError: row.last_error ?? undefined,
    };
  }

  /** Orders sources so those needing attention come first. */
  static sortByAttention(sources: SourceHealth[]): SourceHealth[] {
    return [...sources].sort(
      (a, b) => statusRank(a.status) - statusRank(b.status) || a.seller.localeCompare(b.seller),
    );
  }

  static convertToSourceHealth(rows: APISourceHealth[]): SourceHealth[] {
    return this.sortByAttention(rows.map((row) => this.mapSourceHealth(row)));
  }
}
