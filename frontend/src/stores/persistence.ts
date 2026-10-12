import { toRaw } from "vue";
import type { PiniaPluginContext, StateTree } from "pinia";
import storageService, { type StorageArea } from "@/services/general/StorageService";
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
  /** Actions whose completion can change this entry; omitted means every action. */
  dirtyOn?: readonly string[];
  /**
   * Change token compared with `Object.is`; an unchanged token skips the write.
   * Copy-on-write lists return the list reference, settings a primitive.
   * Without it every marked flush writes.
   */
  version?: (state: S) => unknown;
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
    /**
     * Loads the stored snapshots (all entries, or only `keys`) that exist and
     * have not expired; true when any applied. Concurrent calls for the same
     * keys share one read.
     */
    $hydrate(keys?: readonly string[]): Promise<boolean>;
    /** Drops a pending write, used when the account's data is being wiped. */
    $cancelPersist(): void;
    /** Marks entries (all, or only `keys`) as changed, for writes made outside an action. */
    $persist(keys?: readonly string[]): void;
    /** Writes the changed entries now instead of after the debounce. */
    $flushPersist(): void;
  }
}

type Entry = PersistEntry<StateTree>;

const DEFAULT_DEBOUNCE_MS = 250;

const areaOf = (entry: Entry): StorageArea => (entry.keepOnClear ? "kv" : "cache");

const flushers = new Set<() => void>();
let listeningForUnload = false;

const flushAll = (): void => {
  for (const flush of flushers) flush();
};

const listenForUnload = (): void => {
  if (listeningForUnload || typeof window === "undefined") return;
  listeningForUnload = true;
  window.addEventListener("pagehide", flushAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });
};

const isPlainObject = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** A structured-cloneable copy without reactive proxies, at any depth. */
const rawSnapshot = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") return value;
  const raw = toRaw(value);
  if (Array.isArray(raw)) return raw.map(rawSnapshot);
  if (import.meta.env.DEV && (raw instanceof Map || raw instanceof Set)) {
    throw new Error("Persisted state must not contain a Map or Set");
  }
  if (!isPlainObject(raw)) return raw;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    copy[key] = rawSnapshot((raw as Record<string, unknown>)[key]);
  }
  return copy;
};

const noPersistence = {
  $hydrate: async () => false,
  $cancelPersist: () => undefined,
  $persist: () => undefined,
  $flushPersist: () => undefined,
};

/**
 * Writes persisted entries after the actions (or `$patch` calls) that may
 * have changed them, debounced. State is never watched, so a store change
 * costs nothing until the flush, which reads each changed entry once.
 */
