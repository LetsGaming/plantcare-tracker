import storageService from "@/services/general/StorageService";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";
import Utils from "@/utils/utils";

import { isProxy } from "vue";

export abstract class BaseService {
  protected static deepCopy<T>(data: T): T {
    if (!data) return data;

    // If Vue proxy, use JSON
    if (isProxy(data)) {
      return JSON.parse(JSON.stringify(data));
    }

    // Otherwise, structuredClone if available
    return typeof structuredClone === "function"
      ? structuredClone(data)
      : JSON.parse(JSON.stringify(data));
  }

  protected static emit(eventName: string, detail: any) {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  /**
   * Saves data to storage and emits an event to notify listeners.
   */
  protected static async saveAndNotify<T>(
    storageKey: string,
    eventKey: string,
    data: T,
    wrapInObjectKey: string = "data"
  ): Promise<void> {
    const plainData = this.deepCopy(data);
    const valueToStore = wrapInObjectKey
      ? { [wrapInObjectKey]: plainData }
      : plainData;
    await storageService.set(storageKey, valueToStore);

    this.emit(eventKey, data);
  }

  /**
   * Generic API Wrapper with Toast Error Handling
   */
  protected static async handleRequest<T>(
    request: Promise<T>,
    resourceNameKey: string,
    actionKey: string = "error.fetch_failed"
  ): Promise<T> {
    try {
      return await request;
    } catch (error) {
      // check if name is RefreshError to avoid too many toasts during token refresh
      if ((error as Error)?.name === "RefreshError") {
        throw error;
      }

      ToastService.showError({
        key: actionKey,
        vars: {
          resource: localizationService.t(resourceNameKey),
          details: String(error),
        },
        fallback: `Operation failed: ${error}`,
      });
      throw error;
    }
  }

  /**
   * Standardized Caching Logic
   */
  protected static async getCachedData<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
    forceUpdate: boolean = false
  ): Promise<T> {
    const cached = await storageService.get<{ data: T; timestamp: number }>(
      cacheKey
    );

    if (!forceUpdate && cached && !Utils.isCacheExpired(cached.timestamp)) {
      return cached.data;
    }

    const freshData = await fetcher();
    await storageService.set(cacheKey, {
      data: freshData,
      timestamp: Date.now(),
    });
    return freshData;
  }

  /**
   * Inserts or updates a single item in a cached array list.
   * Automatically initializes cache if empty or missing.
   *
   * Note: The generic type {@link T} is required to have an `id` property of type `number`.
   * This is enforced at compile time where possible via `T extends { id: number }`,
   * but callers using `any` or otherwise bypassing type checking must still ensure
   * that `item.id` is a valid number. A runtime check is performed to guard against misuse.
   */
  protected static async upsertIntoListCache<T extends { id: number | string }>(
    cacheKey: string,
    eventKey: string,
    item: T,
    keepOnClear: boolean = false
  ): Promise<void> {
    if (!item || (typeof (item as any).id !== "number" && typeof (item as any).id !== "string")) {
      throw new Error(
        "BaseService.upsertIntoListCache: item must have a numeric or string 'id' property."
      );
    }
    // Get existing cached data
    const cached = await storageService.get<{ data: T[]; timestamp: number }>(
      cacheKey
    );

    // Ensure we have a valid array
    const dataArray: T[] = cached?.data ? [...cached.data] : [];

    // Replace existing item with same ID or append
    const index = dataArray.findIndex((x) => x.id === item.id);
    if (index !== -1) dataArray[index] = item;
    else dataArray.push(item);

    // Save back to storage
    await storageService.set(cacheKey, {
      data: dataArray,
      timestamp: Date.now(),
      ...(keepOnClear ? { keepOnClear: true } : {}),
    });

    // Notify subscribers
    this.emit(eventKey, item);
  }

  /**
   * Standardized Dictionary Caching Logic
   * */
  protected static async getFromDictionaryCache<T>(
    cacheKey: string,
    subKey: string,
    fetcher: () => Promise<T>,
    forceUpdate: boolean = false
  ): Promise<T> {
    const cached = await storageService.get<{
      records: { [key: string]: T };
      timestamp: number;
    }>(cacheKey);

    const isExpired = !cached || Utils.isCacheExpired(cached.timestamp);
    const hasData = cached?.records && cached.records[subKey];

    if (!forceUpdate && !isExpired && hasData) {
      return cached.records[subKey];
    }

    const freshData = await fetcher();

    // Merge new data into the existing dictionary
    const updatedRecords = { ...(cached?.records || {}), [subKey]: freshData };
    await storageService.set(cacheKey, {
      records: updatedRecords,
      timestamp: Date.now(),
    });

    return freshData;
  }
}
