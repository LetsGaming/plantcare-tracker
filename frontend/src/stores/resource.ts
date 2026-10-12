import Utils from "@/utils/utils";

export type ResourceStatus = "idle" | "loading" | "ready" | "error";

/** State every fetched collection carries. */
export const resourceState = () => ({
  status: "idle" as ResourceStatus,
  /** Epoch millis of the last successful fetch or hydrated snapshot. */
  fetchedAt: null as number | null,
});

export const isStale = (fetchedAt: number | null): boolean =>
  fetchedAt === null || Utils.isCacheExpired(fetchedAt);

let epochValue = 0;
let epochController = new AbortController();
const abortListeners = new Set<() => void>();

/**
 * Session epoch: bumped when an account ends. Work started in an older epoch
 * must not commit its result (state or storage).
 */
export const epoch = {
  current: (): number => epochValue,
  isStale: (captured: number): boolean => captured !== epochValue,
  /** Aborted by the next `abortAll`; every request and stream links to it. */
  signal: (): AbortSignal => epochController.signal,
  /** Ends the epoch: aborts every in-flight request and stream, then notifies listeners. */
  abortAll(): number {
    epochValue += 1;
    const ended = epochController;
    epochController = new AbortController();
    ended.abort();
    for (const listener of [...abortListeners]) listener();
    return epochValue;
  },
  /** Runs `listener` on every `abortAll`; returns the unsubscribe function. */
  onAbortAll(listener: () => void): () => void {
    abortListeners.add(listener);
    return () => {
      abortListeners.delete(listener);
    };
  },
};

export interface RequestScope {
  signal: AbortSignal;
  /** True when the timeout, not the caller or the epoch, ended the request. */
  readonly timedOut: boolean;
  dispose(): void;
}

/**
 * One abort signal that fires on the timeout, the caller's signal or the
 * epoch ending, whichever comes first.
 */
export const requestScope = (timeoutMs: number, callerSignal?: AbortSignal): RequestScope => {
  const controller = new AbortController();
  const sources = [callerSignal, epoch.signal()].filter((s): s is AbortSignal => !!s);
  let timedOut = false;
  const abort = () => controller.abort();

  for (const source of sources) {
    if (source.aborted) controller.abort();
    else source.addEventListener("abort", abort, { once: true });
  }
  const timer = setTimeout(() => {
    if (controller.signal.aborted) return;
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut;
    },
    dispose() {
      clearTimeout(timer);
      for (const source of sources) source.removeEventListener("abort", abort);
    },
  };
};

interface Running {
  promise: Promise<void>;
  epoch: number;
}

const inflight = new WeakMap<object, Map<string, Running>>();

/**
 * Runs `work` unless the same keyed work is already running for this owner,
 * in which case the caller shares the running promise. `work` receives
 * `isCurrent`, which turns false once the session epoch ends; it must check it
 * before committing. A failure of stale work is swallowed, and stale work is
 * never shared with callers of a newer epoch.
 */
export const coalesced = (
  owner: object,
  key: string,
  work: (isCurrent: () => boolean) => Promise<void>,
): Promise<void> => {
  let byKey = inflight.get(owner);
  if (!byKey) inflight.set(owner, (byKey = new Map()));
  const running = byKey.get(key);
  if (running && !epoch.isStale(running.epoch)) return running.promise;

  const captured = epoch.current();
  const isCurrent = () => !epoch.isStale(captured);
  const entry: Running = {
    epoch: captured,
    promise: new Promise<void>((resolve) => resolve(work(isCurrent)))
      .catch((error) => {
        if (isCurrent()) throw error;
      })
      .finally(() => {
        if (byKey.get(key) === entry) byKey.delete(key);
      }),
  };
  byKey.set(key, entry);
  return entry.promise;
};