export const l2Persistence = ({ store, options }: PiniaPluginContext): void => {
  const persist = options.persist as PersistOptions<StateTree> | undefined;
  if (!persist) {
    Object.assign(store, noPersistence);
    return;
  }

  const entries: Entry[] = persist.entries;
  const debounceMs = persist.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const dirty = new Set<Entry>();
  const tokens = new Map<Entry, unknown>();
  // Entries without a timestamp hold settings: until storage was read their
  // in-memory value is only a default and must not overwrite a stored one.
  const hydrated = new Set<Entry>();
  const hydrating = new Map<string, Promise<boolean>>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let suppressed = false;
  // Bumped by `$reset`: actions and reads begun for the previous account must
  // not mark, apply or write anything once they settle.
  let generation = 0;

  const rawState = (): StateTree => toRaw(store.$state);

  const select = (keys?: readonly string[]): Entry[] =>
    keys ? entries.filter((entry) => keys.includes(entry.key)) : entries;

  const rememberTokens = (): void => {
    const state = rawState();
    for (const entry of entries) if (entry.version) tokens.set(entry, entry.version(state));
  };
  rememberTokens();

  const cancelTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const write = (entry: Entry, state: StateTree): void => {
    const timestamp = entry.timestamp ? entry.timestamp(state) : Date.now();
    if (timestamp == null) return;
    if (!entry.timestamp && !hydrated.has(entry)) return;
    const token = entry.version?.(state);
    if (entry.version && tokens.has(entry) && Object.is(tokens.get(entry), token)) {
      dirty.delete(entry);
      return;
    }
    const data = rawSnapshot(entry.pick(state));
    dirty.delete(entry);
    if (entry.version) tokens.set(entry, token);
    storageService
      .set(entry.key, { data, keepOnClear: entry.keepOnClear ?? false, timestamp }, areaOf(entry))
      .catch((error: unknown) => {
        console.error(`Could not persist ${entry.key}`, error);
        if (entry.version && Object.is(tokens.get(entry), token)) tokens.delete(entry);
      });
  };

  const flush = (): void => {
    cancelTimer();
    if (dirty.size === 0) return;
    const state = rawState();
    for (const entry of [...dirty]) {
      try {
        write(entry, state);
      } catch (error) {
        console.error(`Could not persist ${entry.key}`, error);
      }
    }
  };

  const schedule = (): void => {
    cancelTimer();
    timer = setTimeout(flush, debounceMs);
  };

  const markEntries = (marked: Entry[]): void => {
    if (suppressed || marked.length === 0) return;
    for (const entry of marked) dirty.add(entry);
    schedule();
  };

  const markAfterAction = (name: string): void => {
    markEntries(entries.filter((entry) => !entry.dirtyOn || entry.dirtyOn.includes(name)));
  };

  store.$onAction(({ name, after, onError }) => {
    const started = generation;
    const settle = (): void => {
      if (started === generation) markAfterAction(name);
    };
    after(settle);
    onError(settle);
  }, true);

  const patch = store.$patch.bind(store) as (partialOrMutator: unknown) => void;
  store.$patch = ((partial: unknown) => {
    patch(partial);
    markEntries(entries);
  }) as typeof store.$patch;

  const hydrate = async (requested: Entry[]): Promise<boolean> => {
    const started = generation;
    const stored = await Promise.all(
      requested.map(async (entry) => ({
        entry,
        value: await storageService.get<{ data: unknown; timestamp: number }>(
          entry.key,
          areaOf(entry),
        ),
      })),
    );
    if (started !== generation) return false;

    let applied = false;
    suppressed = true;
    try {
      for (const { entry, value } of stored) {
        hydrated.add(entry);
        if (!value || value.data == null) continue;
        if (!entry.allowExpired && Utils.isCacheExpired(value.timestamp)) continue;
        patch((state: StateTree) => entry.apply(state, value.data, value.timestamp));
        if (entry.version) tokens.set(entry, entry.version(rawState()));
        dirty.delete(entry);
        applied = true;
      }
    } finally {
      suppressed = false;
    }
    // Changes made before storage was read were held back; write them now.
    if (dirty.size > 0 && timer === undefined) schedule();
    return applied;
  };

  store.$hydrate = (keys?: readonly string[]) => {
    const requested = select(keys);
    const id = requested
      .map((entry) => entry.key)
      .sort()
      .join("\n");
    const joined = hydrating.get(id);
    if (joined) return joined;
    const running: Promise<boolean> = hydrate(requested).finally(() => {
      if (hydrating.get(id) === running) hydrating.delete(id);
    });
    hydrating.set(id, running);
    return running;
  };

  store.$cancelPersist = () => {
    cancelTimer();
    dirty.clear();
  };

  store.$persist = (keys?: readonly string[]) => markEntries(select(keys));

  store.$flushPersist = flush;

  // A reset belongs to a logout or account wipe: nothing may be written back
  // afterwards or the next account would find an empty but "fresh" entry.
  const reset = store.$reset.bind(store);
  store.$reset = () => {
    generation++;
    store.$cancelPersist();
    hydrating.clear();
    suppressed = true;
    try {
      reset();
    } finally {
      suppressed = false;
    }
    hydrated.clear();
    rememberTokens();
  };

  const dispose = store.$dispose.bind(store);
  store.$dispose = () => {
    flushers.delete(flush);
    dispose();
  };

  flushers.add(flush);
  listenForUnload();
};
