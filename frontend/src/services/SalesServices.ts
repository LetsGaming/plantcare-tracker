import ApiUtils from "@/utils/apiUtils";
import ToastService from "./general/ToastService";
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
   * Private helper: streams sales from the API, accumulates, caches, and optionally resolves when done.
   * @param onUpdate - Called on each chunk of sales.
   * @param waitForDone - If true, returns a promise that resolves after 'done'.
   */
  private static _streamAndCache(
    onUpdate: (sales: Sale[]) => void,
    waitForDone = false
  ): Promise<Sale[]> | (() => void) {
    const accumulated: Sale[] = [];

    // Shared handler to avoid duplication
    const handleEvent = (event: { data: any }) => {
      const chunk = SaleMapper.convertToSales(event.data);

      chunk.forEach((s) => {
        if (!accumulated.find((x) => x.id === s.id)) {
          accumulated.push(s);
        }
      });

      onUpdate(chunk);
      cacheSalesData(accumulated);
    };

    if (waitForDone) {
      return new Promise<Sale[]>((resolve, reject) => {
        const stop = ApiUtils.stream(
          BASE_ENDPOINT,
          (event) => {
            try {
              handleEvent(event);
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
    }

    return ApiUtils.stream(BASE_ENDPOINT, (event) => {
      try {
        handleEvent(event);
      } catch (err) {
        console.error("Error processing streamed sales data:", err);
      }
    });
  }

  /** Get sales, using cache or streaming if no valid cache */
  static async getSales(forceUpdate = false): Promise<Sale[]> {
    if (!forceUpdate) {
      const cached = await getCachedSalesData();
      if (cached && !Utils.isCacheExpired(cached.timestamp)) {
        return cached.sales;
      }
    }

    // No valid cache → stream and resolve when done
    return this._streamAndCache(() => {}, true) as Promise<Sale[]>;
  }

  /** Get a single sale by ID */
  static async getSaleById(saleId: string): Promise<Sale | null> {
    const sales = await this.getSales();
    return sales.find((sale) => sale.id === saleId) || null;
  }

  /** Continuous streaming for UI updates */
  static streamSales(onUpdate: (sales: Sale[]) => void): () => void {
    return this._streamAndCache(onUpdate, false) as () => void;
  }
}
