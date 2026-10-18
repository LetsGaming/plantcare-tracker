import Utils from "@/utils/utils";
import { epoch } from "@/utils/epoch";

export { epoch, requestScope, type RequestScope } from "@/utils/epoch";

export type ResourceStatus = "idle" | "loading" | "ready" | "error";

/** State every fetched collection carries. */
export const resourceState = () => ({
  status: "idle" as ResourceStatus,
  /** Epoch millis of the last successful fetch or hydrated snapshot. */
  fetchedAt: null as number | null,
});

export const isStale = (fetchedAt: number | null): boolean =>
  fetchedAt === null || Utils.isCacheExpired(fetchedAt);

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
