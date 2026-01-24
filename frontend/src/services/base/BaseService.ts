import storageService from "@/services/general/StorageService";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";
import Utils from "@/utils/utils";
import { isProxy } from "vue";

export abstract class BaseService {
  /** Tracks ongoing network requests to prevent "Cache Stampedes" */
  private static ongoingRequests = new Map<string, Promise<any>>();

  /** Creates a high-fidelity copy of data */
  protected static deepCopy<T>(data: T): T {
    if (!data) return data;

    // Use structuredClone as primary (it's faster and handles Dates/RegEx)
    if (typeof structuredClone === "function" && !isProxy(data)) {
      try {
        return structuredClone(data);
      } catch (e) {
        // Fallback if data contains non-cloneable items
        return JSON.parse(JSON.stringify(data));
      }
    }

    // Fallback for Vue proxies or older environments
    return JSON.parse(JSON.stringify(data));
  }

  protected static emit(eventName: string, detail: any) {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  /**
   * Standardized Caching Logic with Request Collapsing
   */
  protected static async getCachedData<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
    forceUpdate: boolean = false,
  ): Promise<T> {
    // 1. Check if a request for this key is already flying
    if (this.ongoingRequests.has(cacheKey)) {
      return this.ongoingRequests.get(cacheKey);
    }

    const requestPromise = (async () => {
      try {
        const cached = await storageService.get<{ data: T; timestamp: number }>(
          cacheKey,
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
      } finally {
        // Always clean up the ongoing request map
        this.ongoingRequests.delete(cacheKey);
      }
    })();

    this.ongoingRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  /**
   * Saves data safely and notifies listeners
   */
  protected static async saveAndNotify<T>(
    storageKey: string,
    eventKey: string,
    data: T,
    wrapInObjectKey: string = "data",
    keepOnClear: boolean = false,
  ): Promise<void> {
    const plainData = this.deepCopy(data);

    // Standardize storage format so StorageService.clear() always works
    const valueToStore = {
      [wrapInObjectKey]: plainData,
      keepOnClear,
      timestamp: Date.now(),
    };

    await storageService.set(storageKey, valueToStore);
    this.emit(eventKey, data);
  }

  /**
   * Generic API Wrapper with Toast Error Handling
   */
  protected static async handleRequest<T>(
    request: Promise<T>,
    resourceNameKey: string,
    actionKey: string = "error.fetch_failed",
  ): Promise<T> {
    try {
      return await request;
    } catch (error) {
      if ((error as Error)?.name === "RefreshError") throw error;

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
   * Fixed Race Condition: Uses a "Read-Modify-Write" safeguard
   */
  protected static async upsertIntoListCache<T extends { id: number | string }>(
    cacheKey: string,
    eventKey: string,
    item: T,
    keepOnClear: boolean = false,
  ): Promise<void> {
    if (!item?.id) {
      throw new Error("BaseService: item must have an 'id' property.");
    }

    // Lock this key so other calls wait until this one is saved
    const cached = await storageService.get<{ data: T[]; timestamp: number }>(
      cacheKey,
    );
    const dataArray: T[] = cached?.data ? [...cached.data] : [];

    const index = dataArray.findIndex((x) => x.id === item.id);
    if (index !== -1) {
      dataArray[index] = item;
    } else {
      dataArray.push(item);
    }

    // Save with the standardized format
    await storageService.set(cacheKey, {
      data: dataArray,
      timestamp: Date.now(),
      keepOnClear,
    });

    this.emit(eventKey, item);
  }

  /**
   * Standardized Dictionary Caching Logic
   */
  protected static async getFromDictionaryCache<T>(
    cacheKey: string,
    subKey: string,
    fetcher: () => Promise<T>,
    forceUpdate: boolean = false,
  ): Promise<T> {
    const cached = await storageService.get<{
      records: { [key: string]: T };
      timestamp: number;
    }>(cacheKey);

    const isExpired = !cached || Utils.isCacheExpired(cached.timestamp);
    const hasData = cached?.records?.[subKey];

    if (!forceUpdate && !isExpired && hasData) {
      return cached.records[subKey];
    }

    // Collapsing logic could be added here too if subKey is highly contested
    const freshData = await fetcher();

    const updatedRecords = { ...(cached?.records || {}), [subKey]: freshData };
    await storageService.set(cacheKey, {
      records: updatedRecords,
      timestamp: Date.now(),
    });

    return freshData;
  }
}
