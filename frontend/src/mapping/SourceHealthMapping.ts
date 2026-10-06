/**
 * mapping/SourceHealthMapping.ts
 *
 * Maps scrape source health rows from the API to the frontend model.
 */

const STATUS_ORDER: Record<SourceStatus, number> = {
  failing: 0,
  degraded: 1,
  unknown: 2,
  ok: 3,
};

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

  /** Maps rows and orders them so sources needing attention come first. */
  static convertToSourceHealth(rows: APISourceHealth[]): SourceHealth[] {
    return rows
      .map((row) => this.mapSourceHealth(row))
      .sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          a.seller.localeCompare(b.seller),
      );
  }
}
