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

async function fetchAndCacheSalesData(): Promise<Sale[]> {
  try {
    const response = await ApiUtils.get(BASE_ENDPOINT);
    const sales = SaleMapper.convertToSales(response);
    await cacheSalesData(sales);

    return sales;
  } catch (error) {
    ToastService.showError(`Error fetching sales data: ${error}`);
    throw error;
  }
}

export default class SalesService {
  static async getSalesData(forceUpdate = false): Promise<Sale[]> {
    if (forceUpdate) {
      return await fetchAndCacheSalesData();
    }

    const cachedData = await getCachedSalesData();

    if (cachedData && !Utils.isCacheExpired(cachedData.timestamp)) {
      return cachedData.sales;
    }

    return await fetchAndCacheSalesData();
  }
}
