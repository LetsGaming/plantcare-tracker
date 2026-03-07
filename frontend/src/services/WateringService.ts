import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import storageService from "@/services/general/StorageService";
import WateringMapper from "@/mapping/WateringMapping";

/**
 * Base API endpoint for all watering-related requests.
 */
const BASE_ENDPOINT = "/watering";

/**
 * Translation key for watering-related UI messages.
 */
const RESOURCE_KEY = "watering.title";

/**
 * Cache keys for watering records (dictionary) and fertilizer types (list).
 */
const CACHE_KEY_RECORDS = "watering_records_data";
const CACHE_KEY_FERTILIZER = "fertilizer_types_data";

/**
 * Events emitted when watering data changes.
 */
export enum WateringEvents {
  /** Fired when records for a specific plant are added, edited, or deleted. */
  RECORDS_CHANGED = "watering-records-changed",
  /** Fired if the global fertilizer type list is updated. */
  FERTILIZER_TYPES_CHANGED = "fertilizer-types-changed",
}

/**
 * WateringService
 * * Manages watering history and fertilizer types.
 * Utilizes dictionary-keyed caching provided by BaseService.
 */
export default class WateringService extends BaseService {
  /* =========================================================================
     Cache Helpers
     ========================================================================= */

  /**
   * Invalidates the watering cache for a specific plant or entirely.
   * * @param plantId Optional plant ID to remove from the dictionary
   */
  static async invalidatePlantCache(plantId?: number): Promise<void> {
    if (!plantId) {
      await storageService.remove(CACHE_KEY_RECORDS);
      return;
    }

    const stored = await storageService.get<{
      data: Record<string, WateringRecord[]>;
    }>(CACHE_KEY_RECORDS);
    if (!stored?.data) return;

    const updated = { ...stored.data };
    delete updated[plantId.toString()];

    // We update the full dictionary in storage
    await this.saveAndNotify(
      CACHE_KEY_RECORDS,
      WateringEvents.RECORDS_CHANGED,
      updated,
    );
  }

  /* =========================================================================
     Fetching
     ========================================================================= */

  /**
   * Fetches watering records for a specific plant.
   * Uses the BaseService dictionary helper to handle L1/L2 merging.
   * * @param plantId The ID of the plant
   * @param forceUpdate If true, bypasses cache
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
   * Internal API fetcher with 404 safety for plants with no history.
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
      // V2 returns [] for plants with no history (no 404 for empty lists).
      // 404 guard retained here as a safety net for truly missing plant IDs.
      if (ApiUtils.isApiError(error) && error.status === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Fetches the global list of available fertilizer types.
   */
  static async getFertilizerTypes(
    forceUpdate: boolean = false,
  ): Promise<FertilizerType[]> {
    const result = await this.getCachedData(
      CACHE_KEY_FERTILIZER,
      () =>
        this.handleRequest(
          ApiUtils.get<APIFertilizerType[]>(
            `${BASE_ENDPOINT}/fertilizer-types`,
          ).then((res) => {
            const types = WateringMapper.convertToFertilizerTypes(res);
            this.saveAndNotify(
              CACHE_KEY_FERTILIZER,
              WateringEvents.FERTILIZER_TYPES_CHANGED,
              types,
            );
            return types;
          }),
          "watering.fertilizer_types",
        ),
      forceUpdate,
    );
    return result || [];
  }

  /* =========================================================================
     Mutations
     ========================================================================= */

  /**
   * Adds a new watering record.
   */
  static async addWateringRecord(
    plantId: number,
    data: AddWateringRecord,
  ): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.post(`${BASE_ENDPOINT}/${plantId}`, data),
      RESOURCE_KEY,
      "watering.add",
    );

    await this.invalidatePlantCache(plantId);
    return response;
  }

  /**
   * Updates an existing watering record.
   */
  static async editWateringRecord(
    plantId: number,
    recordId: number,
    data: EditWateringRecord,
  ): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.patch(`${BASE_ENDPOINT}/${recordId}`, data),
      RESOURCE_KEY,
      "watering.update",
    );

    await this.invalidatePlantCache(plantId);
    return response;
  }

  /**
   * Deletes a watering record.
   */
  static async deleteWateringRecord(
    plantId: number,
    recordId: number,
  ): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.delete(`${BASE_ENDPOINT}/${recordId}`),
      RESOURCE_KEY,
      "watering.delete",
    );

    await this.invalidatePlantCache(plantId);
    return response;
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
