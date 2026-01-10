import ApiUtils from "@/utils/apiUtils";
import ToastService from "@/services/general/ToastService";
import storageService from "@/services/general/StorageService";
import PlantMapper from "@/mapping/PlantMapping";
import Utils from "@/utils/utils";
import WateringService from "./WateringService";
import ImageService from "@/services/ImageService";
import localizationService from "@/services/general/LocalizationService";

const BASE_ENDPOINT = "/plants";
const CACHE_KEY_PUBLIC_PLANTS = "public_plants_data";
const CACHE_KEY_PRIVATE_PLANTS = "private_plants_data";

// Helper function to get cache key based on plant type
const getCacheKey = (isPublic: boolean) =>
  isPublic ? CACHE_KEY_PUBLIC_PLANTS : CACHE_KEY_PRIVATE_PLANTS;

// Helper function to get endpoint based on plant type
const getEndpoint = (isPublic: boolean) =>
  isPublic ? `${BASE_ENDPOINT}/public` : `${BASE_ENDPOINT}/private`;

// Helper function to retrieve cached data by key
async function getCachedPlants(cacheKey: string) {
  return await storageService.get<{ plants: Plant[]; timestamp: number }>(
    cacheKey
  );
}

// Helper function to cache plants data
async function cachePlants(cacheKey: string, plants: Plant[]) {
  await storageService.set(cacheKey, { plants, timestamp: Date.now() });
}

async function cachePlant(plant: Plant, isPublic: boolean) {
  const cacheKey = getCacheKey(isPublic);
  const cachedData = await getCachedPlants(cacheKey);
  if (!cachedData) return;
  const updatedPlants = [...cachedData.plants, plant];
  await storageService.set(cacheKey, {
    plants: updatedPlants,
    timestamp: cachedData.timestamp,
  });
}

// Fetch plants from the API and cache them
async function fetchAndCachePlants(isPublic: boolean): Promise<Plant[]> {
  try {
    const response = await ApiUtils.get(getEndpoint(isPublic));
    const plants = PlantMapper.convertToPlants(response);
    await cachePlants(getCacheKey(isPublic), plants);
    return plants;
  } catch (error) {
    if (ApiUtils.isApiError(error) && error.status === 404) {
      // No plants found; return empty array
      return [];
    }
    ToastService.showError({ key: 'error.fetch_failed', vars: { resource: localizationService.t('plants.title'), details: String(error) }, fallback: `Error fetching plants: ${error}` });
    throw error;
  }
}

async function fetchAndCachePlant(
  plantId: number,
  isPublic: boolean
): Promise<Plant> {
  try {
    const response = await ApiUtils.get(`${BASE_ENDPOINT}/plant/${plantId}`);
    const plant = PlantMapper.convertToPlants(response)[0];
    await cachePlant(plant, isPublic);
    return plant;
  } catch (error) {
    ToastService.showError({ key: 'error.fetch_failed', vars: { resource: localizationService.t('plants.title'), details: String(error) }, fallback: `Error fetching plant: ${error}` });
    throw error;
  }
}

export default class PlantService {
  // Invalidate both public and private plant caches
  static async invalidatePlantsCache() {
    await storageService.remove(CACHE_KEY_PUBLIC_PLANTS);
    await storageService.remove(CACHE_KEY_PRIVATE_PLANTS);
  }

  static async invalidatePlantCache(plantId: number, isPublic: boolean) {
    await WateringService.invalidateWateringCacheForPlant(plantId);
    const cacheKey = getCacheKey(isPublic);
    const cachedData = await getCachedPlants(cacheKey);
    if (!cachedData) return;
    // Keep the plant with the given plantId and remove the others
    const updatedPlants = cachedData.plants.filter((p) => p.id !== plantId);
    // Re-cache the updated plants list (with just the requested plant)
    await storageService.set(cacheKey, {
      plants: updatedPlants,
      timestamp: cachedData.timestamp,
    });
  }

