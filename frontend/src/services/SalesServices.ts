import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import storageService from "./general/StorageService";
import SaleMapper from "@/mapping/SaleMapping";

const ENDPOINT = "/sales";
const CACHE_KEY = "sales_data";
const RESOURCE_KEY = "sales.title";

export enum SaleEvents {
  SALE_SEEN = "sale-seen",
}

export default class SalesService extends BaseService {
  /**
   * Fetches all sales.
   *
   * Uses a single cached list as the source of truth.
   * Streaming updates are supported and forwarded to the caller.
   *
   * @param options.forceUpdate If true, bypasses the cache
   * @param options.onUpdate Optional callback for streamed chunks
   * @returns A list of all sales
   */
  static async getAllSales(options?: {
    forceUpdate?: boolean;
    onUpdate?: (chunk: Sale[]) => void;
  }): Promise<Sale[]> {
    const forceUpdate = options?.forceUpdate ?? false;

    const result = await this.getCachedData(
      CACHE_KEY,
      async () => {
        const cached = await storageService.get<{ data: Sale[] }>(CACHE_KEY);
        const existingIds = new Set(cached?.data.map((s) => s.id) || []);

        return this.handleRequest(
          this.streamSales(existingIds, options?.onUpdate),
          RESOURCE_KEY,
        );
      },
      forceUpdate,
    );

    const toReturn = (result || []).map((s) => ({
      ...s,
      isNew: false,
    }));

    this.emit(SaleEvents.SALE_SEEN, null); // Notify that sales have been fetched

    return toReturn;
  }

  /**
   * Core Streaming Logic
   */
  private static streamSales(
    existingIds: Set<string>,
    onUpdate?: (chunk: Sale[]) => void,
  ): Promise<Sale[]> {
    return new Promise((resolve, reject) => {
      const accumulated: Sale[] = [];
      let stopFn: (() => void) | null = null;

      // We create an immediately invoked async function to handle the await
      (async () => {
        try {
          // AWAIT the stream setup to get the actual stop function
          stopFn = await ApiUtils.stream<any>(
            ENDPOINT,
            (event) => {
              try {
                const rawChunk = SaleMapper.convertToSales(event.data);
                const flaggedChunk = rawChunk.map((sale) => ({
                  ...sale,
                  isNew: !existingIds.has(sale.id),
                }));

                flaggedChunk.forEach((sale) => {
                  if (!accumulated.find((s) => s.id === sale.id)) {
                    accumulated.push(sale);
                  }
                });

                onUpdate?.(flaggedChunk);

                storageService.set(CACHE_KEY, {
                  sales: accumulated,
                  timestamp: Date.now(),
                });
              } catch (err) {
                stopFn?.(); // Use optional chaining because it might not be assigned yet
                reject(err);
              }
            },
            (err) => {
              stopFn?.();
              reject(err);
            },
            () => {
              stopFn?.();
              resolve(accumulated);
            },
          );
        } catch (err) {
          reject(err);
        }
      })();
    });
  }

  static async getSaleById(saleId: string): Promise<Sale | null> {
    const sales = await this.getAllSales();
    return sales.find((sale) => sale.id === saleId) || null;
  }

  static async getNewSalesCount(): Promise<number> {
    const cached = await storageService.get<{ data: Sale[] }>(CACHE_KEY);
    return cached ? cached.data.filter((sale) => sale.isNew).length : 0;
  }

  /**
   * Marks a sale as seen and notifies the app via DOM events
   */
  static async markSaleAsSeen(saleId: string): Promise<void> {
    const cached = await storageService.get<{
      sales: Sale[];
      timestamp: number;
    }>(CACHE_KEY);
    if (!cached) return;

    const updatedSales = cached.sales.map((sale) =>
      sale.id === saleId ? { ...sale, isNew: false } : sale,
    );

    // Using the helper from BaseService
    await this.saveAndNotify(CACHE_KEY, SaleEvents.SALE_SEEN, updatedSales);
  }

  static async getCachedSales(): Promise<Sale[] | null> {
    const cached = await storageService.get<{ sales: Sale[] }>(CACHE_KEY);
    return cached ? cached.sales : null;
  }
}
