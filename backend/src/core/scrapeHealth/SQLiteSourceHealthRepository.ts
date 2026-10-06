/**
 * core/scrapeHealth/SQLiteSourceHealthRepository.ts
 */

import { query, execute } from '../database/db';
import type { SourceHealth, SourceHealthRepository } from './SourceHealth';

const COLUMNS = `source_key, kind, seller, status, active_strategy, last_item_count,
  consecutive_failures, last_success_at, last_failure_at, last_error, updated_at`;

export class SQLiteSourceHealthRepository implements SourceHealthRepository {
  findAll(): SourceHealth[] {
    return query<SourceHealth>(
      `SELECT ${COLUMNS} FROM scrape_source_health ORDER BY source_key`,
    );
  }

  findByKey(key: string): SourceHealth | null {
    const rows = query<SourceHealth>(
      `SELECT ${COLUMNS} FROM scrape_source_health WHERE source_key = ?`,
      [key],
    );
    return rows[0] ?? null;
  }

  upsert(row: SourceHealth): void {
    execute(
      `INSERT INTO scrape_source_health (${COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
         updated_at = excluded.updated_at`,
      [
        row.source_key,
        row.kind,
        row.seller,
        row.status,
        row.active_strategy,
        row.last_item_count,
        row.consecutive_failures,
        row.last_success_at,
        row.last_failure_at,
        row.last_error,
        row.updated_at,
      ],
    );
  }
}
