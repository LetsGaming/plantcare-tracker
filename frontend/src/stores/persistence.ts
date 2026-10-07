import type { PiniaPluginContext, StateTree } from "pinia";
import storageService from "@/services/general/StorageService";
import Utils from "@/utils/utils";

/**
 * Opt-in L2 persistence for a store, backed by the async Ionic storage.
 *
 * Entries keep the envelope the app has always written
 * (`{ data, timestamp, keepOnClear }`), so caches survive the move to stores.
 */
export interface PersistOptions<S extends StateTree> {
  /** Storage key. */
  key: string;
  /** Survive `storageService.clear()` (logout); only an account wipe removes it. */
  keepOnClear?: boolean;
  /** The part of the state to write. */
  pick: (state: S) => unknown;
  /** Puts a stored snapshot back into the state. */
  apply: (state: S, data: any) => void;
  /** Trailing debounce for writes. */
  debounceMs?: number;
}

declare module "pinia" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface DefineStoreOptionsBase<S extends StateTree, Store> {
    persist?: PersistOptions<S>;
  }

  export interface PiniaCustomProperties {
    /** Loads the stored snapshot if it exists and has not expired; true when applied. */
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

  store.$hydrate = async () => {
    const entry = await storageService.get<{ data: unknown; timestamp: number }>(persist.key);
    if (!entry || entry.data == null || Utils.isCacheExpired(entry.timestamp)) return false;
    suppressed = true;
    try {
      store.$patch((state) => {
        persist.apply(state, entry.data);
        (state as { fetchedAt?: number | null }).fetchedAt = entry.timestamp;
      });
    } finally {
      suppressed = false;
    }
    return true;
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
  };

  store.$subscribe(
    (_mutation, state) => {
      if (suppressed) return;
      store.$cancelPersist();
      timer = setTimeout(() => {
        timer = undefined;
        void storageService.set(persist.key, {
          data: JSON.parse(JSON.stringify(persist.pick(state))),
          keepOnClear: persist.keepOnClear ?? false,
          timestamp: (state as { fetchedAt?: number | null }).fetchedAt ?? Date.now(),
        });
      }, persist.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    },
    { detached: true, flush: "sync" },
  );
};
