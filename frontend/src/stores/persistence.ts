import type { PiniaPluginContext, StateTree } from "pinia";
import storageService from "@/services/general/StorageService";
import Utils from "@/utils/utils";

/**
 * One piece of store state mirrored to the async Ionic storage.
 *
 * Entries keep the envelope the app has always written
 * (`{ data, timestamp, keepOnClear }`), so caches survive the move to stores.
 */
export interface PersistEntry<S extends StateTree> {
  /** Storage key. */
  key: string;
  /** Survive `storageService.clear()` (logout); only an account wipe removes it. */
  keepOnClear?: boolean;
  /** The part of the state to write. */
  pick: (state: S) => unknown;
  /** Puts a stored snapshot back into the state; `timestamp` is when it was saved. */
  apply: (state: S, data: any, timestamp: number) => void;
  /** Hydrate even after the cache lifetime, for settings and data that must outlive it. */
  allowExpired?: boolean;
  /** Time stored with the snapshot (when the data was fetched). Defaults to now. */
  timestamp?: (state: S) => number | null;
}

export interface PersistOptions<S extends StateTree> {
  entries: PersistEntry<S>[];
  /** Trailing debounce for writes. */
  debounceMs?: number;
}

declare module "pinia" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface DefineStoreOptionsBase<S extends StateTree, Store> {
    persist?: PersistOptions<S>;
  }

  export interface PiniaCustomProperties {
    /** Loads the stored snapshots that exist and have not expired; true when any applied. */
    $hydrate(): Promise<boolean>;
    /** Drops a pending write, used when the account's data is being wiped. */
    $cancelPersist(): void;
  }
}

const DEFAULT_DEBOUNCE_MS = 250;

export const l2Persistence = ({ store, options }: PiniaPluginContext): void => {
  const persist = options.persist as PersistOptions<StateTree> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let suppressed = false;

  store.$cancelPersist = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  if (!persist) {
    store.$hydrate = async () => false;
    return;
  }

  // What each entry last looked like in storage (or in the untouched initial
  // state), so only real changes are written and a store that is merely
  // loading never overwrites a good snapshot with an empty one.
  const serialized = (entry: PersistEntry<StateTree>, state: StateTree): string =>
    JSON.stringify(entry.pick(state));
  const last = new Map<PersistEntry<StateTree>, string>();
  const rememberAll = (): void => {
    for (const entry of persist.entries) last.set(entry, serialized(entry, store.$state));
  };
  rememberAll();

  store.$hydrate = async () => {
    const stored = await Promise.all(
      persist.entries.map(async (entry) => ({
        entry,
        value: await storageService.get<{ data: unknown; timestamp: number }>(entry.key),
      })),
    );

    let applied = false;
    suppressed = true;
    try {
      for (const { entry, value } of stored) {
        if (!value || value.data == null) continue;
        if (!entry.allowExpired && Utils.isCacheExpired(value.timestamp)) continue;
        store.$patch((state) => entry.apply(state, value.data, value.timestamp));
        last.set(entry, serialized(entry, store.$state));
        applied = true;
      }
    } finally {
      suppressed = false;
    }
    return applied;
  };

  // A reset belongs to a logout or account wipe: nothing may be written back
  // afterwards or the next account would find an empty but "fresh" entry.
  const reset = store.$reset.bind(store);
  store.$reset = () => {
    store.$cancelPersist();
    suppressed = true;
    try {
      reset();
    } finally {
      suppressed = false;
    }
    rememberAll();
  };

  const flush = (state: StateTree): void => {
    for (const entry of persist.entries) {
      // Entries with a snapshot time are only worth storing once they have one.
      const timestamp = entry.timestamp ? entry.timestamp(state) : Date.now();
      if (timestamp == null) continue;
      const json = serialized(entry, state);
      if (json === last.get(entry)) continue;
      last.set(entry, json);
      void storageService.set(entry.key, {
        data: JSON.parse(json),
        keepOnClear: entry.keepOnClear ?? false,
        timestamp,
      });
    }
  };

  store.$subscribe(
    (_mutation, state) => {
      if (suppressed) return;
      store.$cancelPersist();
      timer = setTimeout(() => {
        timer = undefined;
        flush(state);
      }, persist.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    },
    { detached: true, flush: "sync" },
  );
};
