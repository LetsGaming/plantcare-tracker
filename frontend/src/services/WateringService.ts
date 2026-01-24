import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import storageService from "@/services/general/StorageService";
import WateringMapper from "@/mapping/WateringMapping";

const BASE_ENDPOINT = "/watering";
const CACHE_KEY_RECORDS = "watering_records_data";
const CACHE_KEY_FERTILIZER = "fertilizer_types_data";
const RESOURCE_KEY = "watering.title";

/**
 * Events for external components to listen to
 */
export enum WateringEvents {
  RECORDS_CHANGED = "watering-records-changed",
  FERTILIZER_TYPES_CHANGED = "fertilizer-types-changed",
}

export default class WateringService extends BaseService {
  /* =========================================================================
      Queries
     ========================================================================= */

  /**
   * Fetches watering records for a specific plant.
   * Uses BaseService.getFromDictionaryCache to prevent redundant API calls.
   */
  static async getWateringRecords(
    plantId: number,
    forceUpdate: boolean = false,
  ): Promise<WateringRecord[]> {
    return this.getFromDictionaryCache<WateringRecord[]>(
      CACHE_KEY_RECORDS,
      plantId.toString(),
      () => this.handleRequest(this.fetchRecordsFromApi(plantId), RESOURCE_KEY),
      forceUpdate,
    );
  }

  /**
   * Internal API fetcher with 404 safety.
   */
  private static async fetchRecordsFromApi(
    plantId: number,
  ): Promise<WateringRecord[]> {
    try {
      const response = await ApiUtils.get<APIWateringRecord[]>(
        `${BASE_ENDPOINT}/plant/${plantId}`,
      );
      return WateringMapper.convertToWateringRecords(response);
    } catch (error) {
      // If 404, the plant simply has no records yet. Return empty array.
      if (ApiUtils.isApiError(error) && error.status === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Fetches fertilizer types using standard BaseService caching.
   */
  static async getFertilizerTypes(
    forceUpdate: boolean = false,
  ): Promise<FertilizerType[]> {
    return this.getCachedData(
      CACHE_KEY_FERTILIZER,
      () =>
        this.handleRequest(
          ApiUtils.get<APIFertilizerType[]>(
            `${BASE_ENDPOINT}/fertilizer-types`,
          ).then((res) => WateringMapper.convertToFertilizerTypes(res)),
          "watering.fertilizer_types",
        ),
      forceUpdate,
    );
  }

  /* =========================================================================
      Mutations
     ========================================================================= */

  static async addWateringRecord(
    plantId: number,
    data: AddWateringRecord,
  ): Promise<void> {
    await this.handleRequest(
      ApiUtils.post(`${BASE_ENDPOINT}/${plantId}`, data),
      RESOURCE_KEY,
      "watering.add",
    );
    // Invalidate the cache for this plant so the next getter fetches fresh data
    await this.invalidatePlantCache(plantId);
    this.emit(WateringEvents.RECORDS_CHANGED, { plantId });
  }

  static async editWateringRecord(
    plantId: number,
    recordId: number,
    data: EditWateringRecord,
  ): Promise<void> {
    await this.handleRequest(
      ApiUtils.patch(`${BASE_ENDPOINT}/${recordId}`, data),
      RESOURCE_KEY,
      "watering.update",
    );
    await this.invalidatePlantCache(plantId);
    this.emit(WateringEvents.RECORDS_CHANGED, { plantId });
  }

  static async deleteWateringRecord(
    plantId: number,
    recordId: number,
  ): Promise<void> {
    await this.handleRequest(
      ApiUtils.delete(`${BASE_ENDPOINT}/${recordId}`),
      RESOURCE_KEY,
      "watering.delete",
    );
    await this.invalidatePlantCache(plantId);
    this.emit(WateringEvents.RECORDS_CHANGED, { plantId });
  }

  /* =========================================================================
      Cache Management (Internal)
     ========================================================================= */

  /**
   * Safely removes a specific plant's records from the dictionary cache.
   * This uses the standard "records" structure expected by BaseService.
   */
  static async invalidatePlantCache(plantId: number): Promise<void> {
    const cache = await storageService.get<{
      records: Record<string, WateringRecord[]>;
      timestamp: number;
    }>(CACHE_KEY_RECORDS);

    if (cache?.records) {
      const updatedRecords = { ...cache.records };
      delete updatedRecords[plantId.toString()];

      await storageService.set(CACHE_KEY_RECORDS, {
        records: updatedRecords,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Total wipe of watering-related storage.
   */
  static async clearAllWateringCache(): Promise<void> {
    await Promise.all([
      storageService.remove(CACHE_KEY_RECORDS),
      storageService.remove(CACHE_KEY_FERTILIZER),
    ]);
  }
}
