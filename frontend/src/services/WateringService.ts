import ApiUtils from "@/utils/apiUtils";
import ToastService from "@/services/general/ToastService";
import storageService from "@/services/general/StorageService";
import WateringMapper from "@/mapping/WateringMapping";
import Utils from "@/utils/utils";

const BASE_ENDPOINT = "/watering";
const CACHE_KEY_WATERING_RECORDS = "watering_records_data";
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Helper function to get all cached watering records
async function getCachedWateringRecords() {
  return await storageService.get<{
    recordsByPlant: { [plantId: number]: WateringRecord[] };
    timestamp: number;
  }>(CACHE_KEY_WATERING_RECORDS);
}

// Helper function to cache watering records while preserving data for other plants
async function cacheWateringRecords(
  plantId: number,
  newRecords: WateringRecord[]
) {
  const cachedData = await getCachedWateringRecords();
  const existingRecordsByPlant = cachedData?.recordsByPlant || {};

  // Merge new records while keeping records for other plants
  const updatedRecordsByPlant = {
    ...existingRecordsByPlant,
    [plantId]: newRecords,
  };

  await storageService.set(CACHE_KEY_WATERING_RECORDS, {
    recordsByPlant: updatedRecordsByPlant,
    timestamp: Date.now(),
  });
}

// Fetch and update cache for a specific plant
async function fetchAndCacheWateringRecords(
  plantId: number
): Promise<WateringRecord[]> {
  try {
    const response = await ApiUtils.get(`${BASE_ENDPOINT}/plant/${plantId}`);
    const newRecords = WateringMapper.convertToWateringRecords(response);

    await cacheWateringRecords(plantId, newRecords);
    return newRecords;
  } catch (error) {
    ToastService.showError(`Error fetching watering records: ${error}`);
    throw error;
  }
}

export default class WateringService {
  // Invalidate cache for a specific plant
  static async invalidateWateringCache(plantId: number) {
    const cachedData = await getCachedWateringRecords();
    if (!cachedData) return;

    const updatedRecordsByPlant = { ...cachedData.recordsByPlant };
    delete updatedRecordsByPlant[plantId];

    await storageService.set(CACHE_KEY_WATERING_RECORDS, {
      recordsByPlant: updatedRecordsByPlant,
      timestamp: Date.now(),
    });
  }

  // Fetch records for a specific plant
  static async getWateringRecords(
    plantId: number,
    forceUpdate: boolean = false
  ): Promise<WateringRecord[]> {
    const cachedData = await getCachedWateringRecords();

    if (
      !forceUpdate &&
      cachedData &&
      !Utils.isCacheExpired(cachedData.timestamp)
    ) {
      return cachedData.recordsByPlant[plantId] || [];
    }

    return await fetchAndCacheWateringRecords(plantId);
  }

  // Fetch a specific watering record by ID
  static async getWateringRecordById(
    plantId: number,
    recordId: number,
    forceUpdate: boolean = false
  ): Promise<WateringRecord | null> {
    const cachedData = await getCachedWateringRecords();

    if (
      cachedData &&
      !forceUpdate &&
      !Utils.isCacheExpired(cachedData.timestamp)
    ) {
      return (
        cachedData.recordsByPlant[plantId]?.find((r) => r.id === recordId) ||
        null
      );
    }

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
      const response = await ApiUtils.post<any, { waterRecordId: number }>(
        endpoint,
        addWateringRecord
      );
      if (response) {
        const newRecord = {
          id: response.waterRecordId,
          plantId: plantId,
          date: Utils.convertDateString(addWateringRecord.date.toISOString()),
          usedFertilizer: addWateringRecord.usedFertilizer,
          fertilizerType: addWateringRecord.fertilizerType || null,
        } as WateringRecord;
        // Retrieve and update the cache
        const cachedData = await getCachedWateringRecords();
        const existingRecords = cachedData?.recordsByPlant[plantId] || [];
        const data = [...existingRecords, newRecord] as WateringRecord[];
        await cacheWateringRecords(plantId, data);
      } else {
        throw new Error("Failed to add watering record");
      }

      return response;
    } catch (error) {
      ToastService.showError(`Error adding watering record: ${error}`);
      throw error;
    }
  }

  // Update an existing watering record
  static async editWateringRecord(
    plantId: number,
    recordId: number,
    updatedData: {
      date?: string;
      usedFertilizer?: boolean;
      fertilizerType?: string;
    }
  ): Promise<any> {
    try {
      const response = await ApiUtils.patch(
        `${BASE_ENDPOINT}/${recordId}`,
        updatedData
      );

      // Retrieve and update the cache
      const cachedData = await getCachedWateringRecords();
      const existingRecords = cachedData?.recordsByPlant[plantId] || [];
      const updatedRecords = existingRecords.map((record) =>
        record.id === recordId ? { ...record, ...updatedData } : record
      );

      await cacheWateringRecords(plantId, updatedRecords as WateringRecord[]);
      return response;
    } catch (error) {
      ToastService.showError(`Error updating watering record: ${error}`);
      throw error;
    }
  }

  // Delete a watering record
  static async deleteWateringRecord(
    plantId: number,
    recordId: number
  ): Promise<any> {
    try {
      const response = await ApiUtils.delete(`${BASE_ENDPOINT}/${recordId}`);

      // Retrieve and update the cache
      const cachedData = await getCachedWateringRecords();
      const existingRecords = cachedData?.recordsByPlant[plantId] || [];
      const updatedRecords = existingRecords.filter((r) => r.id !== recordId);

      await cacheWateringRecords(plantId, updatedRecords);
      return response;
    } catch (error) {
      ToastService.showError(`Error deleting watering record: ${error}`);
      throw error;
    }
  }
}
