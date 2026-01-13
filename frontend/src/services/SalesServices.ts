import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import storageService from "./general/StorageService";
import SaleMapper from "@/mapping/SaleMapping";
import Utils from "@/utils/utils";

const ENDPOINT = "/sales";
const CACHE_KEY = "sales_data";
const RESOURCE_KEY = "sales.title";

export enum SaleEvents {
  SALE_SEEN = "sale-seen",
}

export default class SalesService extends BaseService {
  /**
   * Fetches sales with streaming support.
   * Wraps the complex streaming logic inside handleRequest for toast support.
   */
  static async getSales(options?: {
    forceUpdate?: boolean;
    onUpdate?: (chunk: Sale[]) => void;
  }): Promise<Sale[]> {
    const cached = await storageService.get<{
      sales: Sale[];
      timestamp: number;
    }>(CACHE_KEY);
    const isExpired = !cached || Utils.isCacheExpired(cached.timestamp);
    const existingIds = new Set(cached?.sales.map((s) => s.id) || []);

    if (!options?.forceUpdate && !isExpired && cached) {
      return cached.sales.map((s) => ({ ...s, isNew: false }));
    }

    // Wrap the stream in handleRequest to catch connection errors
    return this.handleRequest(
      this.streamSales(existingIds, options?.onUpdate),
      RESOURCE_KEY
    );
  }

  /**
   * Core Streaming Logic
   */
  private static streamSales(
    existingIds: Set<string>,
    onUpdate?: (chunk: Sale[]) => void
  ): Promise<Sale[]> {
    return new Promise((resolve, reject) => {
      const accumulated: Sale[] = [];

      const stopFn = ApiUtils.stream(
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
            // Internal silent cache update
            storageService.set(CACHE_KEY, {
              sales: accumulated,
              timestamp: Date.now(),
            });
          } catch (err) {
            stopFn();
            reject(err);
          }
        },
        (err) => {
          stopFn();
          reject(err);
        },
        () => {
          stopFn();
          resolve(accumulated);
        }
      );
    });
  }

  static async getSaleById(saleId: string): Promise<Sale | null> {
    const sales = await this.getSales();
    return sales.find((sale) => sale.id === saleId) || null;
  }

  static async getNewSalesCount(): Promise<number> {
    const cached = await storageService.get<{ sales: Sale[] }>(CACHE_KEY);
    return cached ? cached.sales.filter((sale) => sale.isNew).length : 0;
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
      sale.id === saleId ? { ...sale, isNew: false } : sale
    );

    // Using the helper from BaseService
    await this.saveAndNotify(
      CACHE_KEY,
      SaleEvents.SALE_SEEN,
      updatedSales,
      "sales"
    );
    // Also emit specific ID for granular UI updates
    this.emit(`${SaleEvents.SALE_SEEN}-id`, saleId);
  }

  static async getCachedSales(): Promise<Sale[] | null> {
    const cached = await storageService.get<{ sales: Sale[] }>(CACHE_KEY);
    return cached ? cached.sales : null;
  }
}
