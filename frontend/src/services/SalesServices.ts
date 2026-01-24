import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import SaleMapper from "@/mapping/SaleMapping";
import storageService from "@/services/general/StorageService";

const ENDPOINT = "/sales";
const CACHE_KEY = "sales_data";
const RESOURCE_KEY = "sales.title";
const PRICE_HISTORY_CACHE = "sales_price_history";
const MAX_PRICE_POINTS = 30;

export enum SaleEvents {
  SALES_UPDATED = "sales-updated",
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

    return await this.getCachedData(
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
      true, // keepOnClear
    );
  }

  /** Stream sales updates with improved performance and batching */
  private static streamSales(
    existingIds: Set<string>,
    onUpdate?: (chunk: Sale[]) => void,
  ): Promise<Sale[]> {
    return new Promise((resolve, reject) => {
      const accumulatedMap = new Map<string, Sale>();
      let stopFn: (() => void) | null = null;

      (async () => {
        try {
          stopFn = await ApiUtils.stream<any>(
            ENDPOINT,
            async (event) => {
              try {
                const rawChunk = SaleMapper.convertToSales(event.data);
                const flaggedChunk: Sale[] = [];

                for (const sale of rawChunk) {
                  const enhancedSale = {
                    ...sale,
                    isNew: !existingIds.has(sale.id),
                  };

                  if (!accumulatedMap.has(sale.id)) {
                    accumulatedMap.set(sale.id, enhancedSale);
                    flaggedChunk.push(enhancedSale);
                  }
                }

                if (flaggedChunk.length > 0) {
                  onUpdate?.(flaggedChunk);

                  // Update price points incrementally
                  for (const sale of flaggedChunk) {
                    await this.addPricePoint(sale);
                  }
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
            async () => {
              stopFn?.();
              const finalData = Array.from(accumulatedMap.values());
              // Final Save: keepOnClear is set to true
              await this.saveAndNotify(
                CACHE_KEY,
                SaleEvents.SALES_UPDATED,
                finalData,
                "data",
                true, // keepOnClear
              );
              resolve(finalData);
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
    return sales.find((s) => s.id === saleId) || null;
  }

  static async getCachedSales(): Promise<Sale[] | null> {
    const cached = await storageService.get<{
      data: Sale[];
      timestamp: number;
    }>(CACHE_KEY);
    return cached?.data ?? null;
  }

  static async getNewSalesCount(): Promise<number> {
    const cached = await this.getCachedSales();
    return cached ? cached.filter((s) => s.isNew).length : 0;
  }

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
      true, // keepOnClear
    );
  }

  /** Fixed the event key bug and improved point checking */
  static async addPricePoint(sale: Sale): Promise<void> {
    const cached = await storageService.get<{
      data: { id: string; points: { price: number; timestamp: number }[] }[];
      timestamp: number;
    }>(PRICE_HISTORY_CACHE);

    const existing = cached?.data?.find((x) => x.id === sale.id);
    const last = existing?.points?.[existing.points.length - 1];

    if (last && last.price === sale.price) return;

    const newPoints = [
      ...(existing?.points || []),
      { price: sale.price, timestamp: Date.now() },
    ].slice(-MAX_PRICE_POINTS);

    // Using upsertIntoListCache with keepOnClear set to true
    await this.upsertIntoListCache(
      PRICE_HISTORY_CACHE,
      SaleEvents.PRICE_HISTORY_UPDATED,
      {
        id: sale.id,
        points: newPoints,
      },
      true, // keepOnClear
    );
  }

  static async getPriceHistory(
    saleId: string,
  ): Promise<{ price: number; timestamp: number }[]> {
    const cached = await storageService.get<{
      data: {
        id: string;
        points: { price: number; timestamp: number }[];
      }[];
      timestamp: number;
    }>(PRICE_HISTORY_CACHE);

    const record = cached?.data?.find((x) => x.id === saleId);
    return record?.points ?? [];
  }
}
