import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import MoreInfoMapper from "@/mapping/MoreInforMaping";
import storageService from "@/services/general/StorageService";
import localizationService from "@/services/general/LocalizationService";

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

export enum MoreInfoEvents {
  INFO_UPDATED = "more-info-updated",
}

export default class MoreInfoService extends BaseService {
  /* =========================================================================
      Cache Helpers
     ========================================================================= */

  static async invalidateInfoCache(plantName?: string): Promise<void> {
    if (!plantName) {
      await storageService.remove(CACHE_KEY);
      return;
    }

    const stored = await storageService.get<{
      data: Record<string, MoreInfo>;
    }>(CACHE_KEY);
    if (!stored?.data) return;

    const updated = { ...stored.data };
    delete updated[plantName];

    await this.saveAndNotify(CACHE_KEY, MoreInfoEvents.INFO_UPDATED, updated);
  }

  /* =========================================================================
      Fetching & Streaming
     ========================================================================= */

  /**
   * Fetches detailed info via SSE stream.
   * Updates the cache incrementally as links and AI chunks arrive.
   */
  static async streamMoreInfo(
    plantName: string,
    onUpdate: (data: MoreInfo) => void,
    onError?: (err: any) => void,
  ): Promise<() => void> {
    // Initialize local state
    const accumulatedInfo: APIMoreInfo = {
      links: [],
      ai: "",
    };

    // Fix for Error: Property 'getCurrentLanguage' does not exist
    // Adjusted to use the 'locale' property which is standard in many Vue-I18n setups
    const lang = localizationService.locale || "en";

    const cleanup = await ApiUtils.stream<any>(
      `${BASE_ENDPOINT}?plantName=${encodeURIComponent(plantName)}&htmlFormatting=true&lang=${lang}`,
      (event) => {
        const payload = event.data;

        if (payload.type === "link") {
          accumulatedInfo.links.push(payload.value);
        } else if (payload.type === "ai_chunk") {
          accumulatedInfo.ai += payload.value;
        }

        // Fix for Error: Argument of type 'MoreInfo[]' is not assignable to parameter of type 'MoreInfo'
        // We take the first element from the mapper's array output
        const mappedArray = MoreInfoMapper.convertToMoreInfo(accumulatedInfo);
        if (mappedArray && mappedArray.length > 0) {
          onUpdate(mappedArray[0]);
        }
      },
      (err) => {
        if (onError) onError(err);
      },
      async () => {
        // Persist to dictionary cache when stream finishes
        await this.updateDictionaryEntry(plantName, accumulatedInfo);
      },
    );

    return cleanup;
  }

  /**
   * Internal helper to update a single entry in the dictionary cache.
   */
  private static async updateDictionaryEntry(
    plantName: string,
    rawData: APIMoreInfo,
  ): Promise<void> {
    const mappedArray = MoreInfoMapper.convertToMoreInfo(rawData);
    if (!mappedArray || mappedArray.length === 0) return;

    const freshEntry = mappedArray[0];

    const stored = await storageService.get<{ data: Record<string, MoreInfo> }>(
      CACHE_KEY,
    );
    const dict = stored?.data ? { ...stored.data } : {};

    dict[plantName] = freshEntry;

    await this.saveAndNotify(CACHE_KEY, MoreInfoEvents.INFO_UPDATED, dict);
  }

  /**
   * Fetches detailed information for a specific plant name.
   * Preserved for cache-checks and legacy promise-based needs.
   */
  static async getMoreInfo(
    plantName: string,
    forceUpdate: boolean = false,
  ): Promise<MoreInfo> {
    // Note: We cast the return type to MoreInfo to match the dictionary structure
    return this.getFromDictionaryCache<MoreInfo>(
      CACHE_KEY,
      plantName,
      async () => {
        // This is a fallback for the dictionary pattern
        const response = await ApiUtils.getWithParams(BASE_ENDPOINT, {
          plantName,
          htmlFormatting: "true",
        });
        const mapped = MoreInfoMapper.convertToMoreInfo(
          response as APIMoreInfo,
        );
        return mapped[0];
      },
      forceUpdate,
    );
  }
}
