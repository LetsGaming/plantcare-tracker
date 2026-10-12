import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  FAILURE_BACKOFF_BASE_MS,
  PRUNE_INTERVAL_MS,
  SalesRefresher,
  type SalesRefresherOptions,
} from '../../../src/modules/sales/application/SalesRefresher';
import type { RawSaleItem } from '../../../src/modules/sales/domain/Sale';
import type {
  SalesRepository,
  SalesSourceState,
  SalesSourceStatePatch,
} from '../../../src/modules/sales/domain/SalesRepository';
import type { FetchOptions, SalesSource } from '../../../src/modules/sales/domain/SalesSource';

const MINUTE = 60 * 1000;
const INTERVAL = 120 * MINUTE;
const T0 = Date.UTC(2026, 9, 12, 8, 0, 0);

type Page = RawSaleItem[] | Error;

const item = (n: number): RawSaleItem => ({
  name: `Plant ${n}`,
  link: `https://shop.example/products/${n}`,
  img: null,
  oldPrice: 20,
  newPrice: 10,
});

type FetchPage = (page: number, options?: FetchOptions) => Promise<RawSaleItem[]>;

interface FakeSource extends SalesSource {
  fetchPage: Mock<FetchPage>;
}

const fakeSource = (
  key: string,
  pages: Page[],
  overrides: Partial<SalesSource> = {},
  onFetch?: () => void,
): FakeSource => ({
  key,
  seller: `Seller ${key}`,
  priority: 1,
  maxPages: pages.length,
  useChromium: false,
  ...overrides,
  fetchPage: vi.fn<FetchPage>(async (page) => {
    onFetch?.();
    const result = pages[page - 1] ?? [];
    if (result instanceof Error) throw result;
    return result;
  }),
});

const fakeRepository = (initial: SalesSourceState[] = []) => {
  const states = new Map(initial.map((state) => [state.source_key, state]));
  const fns = {
    applySourceSnapshot: vi.fn<SalesRepository['applySourceSnapshot']>(
      async (_key, _seller, sales) => ({
        upserted: sales.length,
        pricePointsAdded: 0,
        deactivated: 0,
      }),
    ),
    deactivateSource: vi.fn<SalesRepository['deactivateSource']>(async () => 0),
    pruneRetention: vi.fn<SalesRepository['pruneRetention']>(async () => ({
      items: 0,
      pricePoints: 0,
    })),
    getSourceState: vi.fn<SalesRepository['getSourceState']>(
      async (key) => states.get(key) ?? null,
    ),
    setSourceState: vi.fn(async (key: string, patch: SalesSourceStatePatch) => {
      states.set(key, {
        source_key: key,
        last_attempt_at: null,
        last_success_at: null,
        consecutive_failures: 0,
        next_due_at: null,
        ...states.get(key),
        ...patch,
      });
    }),
    pageActive: vi.fn(),
    findById: vi.fn(),
    history: vi.fn(),
    summary: vi.fn(),
  };
  return { fns, states, repo: fns as unknown as SalesRepository };
};

const state = (key: string, nextDueAt: number | null): SalesSourceState => ({
  source_key: key,
  last_attempt_at: null,
  last_success_at: null,
  consecutive_failures: 0,
  next_due_at: nextDueAt,
});

const options = (overrides: Partial<SalesRefresherOptions> = {}): SalesRefresherOptions => ({
  intervalMs: INTERVAL,
  warmDelayMs: 5000,
  random: () => 0.5,
  ...overrides,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

let refresher: SalesRefresher | undefined;

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
});

afterEach(async () => {
  await refresher?.stop();
  refresher = undefined;
  vi.useRealTimers();
});

