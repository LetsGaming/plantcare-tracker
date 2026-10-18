/**
 * modules/sales/application/SalesRefresher.ts
 *
 * Scrapes every sales source in the background and writes each complete run
 * as one snapshot. Requests never scrape: they read what this stored.
 */

import { Sale, type RawSaleItem } from '../domain/Sale';
import type { SalesSource } from '../domain/SalesSource';
import type {
  SalesRepository,
  SalesSourceState,
  SalesSourceStatePatch,
} from '../domain/SalesRepository';
import type { HealthStatus } from '../../../core/scrapeHealth';
import { NotFoundError } from '../../../core/errors/AppError';
import { createModuleLogger } from '../../../core/logging';
import { createScrapeLimiters, type ScrapeLimiters } from './limiter';

const log = createModuleLogger('SalesRefresher');

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
export const FAILURE_BACKOFF_BASE_MS = 5 * MINUTE_MS;
export const WARM_STAGGER_MS = 2000;
export const PRUNE_INTERVAL_MS = HOUR_MS;
export const SCHEDULE_JITTER = 0.1;
export const EMPTY_RUNS_BEFORE_DEACTIVATE = 3;
export const FAILURES_BEFORE_STALE = 3;
export const SOURCE_STALE_MS = 24 * HOUR_MS;
/** Server shutdown force-exits after 10 s, so stop() waits at most this long for writes. */
export const STOP_WRITE_WAIT_MS = 2000;
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

/**
 * - `success`: a complete run with items, written as a snapshot.
 * - `empty`: a complete run without items; nothing written.
 * - `failed`: page 1 failed; stored items stay active until the source is stale
 *   (`FAILURES_BEFORE_STALE` failures in a row and no success for `SOURCE_STALE_MS`).
 * - `partial`: page 1 worked but a later page failed; no snapshot written.
 * - `skipped`: the refresher was stopped before or during the run.
 */
export type RefreshStatus = 'success' | 'empty' | 'failed' | 'partial' | 'skipped';

export interface RefreshOutcome {
  sourceKey: string;
  status: RefreshStatus;
  /** Distinct valid sales collected. */
  items: number;
  /** Pages that returned, including the empty page that ended the run. */
  pages: number;
  runAt: number | null;
  nextDueAt: number | null;
}

/** Health lookup used to tell a failed page 1 (every strategy failed) from an empty sale. */
export interface SourceHealthLookup {
  get(key: string): { status: HealthStatus } | null;
}

export interface SalesRefresherOptions {
  intervalMs: number;
  warmDelayMs: number;
  warmStaggerMs?: number;
  health?: SourceHealthLookup;
  limiters?: ScrapeLimiters;
  now?: () => number;
  /** Returns a number in [0, 1), like Math.random. */
  random?: () => number;
}

interface PageScan {
  sales: Sale[];
  pages: number;
  failedPage: number | null;
}

export class SalesRefresher {
  private readonly byKey: Map<string, SalesSource>;
  private readonly inFlight = new Map<string, Promise<RefreshOutcome>>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly lastRunAt = new Map<string, number>();
  private readonly emptyRuns = new Map<string, number>();
  private readonly deactivated = new Set<string>();
  private readonly writes = new Set<Promise<unknown>>();
  private readonly limiters: ScrapeLimiters;
  private readonly now: () => number;
  private readonly random: () => number;
  private lastPruneAt = Number.NEGATIVE_INFINITY;
  private started = false;
  private stopped = false;

  constructor(
    private readonly sources: readonly SalesSource[],
    private readonly repo: SalesRepository,
    private readonly options: SalesRefresherOptions,
  ) {
    this.byKey = new Map(sources.map((source) => [source.key, source]));
    this.limiters = options.limiters ?? createScrapeLimiters();
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? Math.random;
  }

