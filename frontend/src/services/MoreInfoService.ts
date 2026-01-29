import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import MoreInfoMapper from "@/mapping/MoreInforMaping";
import storageService from "@/services/general/StorageService";

/**
 * Base API endpoint for external plant information.
 */
const BASE_ENDPOINT = "/more-info";

/**
 * Translation key for UI messages.
 */
const RESOURCE_KEY = "moreinfo.title";

/**
 * Cache key for the dictionary of plant information.
 */
const CACHE_KEY = "more_info_data";

/**
 * Events emitted when the info cache changes.
 */
export enum MoreInfoEvents {
  /** Fired when info for a specific plant name is updated or cleared. */
  INFO_UPDATED = "more-info-updated",
}

/**
 * MoreInfoService
 * * Fetches and caches detailed information about plant species.
 * Utilizes the dictionary-keyed caching pattern from BaseService where
 * the plant name serves as the lookup key.
 */
export default class MoreInfoService extends BaseService {
  /* =========================================================================
     Cache Helpers
     ========================================================================= */

  /**
   * Invalidates the cache for a specific plant name or wipes it entirely.
   * * @param plantName Optional plant name to remove from the dictionary
   */
  static async invalidateInfoCache(plantName?: string): Promise<void> {
    if (!plantName) {
      await storageService.remove(CACHE_KEY);
      return;
    }

    const stored = await storageService.get<{
      data: Record<string, MoreInfo[]>;
    }>(CACHE_KEY);
    if (!stored?.data) return;

    const updated = { ...stored.data };
    delete updated[plantName];

    // Persist the updated dictionary and notify listeners
    await this.saveAndNotify(CACHE_KEY, MoreInfoEvents.INFO_UPDATED, updated);
  }

  /* =========================================================================
     Fetching
     ========================================================================= */

  /**
   * Fetches detailed information for a specific plant name.
   * * @param plantName The name of the plant (e.g., "Monstera Deliciosa")
   * @param forceUpdate If true, bypasses cache and refetches
   */
  static async getMoreInfo(
    plantName: string,
    forceUpdate: boolean = false,
  ): Promise<MoreInfo[]> {
    return this.getFromDictionaryCache<MoreInfo[]>(
      CACHE_KEY,
      plantName,
      () => this.handleRequest(this.fetchFromApi(plantName), RESOURCE_KEY),
      forceUpdate,
    );
  }

  /**
   * Internal fetcher with specialized 404 handling.
   * 404 is treated as a successful empty state (no info found).
   */
  private static async fetchFromApi(plantName: string): Promise<MoreInfo[]> {
    try {
      const response = await ApiUtils.getWithParams(BASE_ENDPOINT, {
        plantName,
        htmlFormatting: "true",
      });
      return MoreInfoMapper.convertToMoreInfo(response as APIMoreInfo);
    } catch (error) {
      if (ApiUtils.isApiError(error) && error.status === 404) {
        return [];
      }
      throw error;
    }
  }
}