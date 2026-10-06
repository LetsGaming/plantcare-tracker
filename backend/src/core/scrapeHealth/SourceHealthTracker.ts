/**
 * core/scrapeHealth/SourceHealthTracker.ts
 *
 * Turns scrape outcomes into persisted per-source health. Persistence
 * problems are logged and swallowed: reporting must never break a scrape.
 */

import type {
  HealthKind,
  ScrapeOutcome,
  SourceHealth,
  SourceHealthReporter,
  SourceHealthRepository,
} from './SourceHealth';
import { statusFromOutcome } from './SourceHealth';
import { createModuleLogger } from '../logging';

const log = createModuleLogger('SourceHealthTracker');

export interface RegisteredSource {
  key: string;
  seller: string;
  kind: HealthKind;
}

export class SourceHealthTracker implements SourceHealthReporter {
  constructor(
    private readonly repo: SourceHealthRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  record(outcome: ScrapeOutcome): void {
    try {
      const previous = this.repo.findByKey(outcome.key);
      const status = statusFromOutcome(outcome);
      const timestamp = this.now().toISOString();
      const failed = status === 'failing';

      this.repo.upsert({
        source_key: outcome.key,
        kind: outcome.kind,
        seller: outcome.seller,
        status,
        active_strategy: outcome.strategy,
        last_item_count: outcome.itemCount,
        consecutive_failures: failed
          ? (previous?.consecutive_failures ?? 0) + 1
          : 0,
        last_success_at: failed ? (previous?.last_success_at ?? null) : timestamp,
        last_failure_at: failed ? timestamp : (previous?.last_failure_at ?? null),
        last_error: outcome.error ?? previous?.last_error ?? null,
        updated_at: timestamp,
      });
    } catch (err: unknown) {
      log.error(`Could not record health for ${outcome.key}`, { err });
    }
  }

  /**
   * Stored rows plus an "unknown" placeholder for registered sources that
   * have not been scraped since the table was created.
   */
  list(registered: RegisteredSource[]): SourceHealth[] {
    const rows = new Map(this.repo.findAll().map((r) => [r.source_key, r]));
    const placeholders = registered
      .filter((s) => !rows.has(s.key))
      .map<SourceHealth>((s) => ({
        source_key: s.key,
        kind: s.kind,
        seller: s.seller,
        status: 'unknown',
        active_strategy: null,
        last_item_count: null,
        consecutive_failures: 0,
        last_success_at: null,
        last_failure_at: null,
        last_error: null,
        updated_at: this.now().toISOString(),
      }));
    return [...rows.values(), ...placeholders];
  }

  get(key: string): SourceHealth | null {
    return this.repo.findByKey(key);
  }
}
