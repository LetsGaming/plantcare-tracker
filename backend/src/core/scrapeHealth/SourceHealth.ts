/**
 * core/scrapeHealth/SourceHealth.ts
 *
 * Health model for scrape sources. A source is "ok" while its primary
 * extraction strategy works, "degraded" while a fallback carries it, and
 * "failing" when no strategy produced usable data.
 */

export type StrategyName = 'shopifyJson' | 'jsonLd' | 'selector' | 'heuristic';

export type HealthStatus = 'ok' | 'degraded' | 'failing' | 'unknown';

export type HealthKind = 'sales' | 'search';

export interface SourceHealth {
  source_key: string;
  kind: HealthKind;
  seller: string;
  status: HealthStatus;
  active_strategy: StrategyName | null;
  last_item_count: number | null;
  consecutive_failures: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  updated_at: string;
}

export interface ScrapeOutcome {
  key: string;
  seller: string;
  kind: HealthKind;
  /** Strategy that produced the accepted result, null when none did. */
  strategy: StrategyName | null;
  /** True when the accepted strategy is not the source's primary one. */
  usedFallback: boolean;
  itemCount: number;
  error?: string | null;
}

export const statusFromOutcome = (outcome: ScrapeOutcome): HealthStatus => {
  if (!outcome.strategy) return 'failing';
  return outcome.usedFallback ? 'degraded' : 'ok';
};

/** Port the scrapers use to report results; keeps them free of persistence. */
export interface SourceHealthReporter {
  record(outcome: ScrapeOutcome): void;
}

export interface SourceHealthRepository {
  findAll(): SourceHealth[];
  findByKey(key: string): SourceHealth | null;
  upsert(row: SourceHealth): void;
}
