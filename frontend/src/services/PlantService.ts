import ApiUtils from "@/utils/apiUtils";
import ToastService from "@/services/general/ToastService";
import storageService from "@/services/general/StorageService";
import PlantMapper from "@/mapping/PlantMapping";
import Utils from "@/utils/utils";

const BASE_ENDPOINT = "/plants";
const CACHE_KEY_PUBLIC_PLANTS = "public_plants_data";
const CACHE_KEY_PRIVATE_PLANTS = "private_plants_data";
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Helper function to get cache key based on plant type
const getCacheKey = (isPublic: boolean) => 
  isPublic ? CACHE_KEY_PUBLIC_PLANTS : CACHE_KEY_PRIVATE_PLANTS;

// Helper function to get endpoint based on plant type
const getEndpoint = (isPublic: boolean) =>
  isPublic ? `${BASE_ENDPOINT}/public` : `${BASE_ENDPOINT}/private`;

// Helper function to retrieve cached data by key
async function getCachedPlants(cacheKey: string) {
  return storageService.get<{ plants: Plant[]; timestamp: number }>(cacheKey);
}

// Helper function to cache plants data
async function cachePlants(cacheKey: string, plants: Plant[]) {
  await storageService.set(cacheKey, { plants, timestamp: Date.now() });
}

// Invalidate both public and private plant caches
async function invalidatePlantCache() {
  await storageService.remove(CACHE_KEY_PUBLIC_PLANTS);
  await storageService.remove(CACHE_KEY_PRIVATE_PLANTS);
}

// Fetch plants from the API and cache them
async function fetchAndCachePlants(isPublic: boolean): Promise<Plant[]> {
  try {
    const response = await ApiUtils.get(getEndpoint(isPublic));
    const plants = PlantMapper.convertToPlants(response);
    await cachePlants(getCacheKey(isPublic), plants);
    return plants;
  } catch (error) {
    ToastService.showError(`Error fetching plants: ${error}`);
    throw error;
  }
}

export default class PlantService {
  static async getPlants(isPublic: boolean, forceUpdate: boolean = false): Promise<Plant[]> {
    const cacheKey = getCacheKey(isPublic);
    const cachedData = await getCachedPlants(cacheKey);

    // Return cached data if it's still valid and not forcing update
    if (!forceUpdate && cachedData && !Utils.isCacheExpired(cachedData.timestamp, CACHE_EXPIRY_MS)) {
      return cachedData.plants;
    }

    // Otherwise fetch fresh data and cache it
    return await fetchAndCachePlants(isPublic);
  }

  static async getPlantById(plantId: number, forceUpdate: boolean = false): Promise<Plant> {
    // First, try fetching from the public cache
    let cachedData = await getCachedPlants(CACHE_KEY_PUBLIC_PLANTS);

    // If plant is not found in the public cache, check private cache
    if (!cachedData || Utils.isCacheExpired(cachedData.timestamp, CACHE_EXPIRY_MS)) {
      cachedData = await getCachedPlants(CACHE_KEY_PRIVATE_PLANTS);
    }

    // If a valid cache is found, search for the plant by ID
    if (cachedData) {
      const plant = cachedData.plants.find((p) => p.id === plantId);
      if (plant) {
        return plant;
      }
    }

    // If not found in cache, fetch from API (try both public and private endpoints)
    try {
      const response = await ApiUtils.get(`${BASE_ENDPOINT}/${plantId}`);
      const plant = PlantMapper.convertToPlants(response)[0];

      // Invalidate both caches after fetching individual plant
      await invalidatePlantCache();
      return plant;
    } catch (error) {
      ToastService.showError(`Error fetching plant details: ${error}`);
      throw error;
    }
  }

  static async addPlant(plantToAdd: AddPlant): Promise<any> {
    try {
      const response = await ApiUtils.post(BASE_ENDPOINT, plantToAdd);
      await invalidatePlantCache(); // Invalidate the cache after adding a plant
      return response;
    } catch (error) {
      ToastService.showError(`Error adding plant: ${error}`);
      throw error;
    }
  }

  static async editPlant(plantId: number, updatedPlantData: EditPlant): Promise<any> {
    try {
      const response = await ApiUtils.patch(`${BASE_ENDPOINT}/${plantId}`, updatedPlantData);
      await invalidatePlantCache(); // Invalidate the cache after editing a plant
      return response;
    } catch (error) {
      ToastService.showError(`Error updating plant: ${error}`);
      throw error;
    }
  }
}
