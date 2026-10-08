/**
 * tests/unit/core/SourceHealthTracker.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SourceHealthTracker,
  statusFromOutcome,
  type ScrapeOutcome,
  type SourceHealth,
  type SourceHealthRepository,
} from '../../../src/core/scrapeHealth';

class InMemoryRepository implements SourceHealthRepository {
  readonly rows = new Map<string, SourceHealth>();
  failOnUpsert = false;

  findAll() {
    return [...this.rows.values()];
  }
  findByKey(key: string) {
    return this.rows.get(key) ?? null;
  }
  upsert(row: SourceHealth) {
    if (this.failOnUpsert) throw new Error('disk full');
    this.rows.set(row.source_key, row);
  }
}

const outcome = (overrides: Partial<ScrapeOutcome> = {}): ScrapeOutcome => ({
  key: 'jungleLeaves',
  seller: 'Jungle Leaves',
  kind: 'sales',
  strategy: 'shopifyJson',
  usedFallback: false,
  itemCount: 3,
  issues: [],
  ...overrides,
});

describe('statusFromOutcome', () => {
  it('maps primary, fallback and no strategy to ok, degraded and failing', () => {
    expect(statusFromOutcome(outcome())).toBe('ok');
    expect(statusFromOutcome(outcome({ strategy: 'selector', usedFallback: true }))).toBe(
      'degraded',
    );
    expect(statusFromOutcome(outcome({ strategy: null }))).toBe('failing');
  });

  it('degrades a working primary strategy that reports field issues', () => {
    expect(
      statusFromOutcome(outcome({ issues: [{ code: 'images_missing', affected: 12, total: 19 }] })),
    ).toBe('degraded');
  });
});

describe('SourceHealthTracker', () => {
  let repo: InMemoryRepository;
  let clock: Date;
  let tracker: SourceHealthTracker;

  beforeEach(() => {
    repo = new InMemoryRepository();
    clock = new Date('2026-10-06T10:00:00.000Z');
    tracker = new SourceHealthTracker(repo, () => clock);
  });

  it('records a healthy run', () => {
    tracker.record(outcome());

    expect(repo.findByKey('jungleLeaves')).toMatchObject({
      status: 'ok',
      active_strategy: 'shopifyJson',
      last_item_count: 3,
      consecutive_failures: 0,
      last_success_at: '2026-10-06T10:00:00.000Z',
      last_failure_at: null,
    });
  });

  it('counts consecutive failures and keeps the last success time', () => {
    tracker.record(outcome());
    clock = new Date('2026-10-06T11:00:00.000Z');
    tracker.record(outcome({ strategy: null, itemCount: 0, error: 'selector: no items found' }));
    clock = new Date('2026-10-06T12:00:00.000Z');
    tracker.record(outcome({ strategy: null, itemCount: 0, error: 'selector: no items found' }));

    expect(repo.findByKey('jungleLeaves')).toMatchObject({
      status: 'failing',
      consecutive_failures: 2,
      last_success_at: '2026-10-06T10:00:00.000Z',
      last_failure_at: '2026-10-06T12:00:00.000Z',
      last_error: 'selector: no items found',
    });
  });

  it('resets the failure streak on recovery but keeps the last error for reference', () => {
    tracker.record(outcome({ strategy: null, itemCount: 0, error: 'boom' }));
    clock = new Date('2026-10-06T11:00:00.000Z');
    tracker.record(outcome());

    expect(repo.findByKey('jungleLeaves')).toMatchObject({
      status: 'ok',
      consecutive_failures: 0,
      last_error: 'boom',
      last_success_at: '2026-10-06T11:00:00.000Z',
    });
  });

  it('marks a fallback run as degraded without counting it as a failure', () => {
    tracker.record(
      outcome({
        strategy: 'selector',
        usedFallback: true,
        error: 'shopifyJson: products.json unavailable',
      }),
    );

    expect(repo.findByKey('jungleLeaves')).toMatchObject({
      status: 'degraded',
      consecutive_failures: 0,
    });
  });

  it('never throws when persistence fails', () => {
    repo.failOnUpsert = true;
    expect(() => tracker.record(outcome())).not.toThrow();
  });

  it('lists stored rows plus unknown placeholders for sources never scraped', () => {
    tracker.record(outcome());

    const list = tracker.list([
      { key: 'jungleLeaves', seller: 'Jungle Leaves', kind: 'sales' },
      { key: 'plnts', seller: 'PLNTS', kind: 'sales' },
    ]);

    expect(list.map((r) => [r.source_key, r.status])).toEqual([
      ['jungleLeaves', 'ok'],
      ['plnts', 'unknown'],
    ]);
  });
});