describe('SalesRefresher runs', () => {
  it('shares one scrape between concurrent refreshes of a source', async () => {
    const gate = deferred<RawSaleItem[]>();
    const source = fakeSource('a', [[item(1)]]);
    source.fetchPage.mockImplementationOnce(() => gate.promise);
    const { fns, repo } = fakeRepository();
    refresher = new SalesRefresher([source], repo, options());

    const first = refresher.refreshSource('a');
    const second = refresher.refreshSource('a');
    expect(second).toBe(first);

    gate.resolve([item(1)]);
    await first;
    expect(source.fetchPage).toHaveBeenCalledTimes(1);
    expect(fns.applySourceSnapshot).toHaveBeenCalledTimes(1);

    await refresher.refreshSource('a');
    expect(source.fetchPage).toHaveBeenCalledTimes(2);
  });

  it('fetches pages in order, bypassing the cache, and stops at the first empty page', async () => {
    const source = fakeSource('a', [[item(1), item(2)], [item(2), item(3)], [], [item(9)]]);
    const { fns, repo } = fakeRepository();
    refresher = new SalesRefresher([source], repo, options());

    const outcome = await refresher.refreshSource('a');

    expect(source.fetchPage.mock.calls).toEqual([
      [1, { bypassCache: true }],
      [2, { bypassCache: true }],
      [3, { bypassCache: true }],
    ]);
    expect(outcome).toMatchObject({ status: 'success', items: 3, pages: 3 });
    const [key, seller, sales] = fns.applySourceSnapshot.mock.calls[0];
    expect([key, seller]).toEqual(['a', 'Seller a']);
    expect(sales.map((sale) => sale.sale_name)).toEqual(['Plant 1', 'Plant 2', 'Plant 3']);
  });

  it('stamps every sale with the time its page returned', async () => {
    let clock = T0;
    const source = fakeSource('a', [[item(1)], [item(2)]], {}, () => (clock += 500));
    const { fns, repo } = fakeRepository();
    refresher = new SalesRefresher([source], repo, options({ now: () => clock }));

    await refresher.refreshSource('a');

    const [, , sales, runAt] = fns.applySourceSnapshot.mock.calls[0];
    expect(runAt).toBe(T0);
    expect(sales.map((sale) => sale.sale_scraped_at)).toEqual([T0 + 500, T0 + 1000]);
  });

  it('gives runs of a source in the same millisecond strictly increasing run times', async () => {
    const source = fakeSource('a', [[item(1)]]);
    const { fns, repo } = fakeRepository();
    refresher = new SalesRefresher([source], repo, options({ now: () => T0 }));

    await refresher.refreshSource('a');
    await refresher.refreshSource('a');

    expect(fns.applySourceSnapshot.mock.calls.map((call) => call[3])).toEqual([T0, T0 + 1]);
  });

  it('backs off exponentially on failures and keeps the stored items active', async () => {
    let clock = T0;
    const source = fakeSource('a', [new Error('offline')]);
    const { fns, states, repo } = fakeRepository();
    refresher = new SalesRefresher([source], repo, options({ now: () => clock }));

    const delays: number[] = [];
    for (let run = 1; run <= 5; run++) {
      const outcome = await refresher.refreshSource('a');
      expect(outcome.status).toBe('failed');
      expect(states.get('a')?.consecutive_failures).toBe(run);
      delays.push((states.get('a')?.next_due_at ?? 0) - clock);
      clock += MINUTE;
    }

    expect(delays).toEqual([
      FAILURE_BACKOFF_BASE_MS * 2,
      FAILURE_BACKOFF_BASE_MS * 4,
      FAILURE_BACKOFF_BASE_MS * 8,
      FAILURE_BACKOFF_BASE_MS * 16,
      INTERVAL,
    ]);
    expect(states.get('a')?.last_success_at).toBeNull();
    expect(fns.applySourceSnapshot).not.toHaveBeenCalled();
    expect(fns.deactivateSource).not.toHaveBeenCalled();
  });

  it('treats an empty page 1 that health reports as failing as a failure', async () => {
    const source = fakeSource('a', [[]]);
    const { fns, states, repo } = fakeRepository();
    const health = { get: () => ({ status: 'failing' as const }) };
    refresher = new SalesRefresher([source], repo, options({ health }));

    for (let run = 0; run < 3; run++) {
      expect((await refresher.refreshSource('a')).status).toBe('failed');
    }

    expect(states.get('a')?.consecutive_failures).toBe(3);
    expect(fns.deactivateSource).not.toHaveBeenCalled();
  });

  it('keeps the stored items when a later page fails', async () => {
    const source = fakeSource('a', [[item(1)], new Error('timeout'), [item(3)]]);
    const { fns, states, repo } = fakeRepository();
    refresher = new SalesRefresher([source], repo, options());

    const outcome = await refresher.refreshSource('a');

    expect(outcome.status).toBe('partial');
    expect(source.fetchPage).toHaveBeenCalledTimes(2);
    expect(fns.applySourceSnapshot).not.toHaveBeenCalled();
    expect(fns.deactivateSource).not.toHaveBeenCalled();
    expect(states.get('a')).toMatchObject({
      consecutive_failures: 1,
      next_due_at: T0 + FAILURE_BACKOFF_BASE_MS * 2,
    });
  });

  it('resets failures on success and schedules the next run within the interval plus or minus 10 percent', async () => {
    for (const random of [0, 0.5, 0.999999]) {
      const source = fakeSource('a', [[item(1)]]);
      const { states, repo } = fakeRepository([{ ...state('a', null), consecutive_failures: 4 }]);
      const local = new SalesRefresher([source], repo, options({ random, now: () => T0 }));

      await local.refreshSource('a');

      const saved = states.get('a');
      expect(saved).toMatchObject({
        consecutive_failures: 0,
        last_success_at: T0,
        last_attempt_at: T0,
      });
      const delay = (saved?.next_due_at ?? 0) - T0;
      expect(delay).toBeGreaterThanOrEqual(INTERVAL * 0.9);
      expect(delay).toBeLessThanOrEqual(INTERVAL * 1.1);
      if (random === 0) expect(delay).toBe(INTERVAL * 0.9);
      await local.stop();
    }
  });

  it('deactivates a source after three empty runs in a row', async () => {
    const pages: Page[] = [[]];
    const source = fakeSource('a', pages);
    source.fetchPage.mockImplementation(async () => {
      const result = pages[0];
      if (result instanceof Error) throw result;
      return result;
    });
    const { fns, repo } = fakeRepository();
    refresher = new SalesRefresher([source], repo, options());

    await refresher.refreshSource('a');
    await refresher.refreshSource('a');
    pages[0] = [item(1)];
    await refresher.refreshSource('a');
    pages[0] = [];
    await refresher.refreshSource('a');
    await refresher.refreshSource('a');
    expect(fns.deactivateSource).not.toHaveBeenCalled();

    const outcome = await refresher.refreshSource('a');
    expect(outcome.status).toBe('empty');
    expect(fns.deactivateSource).toHaveBeenCalledTimes(1);
    expect(fns.deactivateSource).toHaveBeenCalledWith('a');
    expect(fns.applySourceSnapshot).toHaveBeenCalledTimes(1);
  });

  it('prunes retention at most once per hour', async () => {
    let clock = T0;
    const source = fakeSource('a', [[item(1)]]);
    const { fns, repo } = fakeRepository();
    refresher = new SalesRefresher([source], repo, options({ now: () => clock }));

    await refresher.refreshSource('a');
    clock += 10 * MINUTE;
    await refresher.refreshSource('a');
    clock = T0 + PRUNE_INTERVAL_MS - 1;
    await refresher.refreshSource('a');
    expect(fns.pruneRetention).toHaveBeenCalledTimes(1);

    clock = T0 + PRUNE_INTERVAL_MS;
    await refresher.refreshSource('a');
    expect(fns.pruneRetention).toHaveBeenCalledTimes(2);
    expect(fns.pruneRetention).toHaveBeenLastCalledWith(T0 + PRUNE_INTERVAL_MS);
  });

  it('rejects unknown sources', async () => {
    const { repo } = fakeRepository();
    refresher = new SalesRefresher([], repo, options());
    await expect(refresher.refreshSource('nope')).rejects.toThrow(/not found/);
  });
});

