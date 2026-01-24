import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import storageService from "@/services/general/StorageService";
import PlantMapper from "@/mapping/PlantMapping";
import WateringService from "./WateringService";
import ImageService from "@/services/ImageService";
import UserService from "./UserService";

/**
 * Base API endpoint for all plant-related requests.
 */
const BASE_ENDPOINT = "/plants";

/**
 * Translation key for plant-related UI messages.
 */
const RESOURCE_KEY = "plants.title";

/**
 * Single cache key containing all plants the current user
 * is allowed to see.
 *
 * This cache is the single source of truth.
 * Public and personal views are derived from it.
 */
const CACHE_KEY_ALL = "plants_all";

/**
 * Events emitted when the plant cache changes.
 */
export enum PlantEvents {
  /**
   * Fired whenever the plant entity list changes.
   * Used by UI layers to refresh derived views.
   */
  PLANTS_UPDATED = "plants-updated",
}

/**
 * PlantService
 *
 * Entity-centric service for managing plant data.
 *
 * Architectural principles:
 * - One cache containing all visible plant entities
 * - Cache invalidation is always ID-based
 * - Public and personal tabs are derived views
 * - Visibility (isPublic) is a filter, not a cache boundary
 */
export default class PlantService extends BaseService {
  /* =========================================================================
     Cache helpers
     ========================================================================= */

  /**
   * Persists the full plant list into storage and notifies listeners.
   *
   * @param plants The updated list of plant entities
   */
  private static async savePlants(plants: Plant[]): Promise<void> {
    await this.saveAndNotify(CACHE_KEY_ALL, PlantEvents.PLANTS_UPDATED, plants);
  }

  /**
   * Invalidates the plant cache.
   *
   * Behavior:
   * - Without plantId: clears the entire plant cache
   * - With plantId: removes that plant from the cached list
   *
   * This method is intentionally ID-based because a plant
   * can appear in multiple UI views simultaneously.
   *
   * @param plantId Optional plant ID to invalidate
   */
  static async invalidatePlantCache(plantId?: number): Promise<void> {
    if (!plantId) {
      await storageService.remove(CACHE_KEY_ALL);
      return;
    }

    const stored = await storageService.get<{ data: Plant[] }>(CACHE_KEY_ALL);
    if (!stored?.data) return;

    const updated = stored.data.filter((p) => p.id !== plantId);
    await this.savePlants(updated);

    await WateringService.invalidatePlantCache(plantId);
  }

  /* =========================================================================
     Fetching
     ========================================================================= */

  /**
   * Fetches all plants the current user is allowed to see.
   *
   * Uses a single cached list as the source of truth.
   *
   * @param forceUpdate If true, bypasses the cache and refetches from the API
   * @returns A list of all visible plants
   */
  static async getAllPlants(forceUpdate: boolean = false): Promise<Plant[]> {
    const result = await this.getCachedData(
      CACHE_KEY_ALL,
      () =>
        this.handleRequest(
          ApiUtils.get<APIPlant[]>(BASE_ENDPOINT).then((res) => {
            const plants = PlantMapper.convertToPlants(res);
            this.savePlants(plants);
            return plants;
          }),
          RESOURCE_KEY
        ),
      forceUpdate
    );

    return result || [];
  }

  /**
   * Fetches a single plant by ID.
   *
   * The cache is checked first. If the plant is missing
   * or forceUpdate is enabled, it is fetched from the API
   * and upserted into the entity cache.
   *
   * @param plantId The plant ID to fetch
   * @param forceUpdate If true, always refetch from the API
   * @returns The requested plant entity
   */
  static async getPlantById(
    plantId: number,
    forceUpdate: boolean = false
  ): Promise<Plant> {
    const plants = await this.getAllPlants(false);
    const cached = plants.find((p) => p.id === plantId);

    if (cached && !forceUpdate) return cached;

    const plant = await this.handleRequest(
      ApiUtils.get<APIPlant>(`${BASE_ENDPOINT}/plant/${plantId}`).then(
        (res) => PlantMapper.convertToPlants(res)[0]
      ),
      RESOURCE_KEY
    );

    await this.upsertIntoListCache(
      CACHE_KEY_ALL,
      PlantEvents.PLANTS_UPDATED,
      plant
    );

    return plant;
  }

  /* =========================================================================
     View selectors
     ========================================================================= */

  /**
   * Returns all public plants.
   *
   * This is a derived view based on the entity cache.
   *
   * @param forceUpdate If true, refetches the entity cache
   * @returns All plants marked as public
   */
  static async getPublicPlants(forceUpdate: boolean = false): Promise<Plant[]> {
    const plants = await this.getAllPlants(forceUpdate);
    return plants.filter((p) => p.isPublic);
  }

  /**
   * Returns all plants belonging to the given user.
   *
   * Includes both public and private plants owned by the user.
   *
   * @param userId The ID of the current user
   * @param forceUpdate If true, refetches the entity cache
   * @returns All plants owned by the user
   */
  static async getPersonalPlants(
    forceUpdate: boolean = false
  ): Promise<Plant[]> {
    const userId = await UserService.getUserId();
    const plants = await this.getAllPlants(forceUpdate);
    return plants.filter((p) => p.userId === userId);
  }

  /* =========================================================================
     Mutations
     ========================================================================= */

  /**
   * Creates a new plant.
   *
   * A full cache invalidation is used because the new plant
   * may affect multiple derived views.
   *
   * @param plantToAdd Plant creation payload
   * @returns API response
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

  /**
   * Updates an existing plant.
   *
   * Invalidates the plant by ID to ensure all derived views
   * are updated consistently.
   *
   * @param plantId The ID of the plant to update
   * @param updatedPlantData Update payload
   * @returns API response
   */
  static async editPlant(
    plantId: number,
    updatedPlantData: EditPlant
  ): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.patch(`${BASE_ENDPOINT}/${plantId}`, updatedPlantData),
      RESOURCE_KEY,
      "error.action_failed"
    );

    await this.invalidatePlantCache(plantId);
    return response;
  }

  /**
   * Deletes a plant.
   *
   * Removes the plant entity from the cache and updates all views.
   *
   * @param plantId The ID of the plant to delete
   * @returns API response
   */
  static async deletePlant(plantId: number): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.delete(`${BASE_ENDPOINT}/${plantId}`),
      RESOURCE_KEY,
      "error.action_failed"
    );

    await this.invalidatePlantCache(plantId);
    return response;
  }

  /**
   * Uploads an image for a plant.
   *
   * After upload, the plant is invalidated to ensure
   * updated image metadata is reflected in the UI.
   *
   * @param plantId The plant ID
   * @param image Image file to upload
   * @param date Optional date associated with the image
   * @returns API response
   */
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

    await this.invalidatePlantCache(plantId);
    return response;
  }
}
