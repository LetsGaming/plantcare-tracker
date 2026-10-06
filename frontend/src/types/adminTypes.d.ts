// ─────────────────────────────────────────────────────────────────────────────
// adminTypes.d.ts
//
// Frontend types for admin-only tooling. Currently: scrape source health,
// served by GET /sales/health (admin only).
// ─────────────────────────────────────────────────────────────────────────────

type SourceStatus = "ok" | "degraded" | "failing" | "unknown";

/** "sales" sources scrape the sale listings, "search" sources find plant info links */
type SourceKind = "sales" | "search";

/** Frontend model for the health of one scrape source */
interface SourceHealth {
  key: string;
  kind: SourceKind;
  seller: string;
  status: SourceStatus;
  /** Extraction strategy that produced the last result, null when none did */
  strategy: string | null;
  itemCount: number | null;
  consecutiveFailures: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastError?: string;
}

/** Raw health row as returned by GET /sales/health */
interface APISourceHealth {
  source_key: string;
  kind: SourceKind;
  seller: string;
  status: SourceStatus;
  active_strategy: string | null;
  last_item_count: number | null;
  consecutive_failures: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  updated_at: string;
}
