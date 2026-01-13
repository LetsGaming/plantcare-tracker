import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import MoreInfoMapper from "@/mapping/MoreInforMaping";
import storageService from "@/services/general/StorageService";

const BASE_ENDPOINT = "/more-info";
const CACHE_KEY = "more_info_data";
const RESOURCE_KEY = "moreinfo.title";

export default class MoreInfoService extends BaseService {
  /**
   * Internal fetcher with specialized 404 handling.
   * We keep this private to wrap it in handleRequest later.
   */
  private static async fetchFromApi(plantName: string): Promise<MoreInfo[]> {
    try {
      const response = await ApiUtils.getWithParams(BASE_ENDPOINT, {
        plantName,
        htmlFormatting: "true",
      });
      return MoreInfoMapper.convertToMoreInfo(response as APIMoreInfo);
    } catch (error) {
      // 404 is a "successful" empty state for this domain
      if (ApiUtils.isApiError(error) && error.status === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Fetches more info for a specific plant using keyed caching.
   */
  static async getMoreInfo(
    plantName: string,
    forceUpdate: boolean = false
  ): Promise<MoreInfo[]> {
    return this.getFromDictionaryCache(
      CACHE_KEY,
      plantName,
      () => this.handleRequest(this.fetchFromApi(plantName), RESOURCE_KEY),
      forceUpdate
    );
  }

  /**
   * Unified alias for getMoreInfo (DRYing up the original redundant method).
   */
  static async getMoreInfoByName(
    plantName: string,
    forceUpdate: boolean = false
  ): Promise<MoreInfo[]> {
    return this.getMoreInfo(plantName, forceUpdate);
  }

  /**
   * Removes a specific plant's records from the local cache.
   */
  static async invalidateInfoCache(plantName: string): Promise<void> {
    const cached = await storageService.get<{ 
      records: { [key: string]: any }; 
      timestamp: number 
    }>(CACHE_KEY);

    if (!cached?.records) return;

    const updatedRecords = { ...cached.records };
    delete updatedRecords[plantName];

    await storageService.set(CACHE_KEY, {
      records: updatedRecords,
      timestamp: Date.now(),
    });
  }
}