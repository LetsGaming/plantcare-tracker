import ApiUtils from "@/utils/apiUtils";
import ToastService from "@/services/general/ToastService";
import storageService from "@/services/general/StorageService";
import Utils from "@/utils/utils";
import MoreInfoMapper from "@/mapping/MoreInforMaping";

const BASE_ENDPOINT = "/more-info";
const CACHE_KEY_WATERING_RECORDS = "more_info_data";

async function invalidateInfoCache() {
  // Invalidate the cache for all info data
  await storageService.remove(CACHE_KEY_WATERING_RECORDS);
}

async function getCachedMoreInfo() {
  return await storageService.get<{
    recordsByPlant: { [plantName: string]: MoreInfo[] };
    timestamp: number;
  }>(CACHE_KEY_WATERING_RECORDS);
}

async function cacheMoreInfo(plantName: string, newRecords: MoreInfo[]) {
  const cachedData = await getCachedMoreInfo();
  const existingRecordsByPlant = cachedData?.recordsByPlant || {};

  // Merge new records while keeping records for other plants
  const updatedRecordsByPlant = {
    ...existingRecordsByPlant,
    [plantName]: newRecords,
  };

  await storageService.set(CACHE_KEY_WATERING_RECORDS, {
    recordsByPlant: updatedRecordsByPlant,
    timestamp: Date.now(),
  });
}

// Fetch and update cache for a specific plant
async function fetchAndCacheMoreInfo(plantName: string): Promise<MoreInfo[]> {
  try {
    const response = await ApiUtils.post(BASE_ENDPOINT, { plantName, htmlFormatting: true });
    const newRecords = MoreInfoMapper.convertToMoreInfo(
      response as APIMoreInfo
    );

    return newRecords;
  } catch (error) {
    ToastService.showError(`Error fetching watering records: ${error}`);
    throw error;
  }
}

export default class MoreInfoService {
  // Invalidate cache for a specific plant
  static async invalidateInfoCache(plantName: string) {
    const cachedData = await getCachedMoreInfo();
    if (!cachedData) return;

    const updatedRecordsByPlant = { ...cachedData.recordsByPlant };
    delete updatedRecordsByPlant[plantName];

    await storageService.set(CACHE_KEY_WATERING_RECORDS, {
      recordsByPlant: updatedRecordsByPlant,
      timestamp: Date.now(),
    });
  }

  // Fetch more info for a specific plant
  static async getMoreInfo(
    plantName: string,
    forceUpdate: boolean = false
  ): Promise<MoreInfo[]> {
    if (forceUpdate) {
      return await fetchAndCacheMoreInfo(plantName);
    }

    const cacheKey = plantName;
    const cachedData = await getCachedMoreInfo();

    if (!cachedData || !cachedData.recordsByPlant[cacheKey]) {
      return await fetchAndCacheMoreInfo(plantName);
    }

    return cachedData.recordsByPlant[cacheKey];
  }

  // Fetch a specific watering record by Name
  static async getMoreInfoByName(
    plantName: string,
    forceUpdate: boolean = false
  ): Promise<MoreInfo[] | null> {
    const cachedData = await getCachedMoreInfo();

    if (
      cachedData &&
      !forceUpdate &&
      !Utils.isCacheExpired(cachedData.timestamp)
    ) {
      return (
        cachedData.recordsByPlant[plantName] ??
        (await fetchAndCacheMoreInfo(plantName))
      );
    }

    return fetchAndCacheMoreInfo(plantName);
  }
}
