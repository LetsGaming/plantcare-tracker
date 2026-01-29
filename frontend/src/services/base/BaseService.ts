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

  protected static async upsertIntoListCache<T extends { id: number | string }>(
    cacheKey: string,
    eventKey: string,
    item: T,
    keepOnClear = false,
  ): Promise<void> {
    if (!item?.id) throw new Error("BaseService: item must have an 'id'");
    const cached = await storageService.get<{ data: T[] }>(cacheKey);
    const list = cached?.data ? [...cached.data] : [];
    const index = list.findIndex((x) => x.id === item.id);
    index === -1 ? list.push(item) : (list[index] = item);
    await this.saveAndNotify(cacheKey, eventKey, list, "data", keepOnClear);
  }
}
