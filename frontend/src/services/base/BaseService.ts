import storageService from "@/services/general/StorageService";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";
import Utils from "@/utils/utils";

export abstract class BaseService {
  protected static deepCopy<T>(data: T): T {
    if (!data) return data;
    return typeof structuredClone === "function"
      ? structuredClone(data)
      : JSON.parse(JSON.stringify(data));
  }

  protected static emit(eventName: string, detail: any) {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  /**
   * FIX for your error: Ensure this is 'static' and 'protected'
   */
  protected static async saveAndNotify<T>(
    storageKey: string,
    eventKey: string,
    data: T,
    wrapInObjectKey?: string
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
      console.error(`Service Error:`, error);
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
