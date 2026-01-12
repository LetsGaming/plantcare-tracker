import ApiUtils from "@/utils/apiUtils";
import storageService from "./general/StorageService";
import SaleMapper from "@/mapping/SaleMapping";
import Utils from "@/utils/utils";

const BASE_ENDPOINT = "/sales";
const CACHE_KEY_SALES_DATA = "sales_data";

async function getCachedSalesData() {
  return await storageService.get<{
    sales: Sale[];
    timestamp: number;
  }>(CACHE_KEY_SALES_DATA);
}

async function cacheSalesData(sales: Sale[]) {
  await storageService.set(CACHE_KEY_SALES_DATA, {
    sales,
    timestamp: Date.now(),
  });
}

export default class SalesService {
  /**
   * Internal worker to stream data and compare it against the "known" snapshot.
   */
  private static _streamAndCache(
    existingIds: Set<string>,
    onUpdate?: (chunk: Sale[]) => void
  ): { promise: Promise<Sale[]>; stop: () => void } {
    const accumulated: Sale[] = [];
    let stopFn: () => void;

    const promise = new Promise<Sale[]>((resolve, reject) => {
      stopFn = ApiUtils.stream(
        BASE_ENDPOINT,
        (event) => {
          try {
            const rawChunk = SaleMapper.convertToSales(event.data);

            // Flag items: True if the ID was NOT in the cache when we started
            const flaggedChunk = rawChunk.map((sale) => ({
              ...sale,
              isNew: !existingIds.has(sale.id),
            }));

            // Deduplicate and accumulate for final storage
            flaggedChunk.forEach((sale) => {
              if (!accumulated.find((s) => s.id === sale.id)) {
                accumulated.push(sale);
              }
            });

            // Emit the flagged results to the UI immediately
            onUpdate?.(flaggedChunk);

            // Incrementally update storage so data isn't lost if the tab closes
            cacheSalesData(accumulated);
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

    return { promise, stop: () => stopFn() };
  }

  /**
   * Main entry point.
   * Compares incoming network data against localStorage to flag new items.
   */
  static async getSales(options?: {
    forceUpdate?: boolean;
    onUpdate?: (chunk: Sale[]) => void;
  }): Promise<Sale[]> {
    const forceUpdate = options?.forceUpdate ?? false;
    const cached = await getCachedSalesData();

    const isExpired = !cached || Utils.isCacheExpired(cached.timestamp);

    // 1. Create a Snapshot of current knowledge
    const existingIds = new Set(cached?.sales.map((s) => s.id) || []);

    // 2. Return cache if valid and not forced
    if (!forceUpdate && !isExpired && cached) {
      // When returning from cache, items aren't "new" anymore for this session
      return cached.sales.map((s) => ({ ...s, isNew: false }));
    }

    // 3. Otherwise, stream from API and flag against the snapshot
    const { promise } = this._streamAndCache(existingIds, options?.onUpdate);
    return promise;
  }

  /** Get a single sale by ID from the current dataset */
  static async getSaleById(saleId: string): Promise<Sale | null> {
    const sales = await this.getSales();
    return sales.find((sale) => sale.id === saleId) || null;
  }

  static async getNewSalesCount(): Promise<number> {
    const cached = await getCachedSalesData();
    if (!cached) {
      return 0;
    }
    return cached.sales.filter((sale) => sale.isNew).length;
  }

  static async markSaleAsSeen(saleId: string): Promise<void> {
    const cached = await getCachedSalesData();
    if (!cached) {
      return;
    }
    const updatedSales = cached.sales.map((sale) => {
      if (sale.id === saleId) {
        return { ...sale, isNew: false };
      }
      return sale;
    });
    await cacheSalesData(updatedSales);
  }
}
