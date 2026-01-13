import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import storageService from "@/services/general/StorageService";
import PlantMapper from "@/mapping/PlantMapping";
import WateringService from "./WateringService";
import ImageService from "@/services/ImageService";

const BASE_ENDPOINT = "/plants";
const RESOURCE_KEY = "plants.title";
const CACHE_KEY_PUBLIC = "public_plants_data";
const CACHE_KEY_PRIVATE = "private_plants_data";

export default class PlantService extends BaseService {
  /**
   * Helper to resolve cache keys and endpoints dynamically based on visibility.
   */
  private static getContext(isPublic: boolean) {
    return {
      cacheKey: isPublic ? CACHE_KEY_PUBLIC : CACHE_KEY_PRIVATE,
      endpoint: isPublic
        ? `${BASE_ENDPOINT}/public`
        : `${BASE_ENDPOINT}/private`,
    };
  }

  /**
   * Invalidates plant caches. If no ID is provided, clears all plant data.
   */
  static async invalidatePlantCache(plantId?: number, isPublic?: boolean) {
    if (plantId !== undefined && isPublic !== undefined) {
      const { cacheKey } = this.getContext(isPublic);
      const cachedData = await storageService.get<{
        plants: Plant[];
        timestamp: number;
      }>(cacheKey);

      if (cachedData) {
        const updatedPlants = cachedData.plants.filter((p) => p.id !== plantId);
        await storageService.set(cacheKey, {
          ...cachedData,
          plants: updatedPlants,
        });
      }
      await WateringService.invalidateWateringCacheForPlant(plantId);
    } else {
      await storageService.remove(CACHE_KEY_PUBLIC);
      await storageService.remove(CACHE_KEY_PRIVATE);
    }
  }

  /**
   * Fetches all plants (Public/Private) with standardized caching.
   */
  static async getPlants(
    isPublic: boolean,
    forceUpdate: boolean = false
  ): Promise<Plant[]> {
    const { cacheKey, endpoint } = this.getContext(isPublic);

    return this.getCachedData(
      cacheKey,
      () =>
        this.handleRequest(
          ApiUtils.get(endpoint).then((res) =>
            PlantMapper.convertToPlants(res)
          ),
          RESOURCE_KEY
        ),
      forceUpdate
    );
  }

  /**
   * Fetches a single plant by ID, checking the appropriate list cache first.
   */
  static async getPlantById(
    plantId: number,
    isPublic: boolean,
    forceUpdate: boolean = false
  ): Promise<Plant> {
    const plants = await this.getPlants(isPublic, forceUpdate);
    const found = plants.find((p) => p.id == plantId);

    if (found && !forceUpdate) return found;

    // Direct fetch if not found in list or forcing update
    return this.handleRequest(
      ApiUtils.get(`${BASE_ENDPOINT}/plant/${plantId}`).then((res) => {
        const plant = PlantMapper.convertToPlants(res)[0];
        // Note: Individual fetch doesn't easily merge back into list cache
        // without risking stale data, so we just return it.
        return plant;
      }),
      RESOURCE_KEY
    );
  }

  /**
   * Standard Mutation methods (Add, Edit, Delete)
   */
  static async addPlant(plantToAdd: AddPlant): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.post(BASE_ENDPOINT, plantToAdd),
      RESOURCE_KEY,
      "error.action_failed"
    );
    await this.invalidatePlantCache();
    return response;
  }

  static async editPlant(
    plantId: number,
    updatedPlantData: EditPlant
  ): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.patch(`${BASE_ENDPOINT}/${plantId}`, updatedPlantData),
      RESOURCE_KEY,
      "error.action_failed"
    );
    await this.invalidatePlantCache(
      plantId,
      updatedPlantData.isPublic || false
    );
    return response;
  }

  static async deletePlant(plantId: number): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.delete(`${BASE_ENDPOINT}/${plantId}`),
      RESOURCE_KEY,
      "error.action_failed"
    );
    await this.invalidatePlantCache(plantId, false); // Best effort clean up
    await this.invalidatePlantCache(plantId, true);
    return response;
  }

  static async uploadPlantImage(
    plantId: number,
    image: File,
    date?: string | Date
  ): Promise<any> {
    const response = await ImageService.uploadImage(
      image,
      "plant",
      plantId,
      date
    );
    await this.invalidatePlantCache(plantId, false);
    return response;
  }
}
