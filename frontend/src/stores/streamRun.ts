import ApiUtils, { type StreamDone, type StreamOptions } from "@/utils/apiUtils";
import { epoch } from "./resource";

/** `stopped` covers a superseded run, a halt, the session ending and a stream closed from outside. */
export type StreamOutcome = "done" | "failed" | "stopped";

export interface StreamRunConfig<T> {
  endpoint: string;
  idleTimeoutMs?: StreamOptions["idleTimeoutMs"];
  requireDoneStatus?: StreamOptions["requireDoneStatus"];
  /** Throw to fail the run. */
  onMessage(data: T): void;
  /** Commits the result; throw to fail the run. */
  onDone(done: StreamDone | undefined): void;
  /** A false result stops the run before it handles its next event. */
  isActive?(): boolean;
  /** Runs once, before the returned promise settles. */
  onSettled?(outcome: StreamOutcome): void;
}

export interface StreamRun {
  /** Resolves when the run is done or stopped, rejects when it failed. */
  promise: Promise<void>;
  /** Ends the run as `stopped`; does nothing once it settled. */
  stop(): void;
}

/**
 * Opens an SSE stream whose lifecycle settles exactly once. The session
 * ending, `stop()`, a false `isActive()` and a stream closed from outside all
 * stop it; an error event, a thrown handler or an invalid `done` payload fail it.
 */
export const startStream = <T>(config: StreamRunConfig<T>): StreamRun => {
  let settled = false;
  let close: (() => void) | null = null;
  let resolveRun!: () => void;
  let rejectRun!: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolveRun = resolve;
    rejectRun = reject;
  });

  const stopListening = epoch.onAbortAll(() => settle("stopped"));

  function settle(outcome: StreamOutcome, error?: unknown): void {
    if (settled) return;
    settled = true;
    stopListening();
    close?.();
    try {
      config.onSettled?.(outcome);
    } finally {
      if (outcome === "failed") rejectRun(error);
      else resolveRun();
    }
  }

  const isLive = (): boolean => {
    if (settled) return false;
    if (config.isActive && !config.isActive()) {
      settle("stopped");
      return false;
    }
    return true;
  };

  const guarded = (handler: () => void): void => {
    if (!isLive()) return;
    try {
      handler();
    } catch (error) {
      settle("failed", error);
    }
  };

  const options: StreamOptions = {
    requireDoneStatus: config.requireDoneStatus,
    onClose: () => settle("stopped"),
  };
  if (config.idleTimeoutMs !== undefined) options.idleTimeoutMs = config.idleTimeoutMs;

  void ApiUtils.stream<T>(
    config.endpoint,
    (event) => guarded(() => config.onMessage(event.data)),
    (error) => {
      if (isLive()) settle("failed", error);
    },
    (done) => {
      if (!isLive()) return;
      try {
        config.onDone(done);
      } catch (error) {
        settle("failed", error);
        return;
      }
      settle("done");
    },
    options,
  )
    .then((closeStream) => {
      close = closeStream;
      if (settled) closeStream();
      else isLive();
    })
    .catch((error) => settle("failed", error));

  return { promise, stop: () => settle("stopped") };
};
