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
   * Streams sales from the API, accumulates them, caches them,
   * optionally emits updates, and resolves when the stream finishes.
   */
  private static _streamAndCache(onUpdate?: (chunk: Sale[]) => void): {
    promise: Promise<Sale[]>;
    stop: () => void;
  } {
    const accumulated: Sale[] = [];
    let stop!: () => void;

    const promise = new Promise<Sale[]>((resolve, reject) => {
      stop = ApiUtils.stream(
        BASE_ENDPOINT,
        (event) => {
          try {
            const chunk = SaleMapper.convertToSales(event.data);

            chunk.forEach((sale) => {
              if (!accumulated.find((s) => s.id === sale.id)) {
                accumulated.push(sale);
              }
            });

            onUpdate?.(chunk);
            cacheSalesData(accumulated);
          } catch (err) {
            stop();
            reject(err);
          }
        },
        (err) => {
          stop();
          reject(err);
        },
        () => {
          stop();
          resolve(accumulated);
        }
      );
    });

    return { promise, stop };
  }

  /**
   * Get sales.
   * - Uses cache if valid
   * - Streams from API if cache is missing or expired
   * - Optionally provides live updates via onUpdate
   */
  static async getSales(options?: {
    forceUpdate?: boolean;
    onUpdate?: (chunk: Sale[]) => void;
  }): Promise<Sale[]> {
    const forceUpdate = options?.forceUpdate ?? false;
    const onUpdate = options?.onUpdate;

    if (!forceUpdate) {
      const cached = await getCachedSalesData();
      if (cached && !Utils.isCacheExpired(cached.timestamp)) {
        return cached.sales;
      }
    }

    const { promise } = this._streamAndCache(onUpdate);
    return promise;
  }

  /** Get a single sale by ID */
  static async getSaleById(saleId: string): Promise<Sale | null> {
    const sales = await this.getSales();
    return sales.find((sale) => sale.id === saleId) || null;
  }
}
