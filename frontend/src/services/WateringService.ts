import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import storageService from "@/services/general/StorageService";
import WateringMapper from "@/mapping/WateringMapping";

const BASE_ENDPOINT = "/watering";
const CACHE_KEY_RECORDS = "watering_records_data";
const CACHE_KEY_FERTILIZER = "fertilizer_types_data";
const RESOURCE_KEY = "watering.title";

export default class WateringService extends BaseService {
  /**
   * Fetches watering records for a specific plant with dictionary caching.
   */
  static async getWateringRecords(
    plantId: number,
    forceUpdate: boolean = false
  ): Promise<WateringRecord[]> {
    return this.getFromDictionaryCache(
      CACHE_KEY_RECORDS,
      plantId.toString(),
      () => this.handleRequest(this.fetchRecordsFromApi(plantId), RESOURCE_KEY),
      forceUpdate
    );
  }

  /**
   * Internal fetcher with 404 handling for empty history.
   */
  private static async fetchRecordsFromApi(
    plantId: number
  ): Promise<WateringRecord[]> {
    try {
      const response = await ApiUtils.get(`${BASE_ENDPOINT}/plant/${plantId}`);
      return WateringMapper.convertToWateringRecords(response);
    } catch (error) {
      if (ApiUtils.isApiError(error) && error.status === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Fetches lookup data for fertilizer types with standard caching.
   */
  static async getFertilizerTypes(
    forceUpdate: boolean = false
  ): Promise<FertilizerType[]> {
    return this.getCachedData(
      CACHE_KEY_FERTILIZER,
      () =>
        this.handleRequest(
          ApiUtils.get(`${BASE_ENDPOINT}/fertilizer-types`).then((res) =>
            WateringMapper.convertToFertilizerTypes(res)
          ),
          "watering.fertilizer_types"
        ),
      forceUpdate
    );
  }

  /**
   * Fetches a specific record, checking the keyed cache first.
   */
  static async getWateringRecordById(
    plantId: number,
    recordId: number,
    forceUpdate: boolean = false
  ): Promise<WateringRecord | null> {
    const records = await this.getWateringRecords(plantId, forceUpdate);
    const found = records.find((r) => r.id === recordId);

    if (found && !forceUpdate) return found;

    return this.handleRequest(
      ApiUtils.get(`${BASE_ENDPOINT}/${recordId}`).then(
        (res) => WateringMapper.convertToWateringRecords(res)[0]
      ),
      "watering.record"
    );
  }

  /**
   * Mutations
   */
  static async addWateringRecord(
    plantId: number,
    data: AddWateringRecord
  ): Promise<any> {
    const res = await this.handleRequest(
      ApiUtils.post(`${BASE_ENDPOINT}/${plantId}`, data),
      "watering.record",
      "watering.add"
    );
    await this.invalidateWateringCacheForPlant(plantId);
    return res;
  }

  static async editWateringRecord(
    plantId: number,
    recordId: number,
    data: EditWateringRecord
  ): Promise<any> {
    const res = await this.handleRequest(
      ApiUtils.patch(`${BASE_ENDPOINT}/${recordId}`, data),
      "watering.record",
      "watering.update"
    );
    await this.invalidateWateringCacheForPlant(plantId);
    return res;
  }

  static async deleteWateringRecord(
    plantId: number,
    recordId: number
  ): Promise<any> {
    const res = await this.handleRequest(
      ApiUtils.delete(`${BASE_ENDPOINT}/${recordId}`),
      "watering.record",
      "watering.delete"
    );
    await this.invalidateWateringCacheForPlant(plantId);
    return res;
  }

  /**
   * Cache Management
   */
  static async invalidateWateringCacheForPlant(plantId: number) {
    const cached = await storageService.get<{
      records: any;
      timestamp: number;
    }>(CACHE_KEY_RECORDS);
    if (!cached?.records) return;

    const updated = { ...cached.records };
    delete updated[plantId.toString()];

    await storageService.set(CACHE_KEY_RECORDS, {
      records: updated,
      timestamp: Date.now(),
    });
  }

  static async invalidateWateringCache() {
    await storageService.remove(CACHE_KEY_RECORDS);
    await storageService.remove(CACHE_KEY_FERTILIZER);
  }
}
