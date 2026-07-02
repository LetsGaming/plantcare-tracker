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
 * ## Mutation strategy — optimistic
 *
 * Create, edit, and delete paint the expected outcome into the `plants_all`
 * cache immediately (a temporary negative id for creates) and reconcile with
 * the full plant the server returns — or roll back just the affected item on
 * failure. Views react to PLANTS_UPDATED and never refetch after mutations.
 */
import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import storageService from "@/services/general/StorageService";
import PlantMapper from "@/mapping/PlantMapping";
import WateringService from "./WateringService";
import ImageService from "@/services/ImageService";
import UserService from "./UserService";
import SubstrateService from "./SubstrateService";
import Utils from "@/utils/utils";

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

  // ── Mutations — optimistic ────────────────────────────────────────────────────
  // Each mutation paints the expected outcome into the cache immediately
  // (views react to PLANTS_UPDATED), then reconciles with the full plant the
  // server returns — or rolls back just the affected item on failure.
  // handleRequest still owns the single error toast.

  /**
   * Creates a new plant via POST /plants (optimistic).
   *
   * The plant appears in the cache instantly under a temporary negative id
   * and is swapped in place for the server plant on success — so the
   * returned Plant carries the real id for dependent calls such as the
   * initial image upload.
   *
   * @returns The mapped server plant.
   */
  static async addPlant(plantToAdd: AddPlant): Promise<Plant> {
    // `image` is handled by uploadPlantImage after creation — never sent here.
    const { image: _image, ...body } = plantToAdd;

    const [userId, substrates] = await Promise.all([
      UserService.getUserId(),
      // Best-effort name lookup for the optimistic card; the picker the
      // user just used has warmed this cache in practice.
      SubstrateService.getAllSubstrates().catch(() => [] as Substrate[]),
    ]);
    const substrateName =
      substrates.find((s) => s.id === plantToAdd.substrateId)?.name ?? "";

    const optimistic: Plant = {
      id: -Date.now(), // temp id — replaced by the server id on reconcile
      userId: userId ?? -1,
      name: plantToAdd.name,
      species: plantToAdd.species,
      description: plantToAdd.species,
      isPublic: plantToAdd.isPublic ?? false,
      created_at: Utils.convertDateMillis(Date.now()),
      imageUrl: undefined,
      substrate: { id: plantToAdd.substrateId, name: substrateName },
      images: [],
    };

    return this.optimisticListUpsert<Plant, Plant>({
      cacheKey: CACHE_KEY_ALL,
      eventKey: PlantEvents.PLANTS_UPDATED,
      optimisticItem: optimistic,
      request: async () =>
        PlantMapper.mapPlant(
          await this.handleRequest(
            ApiUtils.post<typeof body, APIPlant>(BASE_ENDPOINT, body),
            RESOURCE_KEY,
            "error.action_failed",
          ),
        ),
      reconcile: (plant) => plant,
    });
  }

  /**
   * Updates an existing plant via PATCH /plants/:id (optimistic).
   *
   * The merged plant is painted immediately; the previous state of that
   * one plant is restored if the request fails.
   *
   * @returns The mapped server plant.
   */
  static async editPlant(
    plantId: number,
    updatedPlantData: EditPlant,
  ): Promise<Plant> {
    const existing = (await this.getAllPlants()).find((p) => p.id === plantId);

    let substrate = existing?.substrate ?? null;
    if (updatedPlantData.substrateId !== undefined) {
      const substrates = await SubstrateService.getAllSubstrates().catch(
        () => [] as Substrate[],
      );
      substrate = {
        id: updatedPlantData.substrateId,
        name:
          substrates.find((s) => s.id === updatedPlantData.substrateId)?.name ??
          "",
      };
    }

    const optimistic: Plant = {
      id: plantId,
      userId: existing?.userId ?? -1,
      name: updatedPlantData.name ?? existing?.name ?? "",
      species: updatedPlantData.species ?? existing?.species ?? "",
      description: updatedPlantData.species ?? existing?.description ?? "",
      isPublic: updatedPlantData.isPublic ?? existing?.isPublic ?? false,
      created_at: existing?.created_at ?? Utils.convertDateMillis(Date.now()),
      imageUrl: existing?.imageUrl,
      substrate,
      images: existing?.images ?? [],
    };

    return this.optimisticListUpsert<Plant, Plant>({
      cacheKey: CACHE_KEY_ALL,
      eventKey: PlantEvents.PLANTS_UPDATED,
      optimisticItem: optimistic,
      request: async () =>
        PlantMapper.mapPlant(
          await this.handleRequest(
            ApiUtils.patch<EditPlant, APIPlant>(
              `${BASE_ENDPOINT}/${plantId}`,
              updatedPlantData,
            ),
            RESOURCE_KEY,
            "error.action_failed",
          ),
        ),
      reconcile: (plant) => plant,
    });
  }

  /**
   * Deletes a plant via DELETE /plants/:id (optimistic).
   *
   * The plant disappears immediately and is re-inserted at its original
   * position if the request fails. The watering cache for the plant is
   * cleared only after the server has confirmed the delete.
   */
  static async deletePlant(plantId: number): Promise<void> {
    await this.optimisticListRemove<Plant, unknown>({
      cacheKey: CACHE_KEY_ALL,
      eventKey: PlantEvents.PLANTS_UPDATED,
      itemId: plantId,
      request: () =>
        this.handleRequest(
          ApiUtils.delete<void>(`${BASE_ENDPOINT}/${plantId}`),
          RESOURCE_KEY,
          "error.action_failed",
        ),
    });
    await WateringService.invalidatePlantCache(plantId);
  }

  /**
   * Uploads an image for a plant via POST /images/plant/:id.
   *
   * Delegates to ImageService, then refreshes just this plant via
   * GET /plants/:id so the new image metadata lands in the cache without
   * discarding the rest of the list or the watering history.
   */
  static async uploadPlantImage(
    plantId: number,
    image: File,
    date?: string | Date,
  ): Promise<any> {
    const response = await ImageService.uploadImage(image, "plant", plantId, date);
    await this.handleRequest(this.fetchFromApi(plantId), RESOURCE_KEY);
    return response;
  }
}
