import storageService from "@/services/general/StorageService";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";
import Utils from "@/utils/utils";
import { isProxy, toRaw } from "vue";

export abstract class BaseService {
  private static l1Cache = new Map<
    string,
    { data: unknown; timestamp: number }
  >();
  private static ongoingRequests = new Map<string, Promise<unknown>>();
  private static readonly L1_MAX_ENTRIES = 500;

  protected static deepCopy<T>(data: T): T {
    if (data == null || typeof data !== "object") return data;
    const raw = isProxy(data) ? toRaw(data) : data;
    try {
      return typeof structuredClone === "function"
        ? structuredClone(raw)
        : JSON.parse(JSON.stringify(raw));
    } catch {
      return raw;
    }
  }

  protected static emit(eventName: string, detail: unknown): void {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  private static readL1<T>(key: string): T | null {
    const entry = this.l1Cache.get(key);
    if (!entry) return null;
    if (Utils.isCacheExpired(entry.timestamp)) {
      this.l1Cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private static writeL1(key: string, data: unknown): void {
    if (this.l1Cache.size >= this.L1_MAX_ENTRIES) {
      const oldestKey = this.l1Cache.keys().next().value;
      if (oldestKey) this.l1Cache.delete(oldestKey);
    }
    this.l1Cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Empties the in-memory L1 cache and the in-flight request registry.
   *
   * Must accompany every local logout / account deletion: L2 storage is
   * cleared there, but this static map would otherwise keep serving the
   * previous account's data (until entry expiry or a full page reload)
   * if another user signs in within the same app session.
   */
  static clearMemoryCache(): void {
    this.l1Cache.clear();
    this.ongoingRequests.clear();
  }

  protected static async getCachedData<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
    forceUpdate = false,
    keepOnClear = false,
  ): Promise<T> {
    if (!forceUpdate) {
      const l1 = this.readL1<T>(cacheKey);
      if (l1 !== null) return l1;
    }

    const inflight = this.ongoingRequests.get(cacheKey);
    if (inflight) return inflight as Promise<T>;

    const promise = (async () => {
      try {
        if (!forceUpdate) {
          const cached = await storageService.get<{
            data: T;
            timestamp: number;
          }>(cacheKey);
          if (cached && !Utils.isCacheExpired(cached.timestamp)) {
            this.writeL1(cacheKey, cached.data);
            return cached.data;
          }
        }

        const fresh = await fetcher();
        this.writeL1(cacheKey, fresh);
        storageService.set(cacheKey, {
          data: fresh,
          keepOnClear,
          timestamp: Date.now(),
        });
        return fresh;
      } catch (error) {
        throw error;
      } finally {
        this.ongoingRequests.delete(cacheKey);
      }
    })();

    this.ongoingRequests.set(cacheKey, promise);
    return promise as Promise<T>;
  }

  /**
   * Specialized helper for Dictionary/Map style caching.
   * Useful for "MoreInfo" (keyed by name) or "Watering" (keyed by ID).
   */
  protected static async getFromDictionaryCache<T>(
    cacheKey: string,
    entryKey: string,
    fetcher: () => Promise<T>,
    forceUpdate = false,
  ): Promise<T> {
    // 1. Get the full dictionary from the tiered cache
    const fullDict = await this.getCachedData<Record<string, T>>(
      cacheKey,
      async () => ({}), // Start with empty object if cache is totally missing
      false, // We don't force update the WHOLE dict here
    );

    // 2. If we have the specific entry and aren't forcing, return it
    if (!forceUpdate && fullDict[entryKey]) {
      return fullDict[entryKey];
    }

    // 3. Otherwise, fetch just the missing/stale entry
    const freshEntry = await fetcher();

    // 4. Update the dictionary and save
    const updatedDict = { ...fullDict, [entryKey]: freshEntry };

    // We update L1 and L2 for the whole dictionary
    this.writeL1(cacheKey, updatedDict);
    await storageService.set(cacheKey, {
      data: updatedDict,
      timestamp: Date.now(),
    });

    return freshEntry;
  }

  protected static async saveAndNotify<T>(
    storageKey: string,
    eventKey: string,
    data: T,
    wrapInObjectKey = "data",
    keepOnClear = false,
  ): Promise<void> {
    const now = Date.now();
    this.writeL1(storageKey, data);
    const value = {
      [wrapInObjectKey]: this.deepCopy(data),
      keepOnClear,
      timestamp: now,
    };
    await storageService.set(storageKey, value);
    this.emit(eventKey, data);
  }

  protected static async handleRequest<T>(
    request: Promise<T>,
    resourceNameKey: string,
    actionKey = "error.fetch_failed",
  ): Promise<T> {
    try {
      return await request;
    } catch (error: any) {
      if (error?.name === "RefreshError" || error?.name === "RegisterError")
        throw error;
      ToastService.showError({
        key: actionKey,
        vars: {
          resource: localizationService.t(resourceNameKey),
          details: error?.message || String(error),
        },
        fallback: `Operation failed: ${error}`,
      });
      throw error;
    }
  }

  private static async readList<T>(cacheKey: string): Promise<T[]> {
    const cached = await storageService.get<{ data: T[] }>(cacheKey);
    return cached?.data ? [...cached.data] : [];
  }

  private static async readDictionary<T>(
    cacheKey: string,
  ): Promise<Record<string, T[]>> {
    const cached = await storageService.get<{ data: Record<string, T[]> }>(
      cacheKey,
    );
    return cached?.data ? { ...cached.data } : {};
  }

  protected static async upsertIntoListCache<T extends { id: number | string }>(
    cacheKey: string,
    eventKey: string,
    item: T,
    keepOnClear = false,
  ): Promise<void> {
    if (!item?.id) throw new Error("BaseService: item must have an 'id'");
    const list = await this.readList<T>(cacheKey);
    const index = list.findIndex((x) => x.id === item.id);
    index === -1 ? list.push(item) : (list[index] = item);
    await this.saveAndNotify(cacheKey, eventKey, list, "data", keepOnClear);
  }

  /** Removes the item with the given id from a cached list (no-op if absent). */
  protected static async removeFromListCache<T extends { id: number | string }>(
    cacheKey: string,
    eventKey: string,
    itemId: number | string,
    keepOnClear = false,
  ): Promise<void> {
    const list = await this.readList<T>(cacheKey);
    const updated = list.filter((x) => x.id !== itemId);
    if (updated.length === list.length) return;
    await this.saveAndNotify(cacheKey, eventKey, updated, "data", keepOnClear);
  }

  /**
   * Replaces the item carrying `previousId` with `item` (in place, order
   * preserved). Falls back to an upsert when `previousId` is absent —
   * this is the reconcile step after an optimistic create, where a
   * temporary negative id is swapped for the server-assigned one.
   */
  protected static async replaceInListCache<T extends { id: number | string }>(
    cacheKey: string,
    eventKey: string,
    previousId: number | string,
    item: T,
    keepOnClear = false,
  ): Promise<void> {
    const list = await this.readList<T>(cacheKey);
    const index = list.findIndex((x) => x.id === previousId);
    index === -1 ? list.push(item) : (list[index] = item);
    await this.saveAndNotify(cacheKey, eventKey, list, "data", keepOnClear);
  }

  // ── Dictionary-list variants (Record<entryKey, T[]> one level in) ──────────
  // Same operations for dictionary caches such as the watering records
  // ("watering_records_data" keyed by plantId). Only the addressed entry
  // is touched; sibling entries are preserved.

  protected static async upsertIntoDictionaryListCache<
    T extends { id: number | string },
  >(
    cacheKey: string,
    entryKey: string,
    eventKey: string,
    item: T,
  ): Promise<void> {
    if (!item?.id) throw new Error("BaseService: item must have an 'id'");
    const dict = await this.readDictionary<T>(cacheKey);
    const list = dict[entryKey] ? [...dict[entryKey]] : [];
    const index = list.findIndex((x) => x.id === item.id);
    index === -1 ? list.push(item) : (list[index] = item);
    await this.saveAndNotify(cacheKey, eventKey, { ...dict, [entryKey]: list });
  }

  protected static async removeFromDictionaryListCache<
    T extends { id: number | string },
  >(
    cacheKey: string,
    entryKey: string,
    eventKey: string,
    itemId: number | string,
  ): Promise<void> {
    const dict = await this.readDictionary<T>(cacheKey);
    const list = dict[entryKey];
    if (!list) return;
    const updated = list.filter((x) => x.id !== itemId);
    if (updated.length === list.length) return;
    await this.saveAndNotify(cacheKey, eventKey, {
      ...dict,
      [entryKey]: updated,
    });
  }

  protected static async replaceInDictionaryListCache<
    T extends { id: number | string },
  >(
    cacheKey: string,
    entryKey: string,
    eventKey: string,
    previousId: number | string,
    item: T,
  ): Promise<void> {
    const dict = await this.readDictionary<T>(cacheKey);
    const list = dict[entryKey] ? [...dict[entryKey]] : [];
    const index = list.findIndex((x) => x.id === previousId);
    index === -1 ? list.push(item) : (list[index] = item);
    await this.saveAndNotify(cacheKey, eventKey, { ...dict, [entryKey]: list });
  }

  // ── Optimistic mutation wrappers ────────────────────────────────────────────
  // Paint the expected outcome into the cache immediately (views react via
  // the emitted event), run the request, then reconcile with the server
  // response — or roll back on failure. Rollback is **item-scoped**: only
  // the affected item is snapshotted and restored, so concurrent changes
  // to other items in the same list survive a failed request.

  private static async runOptimisticUpsert<
    T extends { id: number | string },
    R,
  >(
    io: { read: () => Promise<T[]>; write: (list: T[]) => Promise<void> },
    optimisticItem: T,
    request: () => Promise<R>,
    reconcile: (response: R) => T,
  ): Promise<R> {
    // 1. Snapshot only the affected item (or note that it did not exist).
    const before = await io.read();
    const existing = before.find((x) => x.id === optimisticItem.id);
    const snapshot = existing ? this.deepCopy(existing) : null;

    // 2. Optimistic paint.
    const painted = [...before];
    const paintIndex = painted.findIndex((x) => x.id === optimisticItem.id);
    paintIndex === -1
      ? painted.push(optimisticItem)
      : (painted[paintIndex] = optimisticItem);
    await io.write(painted);

    try {
      // 3. Real request, then reconcile: swap the optimistic item (temp
      //    negative id for creates) for the server truth, in place.
      const response = await request();
      const finalItem = reconcile(response);
      const current = await io.read();
      const index = current.findIndex((x) => x.id === optimisticItem.id);
      index === -1 ? current.push(finalItem) : (current[index] = finalItem);
      await io.write(current);
      return response;
    } catch (error) {
      // 4. Item-scoped rollback on the *current* list state.
      const current = await io.read();
      const index = current.findIndex((x) => x.id === optimisticItem.id);
      if (snapshot) {
        index === -1 ? current.push(snapshot) : (current[index] = snapshot);
      } else if (index !== -1) {
        current.splice(index, 1);
      }
      await io.write(current);
      throw error;
    }
  }

  private static async runOptimisticRemove<
    T extends { id: number | string },
    R,
  >(
    io: { read: () => Promise<T[]>; write: (list: T[]) => Promise<void> },
    itemId: number | string,
    request: () => Promise<R>,
  ): Promise<R> {
    const before = await io.read();
    const index = before.findIndex((x) => x.id === itemId);
    const snapshot = index === -1 ? null : this.deepCopy(before[index]);

    if (index !== -1) {
      const painted = [...before];
      painted.splice(index, 1);
      await io.write(painted);
    }

    try {
      return await request();
    } catch (error) {
      if (snapshot) {
        const current = await io.read();
        if (!current.some((x) => x.id === itemId)) {
          current.splice(Math.min(index, current.length), 0, snapshot);
          await io.write(current);
        }
      }
      throw error;
    }
  }

  /**
   * Optimistic upsert on a flat list cache. For creates, give the
   * optimistic item a temporary **negative** id (e.g. `-Date.now()`);
   * `reconcile` maps the server response to the final item that replaces it.
   * Returns the raw response so callers can chain on server data.
   */
  protected static optimisticListUpsert<
    T extends { id: number | string },
    R,
  >(options: {
    cacheKey: string;
    eventKey: string;
    optimisticItem: T;
    request: () => Promise<R>;
    reconcile: (response: R) => T;
    keepOnClear?: boolean;
  }): Promise<R> {
    const { cacheKey, eventKey, keepOnClear = false } = options;
    return this.runOptimisticUpsert(
      {
        read: () => this.readList<T>(cacheKey),
        write: (list) =>
          this.saveAndNotify(cacheKey, eventKey, list, "data", keepOnClear),
      },
      options.optimisticItem,
      options.request,
      options.reconcile,
    );
  }

  /** Optimistic removal from a flat list cache (re-inserts at the original index on failure). */
  protected static optimisticListRemove<
    T extends { id: number | string },
    R,
  >(options: {
    cacheKey: string;
    eventKey: string;
    itemId: number | string;
    request: () => Promise<R>;
    keepOnClear?: boolean;
  }): Promise<R> {
    const { cacheKey, eventKey, keepOnClear = false } = options;
    return this.runOptimisticRemove<T, R>(
      {
        read: () => this.readList<T>(cacheKey),
        write: (list) =>
          this.saveAndNotify(cacheKey, eventKey, list, "data", keepOnClear),
      },
      options.itemId,
      options.request,
    );
  }

  /** Optimistic upsert on one entry of a dictionary-list cache. */
  protected static optimisticDictionaryListUpsert<
    T extends { id: number | string },
    R,
  >(options: {
    cacheKey: string;
    entryKey: string;
    eventKey: string;
    optimisticItem: T;
    request: () => Promise<R>;
    reconcile: (response: R) => T;
  }): Promise<R> {
    return this.runOptimisticUpsert(
      this.dictionaryListIo<T>(options.cacheKey, options.entryKey, options.eventKey),
      options.optimisticItem,
      options.request,
      options.reconcile,
    );
  }

  /** Optimistic removal from one entry of a dictionary-list cache. */
  protected static optimisticDictionaryListRemove<
    T extends { id: number | string },
    R,
  >(options: {
    cacheKey: string;
    entryKey: string;
    eventKey: string;
    itemId: number | string;
    request: () => Promise<R>;
  }): Promise<R> {
    return this.runOptimisticRemove<T, R>(
      this.dictionaryListIo<T>(options.cacheKey, options.entryKey, options.eventKey),
      options.itemId,
      options.request,
    );
  }

  /** read/write pair addressing a single entry inside a dictionary cache. */
  private static dictionaryListIo<T>(
    cacheKey: string,
    entryKey: string,
    eventKey: string,
  ): { read: () => Promise<T[]>; write: (list: T[]) => Promise<void> } {
    return {
      read: async () => {
        const dict = await this.readDictionary<T>(cacheKey);
        return dict[entryKey] ? [...dict[entryKey]] : [];
      },
      write: async (list) => {
        const dict = await this.readDictionary<T>(cacheKey);
        await this.saveAndNotify(cacheKey, eventKey, {
          ...dict,
          [entryKey]: list,
        });
      },
    };
  }
}
