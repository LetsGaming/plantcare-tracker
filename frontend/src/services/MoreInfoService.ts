import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import MoreInfoMapper from "@/mapping/MoreInforMaping";
import storageService from "@/services/general/StorageService";
import localizationService from "@/services/general/LocalizationService";

const BASE_ENDPOINT = "/more-info";
const CACHE_KEY = "more_info_data";
const RESOURCE_KEY = "moreinfo.title";

export enum MoreInfoEvents {
  MORE_INFO_UPDATED = "more-info-updated",
}

export default class MoreInfoService extends BaseService {
  /**
   * Public accessor: Fetches more info for a specific plant using keyed caching.
   * Follows SalesService logic by wrapping the stream in handleRequest.
   */
  static async getMoreInfo(
    plantName: string,
    options?: {
      forceUpdate?: boolean;
      onUpdate?: (info: MoreInfo[]) => void;
    },
  ): Promise<MoreInfo[]> {
    const forceUpdate = options?.forceUpdate ?? false;

    // Use getFromDictionaryCache to handle the per-plantName keying
    return await this.getFromDictionaryCache(
      CACHE_KEY,
      plantName,
      async () => {
        return this.handleRequest(
          this.streamMoreInfo(plantName, options?.onUpdate),
          RESOURCE_KEY,
        );
      },
      forceUpdate,
    );
  }

  /**
   * Internal Stream method: Accumulates AI chunks and links.
   * Resolves with the final mapped array when the stream closes.
   */
  private static streamMoreInfo(
    plantName: string,
    onUpdate?: (info: MoreInfo[]) => void,
  ): Promise<MoreInfo[]> {
    return new Promise((resolve, reject) => {
      const accumulatedRaw: APIMoreInfo = {
        links: [],
        ai: "",
      };

      let stopFn: (() => void) | null = null;

      (async () => {
        try {
          const lang = localizationService.getLocale();
          const params = new URLSearchParams({
            plantName,
            htmlFormatting: "true",
            lang,
          });

          const endpoint = `${BASE_ENDPOINT}?${params.toString()}`;

          stopFn = await ApiUtils.stream<any>(
            endpoint,
            (event) => {
              try {
                const payload = event.data;

                // Handle partial data types from the stream
                if (payload.type === "link") {
                  accumulatedRaw.links.push(payload.value);
                } else if (payload.type === "ai_chunk") {
                  accumulatedRaw.ai += payload.value;
                }

                // Map and trigger incremental UI update
                const mapped = MoreInfoMapper.convertToMoreInfo(accumulatedRaw);
                if (mapped.length > 0) {
                  onUpdate?.(mapped);
                }
              } catch (err) {
                stopFn?.();
                reject(err);
              }
            },
            (err) => {
              stopFn?.();
              reject(err);
            },
            async () => {
              stopFn?.();
              const finalData =
                MoreInfoMapper.convertToMoreInfo(accumulatedRaw);

              // Final Save into the Dictionary cache
              await this.updateDictionaryCache(plantName, finalData);

              resolve(finalData);
            },
          );
        } catch (err) {
          reject(err);
        }
      })();
    });
  }

  /**
   * Helper to persist data to the dictionary-style cache used by BaseService.
   */
  private static async updateDictionaryCache(
    plantName: string,
    data: MoreInfo[],
  ): Promise<void> {
    const cached = await storageService.get<{
      records: Record<string, MoreInfo[]>;
      timestamp: number;
    }>(CACHE_KEY);

    const records = cached?.records ? { ...cached.records } : {};
    records[plantName] = data;

    await storageService.set(CACHE_KEY, {
      records,
      timestamp: Date.now(),
    });

    this.emit(MoreInfoEvents.MORE_INFO_UPDATED, records);
  }

  /**
   * Removes a specific plant's records from the local cache.
   */
  static async invalidateInfoCache(plantName?: string): Promise<void> {
    if (!plantName) {
      await storageService.remove(CACHE_KEY);
      return;
    }

    const cached = await storageService.get<{
      records: Record<string, any>;
      timestamp: number;
    }>(CACHE_KEY);

    if (!cached?.records) return;

    const updatedRecords = { ...cached.records };
    delete updatedRecords[plantName];

    await storageService.set(CACHE_KEY, {
      records: updatedRecords,
      timestamp: Date.now(),
    });

    this.emit(MoreInfoEvents.MORE_INFO_UPDATED, updatedRecords);
  }

  /**
   * Unified alias for getMoreInfo.
   */
  static async getMoreInfoByName(
    plantName: string,
    forceUpdate: boolean = false,
  ): Promise<MoreInfo[]> {
    return this.getMoreInfo(plantName, { forceUpdate });
  }
}
