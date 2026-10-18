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
  /** Captures the current epoch; the returned check turns false once an account ends. */
  guard(): () => boolean {
    const started = epochValue;
    return () => started === epochValue;
  },
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
