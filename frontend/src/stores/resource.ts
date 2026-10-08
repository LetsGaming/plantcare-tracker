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

const inflight = new WeakMap<object, Map<string, Promise<void>>>();

/**
 * Runs `work` unless the same keyed work is already running for this owner,
 * in which case the caller shares the running promise.
 */
export const coalesced = (owner: object, key: string, work: () => Promise<void>): Promise<void> => {
  let byKey = inflight.get(owner);
  if (!byKey) inflight.set(owner, (byKey = new Map()));
  const running = byKey.get(key);
  if (running) return running;

  const promise = work().finally(() => byKey.delete(key));
  byKey.set(key, promise);
  return promise;
};