  /**
   * Schedules every source: sources never refreshed or overdue run after the
   * warm delay, one stagger step apart in priority order; the others at their
   * stored `next_due_at`. Runs then chain through their own next due time.
   */
  async start(): Promise<void> {
    if (this.started || this.stopped) return;
    this.started = true;

    const now = this.now();
    const warmDelay = this.options.warmDelayMs;
    const stagger = this.options.warmStaggerMs ?? WARM_STAGGER_MS;
    let staleIndex = 0;

    for (const source of this.byPriority()) {
      let dueAt: number | null = null;
      try {
        dueAt = (await this.repo.getSourceState(source.key))?.next_due_at ?? null;
      } catch (err: unknown) {
        log.error(`[${source.key}] Could not read refresh state`, { err });
      }
      if (this.stopped) return;
      if (dueAt === null || dueAt <= now) {
        this.schedule(source.key, warmDelay + staleIndex * stagger);
        staleIndex++;
      } else {
        this.schedule(source.key, dueAt - now);
      }
    }
  }

  /**
   * Clears every timer and prevents new runs. Scrapes in progress are not
   * awaited (their results are discarded); writes in progress are, for at most
   * `STOP_WRITE_WAIT_MS`.
   */
  async stop(): Promise<void> {
    this.stopped = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    if (this.writes.size === 0) return;

    let bound: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      bound = setTimeout(resolve, STOP_WRITE_WAIT_MS);
      bound.unref();
    });
    await Promise.race([Promise.allSettled([...this.writes]), timeout]);
    clearTimeout(bound);
  }

  /** Refreshes one source; a call while a run of it is in progress returns that run. */
  refreshSource(key: string): Promise<RefreshOutcome> {
    const source = this.byKey.get(key);
    if (!source) return Promise.reject(new NotFoundError('Source'));
    if (this.stopped) return Promise.resolve(skipped(key));

    const running = this.inFlight.get(key);
    if (running) return running;

    const run = this.run(source).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, run);
    return run;
  }

  /** Refreshes every source, in priority order, within the shared limits. */
  refreshAll(): Promise<RefreshOutcome[]> {
    return Promise.all(this.byPriority().map((source) => this.refreshSource(source.key)));
  }

  private byPriority(): SalesSource[] {
    return [...this.sources].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  }

  private schedule(key: string, delayMs: number): void {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(
      () => {
        this.timers.delete(key);
        void this.refreshSource(key).catch((err: unknown) =>
          log.error(`[${key}] Scheduled refresh failed`, { err }),
        );
      },
      Math.min(Math.max(0, delayMs), MAX_TIMER_DELAY_MS),
    );
    timer.unref();
    this.timers.set(key, timer);
  }

  private async run(source: SalesSource): Promise<RefreshOutcome> {
    const key = source.key;
    const runAt = Math.max(this.now(), (this.lastRunAt.get(key) ?? 0) + 1);
    this.lastRunAt.set(key, runAt);

    const scan = await this.scan(source);
    if (this.stopped) return skipped(key);

    const write =
      scan.failedPage === null
        ? this.complete(source, scan, runAt)
        : this.fail(source, scan, runAt);
    this.writes.add(write);
    let outcome: RefreshOutcome;
    try {
      outcome = await write;
    } finally {
      this.writes.delete(write);
    }

    if (this.started && !this.stopped && outcome.nextDueAt !== null) {
      this.schedule(key, outcome.nextDueAt - this.now());
    }
    return outcome;
  }

  /** Fetches pages in order until the first empty page; stops at the first failed page. */
  private async scan(source: SalesSource): Promise<PageScan> {
    const limit = source.useChromium ? this.limiters.chromium : this.limiters.http;
    const sales: Sale[] = [];
    const seen = new Set<string>();
    let pages = 0;

    for (let page = 1; page <= source.maxPages; page++) {
      if (this.stopped) break;
      let raw: RawSaleItem[];
      try {
        raw = await limit(() => source.fetchPage(page, { bypassCache: true }));
      } catch (err: unknown) {
        log.warn(`[${source.key}] Page ${page} failed`, { err });
        return { sales, pages, failedPage: page };
      }
      const fetchedAt = this.now();
      pages++;

      if (raw.length === 0) {
        // A source whose strategies all failed on page 1 reports that to health.
        if (page === 1 && this.options.health?.get(source.key)?.status === 'failing') {
          return { sales, pages, failedPage: 1 };
        }
        break;
      }

      for (const item of raw) {
        const sale = Sale.fromRaw(item, source.seller, fetchedAt);
        if (!sale || seen.has(sale.sale_id)) continue;
        seen.add(sale.sale_id);
        sales.push(sale);
      }
    }
    return { sales, pages, failedPage: null };
  }

  private async complete(
    source: SalesSource,
    scan: PageScan,
    runAt: number,
  ): Promise<RefreshOutcome> {
    const key = source.key;
    try {
      if (scan.sales.length > 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
        await this.repo.applySourceSnapshot(key, source.seller, scan.sales, runAt);
        this.emptyRuns.set(key, 0);
        this.deactivated.delete(key);
      } else {
        const empties = (this.emptyRuns.get(key) ?? 0) + 1;
        this.emptyRuns.set(key, empties);
        if (empties >= EMPTY_RUNS_BEFORE_DEACTIVATE && !this.deactivated.has(key)) {
          const count = await this.repo.deactivateSource(key);
          this.deactivated.add(key);
          log.info(`[${key}] Empty ${empties} times in a row, deactivated ${count} items`);
        }
      }
    } catch (err: unknown) {
      log.error(`[${key}] Could not store the refresh`, { err });
      return this.fail(source, scan, runAt);
    }

    const jitter = (this.random() * 2 - 1) * SCHEDULE_JITTER;
    const nextDueAt = Math.round(runAt + this.options.intervalMs * (1 + jitter));
    await this.saveState(key, {
      last_attempt_at: runAt,
      last_success_at: runAt,
      consecutive_failures: 0,
      next_due_at: nextDueAt,
    });
    await this.pruneIfDue();

    return {
      sourceKey: key,
      status: scan.sales.length > 0 ? 'success' : 'empty',
      items: scan.sales.length,
      pages: scan.pages,
      runAt,
      nextDueAt,
    };
  }

  private async fail(source: SalesSource, scan: PageScan, runAt: number): Promise<RefreshOutcome> {
    const key = source.key;
    const partial = scan.failedPage !== null && scan.failedPage > 1;
    if (partial) {
      log.warn(`[${key}] Page ${scan.failedPage} failed, keeping the stored items`);
    }

    let previous: SalesSourceState | null = null;
    try {
      previous = await this.repo.getSourceState(key);
    } catch (err: unknown) {
      log.error(`[${key}] Could not read refresh state`, { err });
    }
    const failures = (previous?.consecutive_failures ?? 0) + 1;
    const now = this.now();
    const backoff = Math.min(this.options.intervalMs, FAILURE_BACKOFF_BASE_MS * 2 ** failures);
    const nextDueAt = now + backoff;
    await this.saveState(key, {
      last_attempt_at: runAt,
      consecutive_failures: failures,
      next_due_at: nextDueAt,
    });

    const lastSuccessAt = previous?.last_success_at ?? null;
    const stale = lastSuccessAt === null || now - lastSuccessAt >= SOURCE_STALE_MS;
    if (failures >= FAILURES_BEFORE_STALE && stale && !this.deactivated.has(key)) {
      try {
        const count = await this.repo.deactivateSource(key);
        this.deactivated.add(key);
        log.warn(
          `[${key}] Failed ${failures} times without a recent success, deactivated ${count} items`,
        );
      } catch (err: unknown) {
        log.error(`[${key}] Could not deactivate the stale source`, { err });
      }
    }
    await this.pruneIfDue();

    return {
      sourceKey: key,
      status: partial ? 'partial' : 'failed',
      items: scan.sales.length,
      pages: scan.pages,
      runAt,
      nextDueAt,
    };
  }

  private async saveState(key: string, patch: SalesSourceStatePatch): Promise<void> {
    try {
      await this.repo.setSourceState(key, patch);
    } catch (err: unknown) {
      log.error(`[${key}] Could not save refresh state`, { err });
    }
  }

  private async pruneIfDue(): Promise<void> {
    const now = this.now();
    if (now - this.lastPruneAt < PRUNE_INTERVAL_MS) return;
    this.lastPruneAt = now;
    try {
      await this.repo.pruneRetention(now);
    } catch (err: unknown) {
      log.error('Could not prune old sales', { err });
    }
  }
}

const skipped = (sourceKey: string): RefreshOutcome => ({
  sourceKey,
  status: 'skipped',
  items: 0,
  pages: 0,
  runAt: null,
  nextDueAt: null,
});