describe('SalesRefresher scheduling', () => {
  it('warms up only stale sources, staggered in priority order', async () => {
    const stale = fakeSource('stale', [[item(1)]], { priority: 2 });
    const never = fakeSource('never', [[item(2)]], { priority: 1 });
    const fresh = fakeSource('fresh', [[item(3)]], { priority: 0 });
    const { repo } = fakeRepository([
      state('stale', T0 - MINUTE),
      state('fresh', T0 + 30 * MINUTE),
    ]);
    refresher = new SalesRefresher([stale, never, fresh], repo, options());

    await refresher.start();
    expect(vi.getTimerCount()).toBe(3);

    await vi.advanceTimersByTimeAsync(4999);
    expect(never.fetchPage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(never.fetchPage).toHaveBeenCalledTimes(1);
    expect(stale.fetchPage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);
    expect(stale.fetchPage).toHaveBeenCalledTimes(1);
    expect(fresh.fetchPage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    expect(fresh.fetchPage).toHaveBeenCalledTimes(1);
  });

  it('chains the next run of a source at its next due time', async () => {
    const source = fakeSource('a', [[item(1)]]);
    const failing = fakeSource('b', [new Error('down')], { priority: 2 });
    const { states, repo } = fakeRepository();
    refresher = new SalesRefresher([source, failing], repo, options({ warmDelayMs: 0 }));

    await refresher.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(source.fetchPage).toHaveBeenCalledTimes(1);
    expect(failing.fetchPage).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(2);

    const retryIn = (states.get('b')?.next_due_at ?? 0) - Date.now();
    await vi.advanceTimersByTimeAsync(retryIn);
    expect(failing.fetchPage).toHaveBeenCalledTimes(2);

    const dueIn = (states.get('a')?.next_due_at ?? 0) - Date.now();
    await vi.advanceTimersByTimeAsync(dueIn - 1);
    expect(source.fetchPage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(source.fetchPage).toHaveBeenCalledTimes(2);
  });

  it('leaves no timers after stop and starts no new runs', async () => {
    const sources = ['a', 'b', 'c'].map((key) => fakeSource(key, [[item(1)]]));
    const { repo } = fakeRepository([state('c', T0 + MINUTE)]);
    refresher = new SalesRefresher(sources, repo, options());

    await refresher.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    await refresher.stop();
    expect(vi.getTimerCount()).toBe(0);

    expect((await refresher.refreshSource('a')).status).toBe('skipped');
    await vi.advanceTimersByTimeAsync(INTERVAL * 2);
    expect(sources.map((source) => source.fetchPage.mock.calls.length)).toEqual([1, 0, 0]);
  });

  it('does not reschedule a run that finishes after stop', async () => {
    const gate = deferred<RawSaleItem[]>();
    const source = fakeSource('a', [[item(1)]]);
    source.fetchPage.mockImplementationOnce(() => gate.promise);
    const { fns, repo } = fakeRepository();
    refresher = new SalesRefresher([source], repo, options({ warmDelayMs: 0 }));

    await refresher.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(source.fetchPage).toHaveBeenCalledTimes(1);

    const stopping = refresher.stop();
    gate.resolve([item(1)]);
    await stopping;

    expect(vi.getTimerCount()).toBe(0);
    expect(fns.applySourceSnapshot).not.toHaveBeenCalled();
  });
});