  static async getPlants(
    isPublic: boolean,
    forceUpdate: boolean = false
  ): Promise<Plant[]> {
    if (forceUpdate) {
      return await fetchAndCachePlants(isPublic);
    }

    const cacheKey = getCacheKey(isPublic);
    const cachedData = await getCachedPlants(cacheKey);

    // Return cached data if it's still valid and not forcing update
    if (cachedData && !Utils.isCacheExpired(cachedData.timestamp)) {
      return cachedData.plants;
    }

    // Otherwise fetch fresh data and cache it
    return await fetchAndCachePlants(isPublic);
  }

  static async getPlantById(
    plantId: number,
    isPublic: boolean,
    forceUpdate: boolean = false
  ): Promise<Plant> {
    const cacheKey = getCacheKey(isPublic);
    const cachedData = await getCachedPlants(cacheKey);

    // If a valid cache is found, search for the plant by ID
    if (
      cachedData &&
      !forceUpdate &&
      !Utils.isCacheExpired(cachedData.timestamp)
    ) {
      const plant = cachedData.plants.find((p) => p.id == plantId);
      if (plant) {
        return plant;
      }
    }

    // If not found in cache, fetch from API (try both public and private endpoints)
    try {
      // Invalidate both caches after fetching individual plant
      await this.invalidatePlantCache(plantId, isPublic);
      return await fetchAndCachePlant(plantId, isPublic);
    } catch (error) {
      ToastService.showError({ key: 'error.fetch_failed', vars: { resource: localizationService.t('plants.title'), details: String(error) }, fallback: `Error fetching plant details: ${error}` });
      throw error;
    }
  }

  static async addPlant(plantToAdd: AddPlant): Promise<any> {
    try {
      const response = await ApiUtils.post(BASE_ENDPOINT, plantToAdd);
      await this.invalidatePlantsCache(); // Invalidate the cache after adding a plant
      return response;
    } catch (error) {
      ToastService.showError({ key: 'error.action_failed', vars: { action: localizationService.t('plant.add.title') || localizationService.t('plant.added'), resource: localizationService.t('plants.title'), details: String(error) }, fallback: `Error adding plant: ${error}` });
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
      await this.invalidatePlantCache(
        plantId,
        updatedPlantData.isPublic || false
      ); // Invalidate the cache after editing a plant
      return response;
    } catch (error) {
      ToastService.showError({ key: 'error.action_failed', vars: { action: localizationService.t('plant.edit.title') || localizationService.t('plant.save'), resource: localizationService.t('plants.title'), details: String(error) }, fallback: `Error updating plant: ${error}` });
      throw error;
    }
  }

  static async uploadPlantImage(
    plantId: number,
    image: File,
    date?: string | Date
  ): Promise<any> {
    try {
      const response = await ImageService.uploadImage(
        image,
        "plant",
        plantId,
        date
      );
      await this.invalidatePlantCache(plantId, false); // Invalidate the cache after uploading an image
      return response;
    } catch (error) {
      ToastService.showError({ key: 'error.action_failed', vars: { action: localizationService.t('image.upload'), resource: localizationService.t('plants.title'), details: String(error) }, fallback: `Error uploading plant image: ${error}` });
      throw error;
    }
  }

  static async deletePlant(plantId: number): Promise<any> {
    try {
      const response = await ApiUtils.delete(`${BASE_ENDPOINT}/${plantId}`);
      await this.invalidatePlantsCache(); // Invalidate the cache after deleting a plant
      await WateringService.invalidateWateringCacheForPlant(plantId);
      return response;
    } catch (error) {
      ToastService.showError({ key: 'error.action_failed', vars: { action: localizationService.t('plant.delete.confirm') || localizationService.t('plant.deleted'), resource: localizationService.t('plants.title'), details: String(error) }, fallback: `Error deleting plant: ${error}` });
      throw error;
    }
  }
}
