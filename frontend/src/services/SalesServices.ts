import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import SaleMapper from "@/mapping/SaleMapping";
import storageService from "@/services/general/StorageService";

const ENDPOINT = "/sales";
const CACHE_KEY = "sales_data";
const RESOURCE_KEY = "sales.title";
const PRICE_HISTORY_CACHE = "sales_price_history";
const MAX_PRICE_POINTS = 30; // keep last 30 points per sale

export enum SaleEvents {
  SALE_SEEN = "sale-seen",
  PRICE_HISTORY_UPDATED = "price-history-updated",
}

export default class SalesService extends BaseService {
  /** Fetch all sales from cache or API */
  static async getAllSales(options?: {
    forceUpdate?: boolean;
    onUpdate?: (chunk: Sale[]) => void;
  }): Promise<Sale[]> {
    const forceUpdate = options?.forceUpdate ?? false;

    const result = await this.getCachedData(
      CACHE_KEY,
      async () => {
        const cached = await this.getCachedSales();
        const existingIds = new Set(cached?.map((s) => s.id) || []);

        return this.handleRequest(
          this.streamSales(existingIds, options?.onUpdate),
          RESOURCE_KEY,
        );
      },
      forceUpdate,
    );

    return result;
  }

  /** Stream sales updates */
  private static streamSales(
    existingIds: Set<string>,
    onUpdate?: (chunk: Sale[]) => void,
  ): Promise<Sale[]> {
    return new Promise((resolve, reject) => {
      const accumulated: Sale[] = [];
      let stopFn: (() => void) | null = null;

      (async () => {
        try {
          stopFn = await ApiUtils.stream<any>(
            ENDPOINT,
            async (event) => {
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

                // Save cache
                await this.saveAndNotify(CACHE_KEY, "", accumulated, "data");

                // Update price history for all new/updated sales
                for (const sale of flaggedChunk) {
                  await this.addPricePoint(sale);
                }
              } catch (err) {
                stopFn?.();
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

  /** Get a single sale */
  static async getSaleById(saleId: string): Promise<Sale | null> {
    const sales = await this.getAllSales();
    return sales.find((s) => s.id === saleId) || null;
  }

  /** Return cached sales array */
  static async getCachedSales(): Promise<Sale[] | null> {
    const cached = await storageService.get<{
      data: Sale[];
      timestamp: number;
    }>(CACHE_KEY);
    return cached?.data ?? null;
  }

  /** Count new sales */
  static async getNewSalesCount(): Promise<number> {
    const cached = await this.getCachedSales();
    return cached ? cached.filter((s) => s.isNew).length : 0;
  }

  /** Mark sale as seen */
  static async markSaleAsSeen(saleId: string): Promise<void> {
    const cached = await this.getCachedSales();
    if (!cached) return;

    const updatedSales = cached.map((sale) =>
      sale.id === saleId ? { ...sale, isNew: false } : sale,
    );

    await this.saveAndNotify(
      CACHE_KEY,
      SaleEvents.SALE_SEEN,
      updatedSales,
      "data",
    );
  }

  /** Add a price point for a sale (list cache) */
  static async addPricePoint(sale: Sale): Promise<void> {
    // Get existing cache
    const cached = await storageService.get<{
      data: { id: string; points: { price: number; timestamp: number }[] }[];
      timestamp: number;
    }>(PRICE_HISTORY_CACHE);

    // Find existing record for this sale ID
    const existing = cached?.data?.find((x) => x.id === sale.id);

    // Compute new points array
    const last = existing?.points?.[existing.points.length - 1];
    const newPoints =
      !last || last.price !== sale.price
        ? [
            ...(existing?.points || []),
            { price: sale.price, timestamp: Date.now() },
          ]
        : existing?.points || [];

    // Trim to max points
    const trimmedPoints = newPoints.slice(-MAX_PRICE_POINTS);

    // Upsert into cache with keepOnClear
    await this.upsertIntoListCache(
      PRICE_HISTORY_CACHE,
      SaleEvents.SALE_SEEN,
      {
        id: sale.id,
        points: trimmedPoints,
      },
      true,
    );
  }

  /** Get price history for a sale */
  static async getPriceHistory(
    saleId: string,
  ): Promise<{ price: number; timestamp: number }[]> {
    const cached = await storageService.get<{
      data: {
        id: string;
        points: { price: number; timestamp: number }[];
        keepOnClear?: boolean;
      }[];
      timestamp: number;
    }>(PRICE_HISTORY_CACHE);

    const record = cached?.data?.find((x) => x.id === saleId);
    return record?.points ?? [];
  }
}
