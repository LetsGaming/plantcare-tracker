import storageService from "@/services/general/StorageService";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";
import Utils from "@/utils/utils";
import { isProxy, toRaw } from "vue";

/**
 * High-performance, safe abstract BaseService.
 * Implements a dual-layer caching strategy (L1/L2) with request collapsing.
 */
export abstract class BaseService {
  /** Memory cache (L1) with TTL awareness */
  private static l1Cache = new Map<
    string,
    { data: unknown; timestamp: number }
  >();

  /** Map of active promises to collapse concurrent requests */
  private static ongoingRequests = new Map<string, Promise<unknown>>();

  /** Maximum L1 entries before FIFO eviction kicks in */
  private static readonly L1_MAX_ENTRIES = 500;

  /**
   * Performs a high-speed deep copy. Unwraps Vue proxies to maximize performance.
   * @template T
   * @param {T} data - The object to clone.
   * @returns {T}
   */
  protected static deepCopy<T>(data: T): T {
    if (data == null || typeof data !== "object") return data;
    const raw = isProxy(data) ? toRaw(data) : data;

    try {
      return typeof structuredClone === "function"
        ? structuredClone(raw)
        : JSON.parse(JSON.stringify(raw));
    } catch {
      return raw; // Fallback to raw if non-serializable
    }
  }

  /**
   * Dispatches a custom DOM event.
   * @param {string} eventName
   * @param {unknown} detail
   */
  protected static emit(eventName: string, detail: unknown): void {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  /**
   * Retrieves an item from L1 memory.
   * @private
   */
  private static readL1<T>(key: string): T | null {
    const entry = this.l1Cache.get(key);
    if (!entry) return null;

    if (Utils.isCacheExpired(entry.timestamp)) {
      this.l1Cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  /**
   * Writes to L1 memory with FIFO eviction.
   * @private
   */
  private static writeL1(key: string, data: unknown): void {
    if (this.l1Cache.size >= this.L1_MAX_ENTRIES) {
      const oldestKey = this.l1Cache.keys().next().value;
      if (oldestKey) this.l1Cache.delete(oldestKey);
    }
    this.l1Cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Tiered data retrieval: L1 -> L2 -> Fetcher.
   * Fixed: Added robust try/catch inside the promise to prevent "stuck" pending states.
   * @template T
   * @param {string} cacheKey - The storage key.
   * @param {() => Promise<T>} fetcher - The API call logic.
   * @param {boolean} [forceUpdate=false] - Bypass cache.
   * @param {boolean} [keepOnClear=false] - Persist across clears.
   */
  protected static async getCachedData<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
    forceUpdate = false,
    keepOnClear = false,
  ): Promise<T> {
    // 1. Check L1 (Memory)
    if (!forceUpdate) {
      const l1 = this.readL1<T>(cacheKey);
      if (l1 !== null) return l1;
    }

    // 2. Check for In-Flight requests
    const inflight = this.ongoingRequests.get(cacheKey);
    if (inflight) return inflight as Promise<T>;

    // 3. Define the execution task
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
        const now = Date.now();

        this.writeL1(cacheKey, fresh);

        // Background L2 update
        storageService.set(cacheKey, {
          data: fresh,
          keepOnClear,
          timestamp: now,
        });

        return fresh;
      } catch (error) {
        // Clear from ongoing if it fails so next call can retry
        this.ongoingRequests.delete(cacheKey);
        throw error;
      } finally {
        this.ongoingRequests.delete(cacheKey);
      }
    })();

    this.ongoingRequests.set(cacheKey, promise);
    return promise as Promise<T>;
  }

  /**
   * Saves data to L1/L2 and broadcasts an event.
   */
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

  /**
   * Standardized request wrapper with localization and toast support.
   */
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

  /**
   * Safely updates a list item in the cache by ID.
   */
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
