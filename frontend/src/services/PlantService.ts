import ApiUtils from "@/utils/apiUtils";
import ToastService from "@/services/general/ToastService";
import storageService from "@/services/general/StorageService";
import PlantMapper from "@/mapping/PlantMapping";
import Utils from "@/utils/utils";

const BASE_ENDPOINT = "/plants";
const CACHE_KEY_PUBLIC_PLANTS = "public_plants_data";
const CACHE_KEY_PRIVATE_PLANTS = "private_plants_data";
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

const getEndpoint = (isPublic: boolean) => {
  return isPublic ? `${BASE_ENDPOINT}/public` : `${BASE_ENDPOINT}/private`;
};

// Common function to retrieve cached plants
async function getCachedPlants(cacheKey: string) {
  return await storageService.get<{
    plants: Plant[];
    timestamp: number;
  }>(cacheKey);
}

// Common function to invalidate plant caches
async function invalidatePlantCache() {
  await storageService.remove(CACHE_KEY_PUBLIC_PLANTS);
  await storageService.remove(CACHE_KEY_PRIVATE_PLANTS);
}

// Common function to fetch and cache plants from the API
async function fetchAndCachePlants(isPublic: boolean): Promise<Plant[]> {
  try {
    const response = await ApiUtils.get(getEndpoint(isPublic));
    const plants = PlantMapper.convertToPlants(response);

    // Store the plants and current timestamp in storage
    const cacheKey = isPublic
      ? CACHE_KEY_PUBLIC_PLANTS
      : CACHE_KEY_PRIVATE_PLANTS;
    await storageService.set(cacheKey, { plants, timestamp: Date.now() });

    return plants;
  } catch (error) {
    ToastService.showError(`Error fetching plants: ${error}`);
    throw error;
  }
}

export default class PlantService {
  static async getPlants(
    isPublic: boolean,
    forceUpdate: boolean = false
  ): Promise<Plant[]> {
    const cacheKey = isPublic
      ? CACHE_KEY_PUBLIC_PLANTS
      : CACHE_KEY_PRIVATE_PLANTS;

    // Try to get the cached data
    const cachedData = await getCachedPlants(cacheKey);

    // If not forcing update, check if cached data exists and is not expired
    if (
      !forceUpdate &&
      cachedData &&
      !Utils.isCacheExpired(cachedData.timestamp, CACHE_EXPIRY_MS)
    ) {
      return cachedData.plants;
    }

    // Otherwise, fetch new data from the API
    return await fetchAndCachePlants(isPublic);
  }

  static async getPlantById(
    plantId: number,
    isPublic: boolean,
    forceUpdate: boolean = false
  ): Promise<Plant> {
    const cacheKey = isPublic
      ? CACHE_KEY_PUBLIC_PLANTS
      : CACHE_KEY_PRIVATE_PLANTS;

    // Retrieve cached plants
    const cachedData = await getCachedPlants(cacheKey);

    // Check if cached data exists and is not expired
    if (
      cachedData &&
      !Utils.isCacheExpired(cachedData.timestamp, CACHE_EXPIRY_MS)
    ) {
      const plant = cachedData.plants.find((p) => p.id === plantId);
      if (plant) {
        return plant; // Return the cached plant if found
      }
    }

    // Otherwise, fetch the plant from the API
    try {
      const response = await ApiUtils.get(
        `${getEndpoint(isPublic)}/${plantId}`
      );
      const plant = PlantMapper.convertToPlants(response)[0];

      // Refresh the cache by fetching all plants again
      await this.getPlants(isPublic, true); // Invalidate the cache

      return plant;
    } catch (error) {
      ToastService.showError(`Error fetching plant details: ${error}`);
      throw error;
    }
  }

  static async addPlant(plantToAdd: AddPlant): Promise<any> {
    try {
      const response = await ApiUtils.post(BASE_ENDPOINT, plantToAdd);
      await invalidatePlantCache(); // Invalidate the cached plants after adding a new plant

      return response; // Assuming response contains the inserted plant ID
    } catch (error) {
      ToastService.showError(`Error adding plant: ${error}`);
      throw error;
    }
  }

  static async editPlant(
    plantId: number,
    updatedPlantData: EditPlant
  ): Promise<any> {
    try {
      const response = await ApiUtils.patch(
        `${BASE_ENDPOINT}/${plantId}`,
        updatedPlantData
      );
      await invalidatePlantCache(); // Invalidate the cached plants after updating a plant

      return response; // Assuming response contains the updated plant data
    } catch (error) {
      ToastService.showError(`Error updating plant: ${error}`);
      throw error;
    }
  }
}
