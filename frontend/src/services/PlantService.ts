/**
 * services/PlantService.ts
 *
 * Entity-centric service for managing plant data.
 *
 * ## Architecture
 *
 * A single cache (`plants_all`) holds all plants visible to the current user
 * (own plants + public plants from other users). Derived views (personal, public)
 * are computed in-memory by filtering the cache.
 *
 * ## V2 API endpoints used
 *
 * | Method | Path             | Purpose                          |
 * |--------|------------------|----------------------------------|
 * | GET    | /plants          | Fetch all visible plants         |
 * | GET    | /plants/:id      | Fetch / refresh a single plant   |
 * | POST   | /plants          | Create a new plant               |
 * | PATCH  | /plants/:id      | Update a plant                   |
 * | DELETE | /plants/:id      | Delete a plant                   |
 *
 * Images are managed via ImageService (POST/PATCH/DELETE /images/plant/:id).
 *
 * ## Cache invalidation
 *
 * - After create → full cache clear (plant might affect public view)
 * - After update / delete → targeted ID-based removal + re-fetch
 */
import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import storageService from "@/services/general/StorageService";
import PlantMapper from "@/mapping/PlantMapping";
import WateringService from "./WateringService";
import ImageService from "@/services/ImageService";
import UserService from "./UserService";

const BASE_ENDPOINT = "/plants";
const RESOURCE_KEY = "plants.title";
const CACHE_KEY_ALL = "plants_all";

/** Events emitted when the plant cache changes */
export enum PlantEvents {
  /** Fired whenever the plant entity list changes */
  PLANTS_UPDATED = "plants-updated",
}

export default class PlantService extends BaseService {
  // ── Cache helpers ────────────────────────────────────────────────────────────

  private static async savePlants(plants: Plant[]): Promise<void> {
    await this.saveAndNotify(CACHE_KEY_ALL, PlantEvents.PLANTS_UPDATED, plants);
  }

  /**
   * Invalidates the plant cache.
   *
   * - Without `plantId`: clears the entire plant cache
   * - With `plantId`: removes that plant from the cached list and
   *   cascades to the watering cache for the same plant
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

  // ── Fetching ─────────────────────────────────────────────────────────────────

  /**
   * Internal API fetcher.
   *
   * - With `id`: uses the dedicated GET /plants/:id endpoint (V2), upserts
   *   the result into the list cache.
   * - Without `id`: fetches the full list and replaces the cache.
   */
  private static async fetchFromApi(id?: number): Promise<Plant[]> {
    if (id) {
      const response = await ApiUtils.get<APIPlant>(`${BASE_ENDPOINT}/${id}`);
      const plant = PlantMapper.mapPlant(response);
      await this.upsertIntoListCache(CACHE_KEY_ALL, PlantEvents.PLANTS_UPDATED, plant);
      return [plant];
    }

    const response = await ApiUtils.get<APIPlant[]>(BASE_ENDPOINT);
    const plants = PlantMapper.convertToPlants(response);
    await this.savePlants(plants);
    return plants;
  }

  /**
   * Fetches all plants visible to the current user.
   *
   * Includes the user's own plants plus all public plants from other users.
   * The response is de-duplicated by the V2 backend before it arrives.
   *
   * @param forceUpdate Bypass cache and refetch from API
   */
  static async getAllPlants(forceUpdate = false): Promise<Plant[]> {
    const result = await this.getCachedData(
      CACHE_KEY_ALL,
      () => this.handleRequest(this.fetchFromApi(), RESOURCE_KEY),
      forceUpdate,
    );
    return result ?? [];
  }

  /**
   * Fetches a single plant by ID.
   *
   * Checks the list cache first. On a miss or when `forceUpdate` is true,
   * calls GET /plants/:id and upserts the result.
   *
   * @throws {Error} If the plant cannot be found after fetching
   */
  static async getPlantById(plantId: number, forceUpdate = false): Promise<Plant> {
    const plants = await this.getAllPlants(false);
    const cached = plants.find((p) => p.id === plantId);
    if (cached && !forceUpdate) return cached;

    const results = await this.handleRequest(this.fetchFromApi(plantId), RESOURCE_KEY);
    if (!results?.length) throw new Error(`Plant ${plantId} not found`);
    return results[0];
  }

  // ── Derived views ─────────────────────────────────────────────────────────────

  /**
   * Returns all public plants.
   *
   * Derived by filtering the entity cache — no additional API call.
   */
  static async getPublicPlants(forceUpdate = false): Promise<Plant[]> {
    return (await this.getAllPlants(forceUpdate)).filter((p) => p.isPublic);
  }

  /**
   * Returns all plants owned by the current user.
   *
   * Includes both public and private plants owned by the user.
   * Derived by filtering the entity cache — no additional API call.
   */
  static async getPersonalPlants(forceUpdate = false): Promise<Plant[]> {
    const [plants, userId] = await Promise.all([
      this.getAllPlants(forceUpdate),
      UserService.getUserId(),
    ]);
    return plants.filter((p) => p.userId === userId);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────────

  /**
   * Creates a new plant via POST /plants.
   *
   * Performs a full cache invalidation after creation because the new plant
   * may affect the public view for other users.
   */
  static async addPlant(plantToAdd: AddPlant): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.post(BASE_ENDPOINT, plantToAdd),
      RESOURCE_KEY,
      "error.action_failed",
    );
    await this.invalidatePlantCache();
    return response;
  }

  /**
   * Updates an existing plant via PATCH /plants/:id.
   *
   * Invalidates the specific plant entry in the cache and triggers
   * a re-fetch to keep derived views consistent.
   */
  static async editPlant(plantId: number, updatedPlantData: EditPlant): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.patch(`${BASE_ENDPOINT}/${plantId}`, updatedPlantData),
      RESOURCE_KEY,
      "error.action_failed",
    );
    await this.invalidatePlantCache(plantId);
    return response;
  }

  /**
   * Deletes a plant via DELETE /plants/:id.
   *
   * Removes the plant entity from the cache and cascades the invalidation
   * to the associated watering records.
   */
  static async deletePlant(plantId: number): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.delete(`${BASE_ENDPOINT}/${plantId}`),
      RESOURCE_KEY,
      "error.action_failed",
    );
    await this.invalidatePlantCache(plantId);
    return response;
  }

  /**
   * Uploads an image for a plant via POST /images/plant/:id.
   *
   * Delegates to ImageService and then invalidates the plant cache entry
   * so the updated image metadata is reflected in the UI.
   */
  static async uploadPlantImage(
    plantId: number,
    image: File,
    date?: string | Date,
  ): Promise<any> {
    const response = await ImageService.uploadImage(image, "plant", plantId, date);
    await this.invalidatePlantCache(plantId);
    return response;
  }
}
