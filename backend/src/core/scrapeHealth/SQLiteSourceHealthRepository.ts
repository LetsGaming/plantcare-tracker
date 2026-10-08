/**
 * core/scrapeHealth/SQLiteSourceHealthRepository.ts
 *
 * The health tracker is synchronous by design (it records from inside
 * scraper callbacks), so this store uses the raw better-sqlite3 handle.
 */

import { getSqlite } from '../database/db';
import type { SourceHealth, SourceHealthRepository, SourceIssue } from './SourceHealth';

const COLUMNS = `source_key, kind, seller, status, active_strategy, last_item_count,
  consecutive_failures, last_success_at, last_failure_at, last_error, issues, updated_at`;

type StoredHealth = Omit<SourceHealth, 'issues'> & { issues: string };

const parseIssues = (json: string): SourceIssue[] => {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as SourceIssue[]) : [];
  } catch {
    return [];
  }
};

const fromRow = (row: StoredHealth): SourceHealth => ({ ...row, issues: parseIssues(row.issues) });

export class SQLiteSourceHealthRepository implements SourceHealthRepository {
  findAll(): SourceHealth[] {
    return getSqlite()
      .prepare(`SELECT ${COLUMNS} FROM scrape_source_health ORDER BY source_key`)
      .all()
      .map((row) => fromRow(row as StoredHealth));
  }

  findByKey(key: string): SourceHealth | null {
    const row = getSqlite()
      .prepare(`SELECT ${COLUMNS} FROM scrape_source_health WHERE source_key = ?`)
      .get(key) as StoredHealth | undefined;
    return row ? fromRow(row) : null;
  }

  upsert(row: SourceHealth): void {
    getSqlite()
      .prepare(
        `INSERT INTO scrape_source_health (${COLUMNS})
         VALUES (@source_key, @kind, @seller, @status, @active_strategy, @last_item_count,
                 @consecutive_failures, @last_success_at, @last_failure_at, @last_error, @issues, @updated_at)
         ON CONFLICT(source_key) DO UPDATE SET
           kind = excluded.kind,
           seller = excluded.seller,
           status = excluded.status,
           active_strategy = excluded.active_strategy,
           last_item_count = excluded.last_item_count,
           consecutive_failures = excluded.consecutive_failures,
           last_success_at = excluded.last_success_at,
           last_failure_at = excluded.last_failure_at,
           last_error = excluded.last_error,
           issues = excluded.issues,
           updated_at = excluded.updated_at`,
      )
      .run({ ...row, issues: JSON.stringify(row.issues) });
  }
}
