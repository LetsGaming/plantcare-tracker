import ApiUtils from "@/utils/apiUtils";
import ToastService from "@/services/general/ToastService";
import storageService from "@/services/general/StorageService";
import WateringMapper from "@/mapping/WateringMapping";
import Utils from "@/utils/utils";

const BASE_ENDPOINT = "/watering";
const CACHE_KEY_WATERING_RECORDS = "watering_records_data";
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Helper function to get cache key for watering records
const getCacheKey = () => CACHE_KEY_WATERING_RECORDS;

// Helper function to retrieve cached watering records
async function getCachedWateringRecords() {
  return await storageService.get<{
    records: WateringRecord[];
    timestamp: number;
  }>(getCacheKey());
}

// Helper function to cache watering records data
async function cacheWateringRecords(records: WateringRecord[]) {
  await storageService.set(getCacheKey(), { records, timestamp: Date.now() });
}

// Invalidate watering record cache
async function invalidateWateringCache() {
  await storageService.remove(CACHE_KEY_WATERING_RECORDS);
}

// Fetch watering records from the API and cache them
async function fetchAndCacheWateringRecords(
  plantId: number
): Promise<WateringRecord[]> {
  try {
    const response = await ApiUtils.get(`${BASE_ENDPOINT}/plant/${plantId}`);
    const records = WateringMapper.convertToWateringRecords(response);
    await cacheWateringRecords(records);
    return records;
  } catch (error) {
    ToastService.showError(`Error fetching watering records: ${error}`);
    throw error;
  }
}

export default class WateringService {
  // Fetch all watering records with optional cache and force update flag
  static async getWateringRecords(
    plantId: number,
    forceUpdate: boolean = false
  ): Promise<WateringRecord[]> {
    const cachedData = await getCachedWateringRecords();

    // Return cached data if it's valid and not forcing update
    if (
      !forceUpdate &&
      cachedData &&
      !Utils.isCacheExpired(cachedData.timestamp, CACHE_EXPIRY_MS)
    ) {
      return cachedData.records;
    }

    // Otherwise, fetch fresh data and cache it
    return await fetchAndCacheWateringRecords(plantId);
  }

  // Fetch a specific watering record by ID
  static async getWateringRecordById(
    recordId: number,
    forceUpdate: boolean = false
  ): Promise<WateringRecord> {
    const cachedData = await getCachedWateringRecords();

    // If valid cache exists, search for the record by ID
    if (
      cachedData &&
      !forceUpdate &&
      !Utils.isCacheExpired(cachedData.timestamp, CACHE_EXPIRY_MS)
    ) {
      const record = cachedData.records.find((r) => r.id === recordId);
      if (record) {
        return record;
      }
    }

    // If not found in cache, fetch from API
    try {
      const response = await ApiUtils.get(`${BASE_ENDPOINT}/${recordId}`);
      const record = WateringMapper.convertToWateringRecords(response)[0];
      return record;
    } catch (error) {
      ToastService.showError(
        `Error fetching watering record details: ${error}`
      );
      throw error;
    }
  }

  // Add a new watering record
  static async addWateringRecord(
    plantId: number,
    addWateringRecord: AddWateringRecord
  ): Promise<any> {
    try {
      const endpoint = `${BASE_ENDPOINT}/${plantId}`;
      const response = await ApiUtils.post(endpoint, addWateringRecord);
      await invalidateWateringCache(); // Invalidate cache after adding a new record
      return response;
    } catch (error) {
      ToastService.showError(`Error adding watering record: ${error}`);
      throw error;
    }
  }

  // Update an existing watering record
  static async editWateringRecord(
    recordId: number,
    updatedData: {
      date?: string;
      amount?: number;
      usedFertilizer?: boolean;
      fertilizerType?: string;
    }
  ): Promise<any> {
    try {
      const response = await ApiUtils.patch(
        `${BASE_ENDPOINT}/${recordId}`,
        updatedData
      );
      await invalidateWateringCache(); // Invalidate cache after editing a record
      return response;
    } catch (error) {
      ToastService.showError(`Error updating watering record: ${error}`);
      throw error;
    }
  }

  // Delete a watering record
  static async deleteWateringRecord(recordId: number): Promise<any> {
    try {
      const response = await ApiUtils.delete(`${BASE_ENDPOINT}/${recordId}`);
      await invalidateWateringCache(); // Invalidate cache after deleting a record
      return response;
    } catch (error) {
      ToastService.showError(`Error deleting watering record: ${error}`);
      throw error;
    }
  }
}
