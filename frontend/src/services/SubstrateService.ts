/**
 * services/SubstrateService.ts
 *
 * Entity-centric service for managing substrate data.
 *
 * ## V2 API endpoints used
 *
 * | Method | Path                        | Purpose                              |
 * |--------|-----------------------------|--------------------------------------|
 * | GET    | /substrates                 | All public + own substrates (deduped)|
 * | GET    | /substrates/:id             | Single substrate by ID               |
 * | POST   | /substrates                 | Create a new substrate               |
 * | PATCH  | /substrates/:id             | Update name / isPublic / remove comps|
 * | POST   | /substrates/:id/components  | Add components to a substrate        |
 * | PATCH  | /substrates/:id/components  | Upsert (replace) substrate components|
 * | DELETE | /substrates/:id             | Delete a substrate                   |
 *
 * ## Cache invalidation
 *
 * - After create → full cache clear
 * - After update / delete → targeted ID-based removal
 */
import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import storageService from "@/services/general/StorageService";
import SubstrateMapper from "@/mapping/SubstrateMapping";
import UserService from "./UserService";
import ImageService from "./ImageService";

const BASE_ENDPOINT = "/substrates";
const RESOURCE_KEY = "substrate.title";
const CACHE_KEY_ALL = "substrates_all";

/** Events emitted when the substrate cache changes */
export enum SubstrateEvents {
  SUBSTRATES_UPDATED = "substrates-updated",
}

export default class SubstrateService extends BaseService {
  // ── Cache helpers ────────────────────────────────────────────────────────────

  private static async saveSubstrates(substrates: Substrate[]): Promise<void> {
    await this.saveAndNotify(CACHE_KEY_ALL, SubstrateEvents.SUBSTRATES_UPDATED, substrates);
  }

  /**
   * Invalidates the substrate cache.
   *
   * - Without `substrateId`: clears the entire substrate cache
   * - With `substrateId`: removes only that substrate from the cached list
   */
  static async invalidateSubstrateCache(substrateId?: number): Promise<void> {
    if (!substrateId) {
      await storageService.remove(CACHE_KEY_ALL);
      return;
    }

    const stored = await storageService.get<{ data: Substrate[] }>(CACHE_KEY_ALL);
    if (!stored?.data) return;

    const updated = stored.data.filter((s) => s.id !== substrateId);
    await this.saveSubstrates(updated);
  }

  // ── Fetching ─────────────────────────────────────────────────────────────────

  /**
   * Internal API fetcher.
   *
   * - With `id`: calls GET /substrates/:id and upserts the result.
   * - Without `id`: calls GET /substrates and replaces the full cache.
   */
  private static async fetchFromApi(id?: number): Promise<Substrate[]> {
    if (id) {
      const response = await ApiUtils.get<APISubstrate>(`${BASE_ENDPOINT}/${id}`);
      const substrate = SubstrateMapper.mapSubstrate(response);
      await this.upsertIntoListCache(CACHE_KEY_ALL, SubstrateEvents.SUBSTRATES_UPDATED, substrate);
      return [substrate];
    }

    const response = await ApiUtils.get<APISubstrate[]>(BASE_ENDPOINT);
    const substrates = SubstrateMapper.convertToSubstrates(response);
    await this.saveSubstrates(substrates);
    return substrates;
  }

  /**
   * Fetches all substrates (public + own) and updates the cache.
   *
   * The V2 backend merges public and private substrates in a single response
   * and de-duplicates by substrate_id.
   *
   * @param forceUpdate Bypass cache and refetch from API
   */
  static async getAllSubstrates(forceUpdate = false): Promise<Substrate[]> {
    const result = await this.getCachedData(
      CACHE_KEY_ALL,
      () => this.handleRequest(this.fetchFromApi(), RESOURCE_KEY),
      forceUpdate,
    );
    return result ?? [];
  }

  /**
   * Fetches a single substrate by ID.
   *
   * Checks the list cache first. On a miss or when `forceUpdate` is true,
   * calls GET /substrates/:id and upserts the result.
   *
   * @throws {Error} If the substrate cannot be found after fetching
   */
  static async getSubstrateById(substrateId: number, forceUpdate = false): Promise<Substrate> {
    const substrates = await this.getAllSubstrates(false);
    const cached = substrates.find((s) => s.id === substrateId);
    if (cached && !forceUpdate) return cached;

    const results = await this.handleRequest(this.fetchFromApi(substrateId), RESOURCE_KEY);
    if (!results?.length) throw new Error(`Substrate ${substrateId} not found`);
    return results[0];
  }

  // ── Derived views ─────────────────────────────────────────────────────────────

  /** Returns only public substrates (derived from cache, no API call) */
  static async getPublicSubstrates(forceUpdate = false): Promise<Substrate[]> {
    return (await this.getAllSubstrates(forceUpdate)).filter((s) => s.isPublic);
  }

  /** Returns only substrates owned by the current user (derived from cache) */
  static async getPrivateSubstrates(forceUpdate = false): Promise<Substrate[]> {
    const [all, userId] = await Promise.all([
      this.getAllSubstrates(forceUpdate),
      UserService.getUserId(),
    ]);
    return all.filter((s) => s.userId === userId);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────────

  /**
   * Creates a new substrate via POST /substrates.
   *
   * Returns the full created substrate.
   */
  static async addSubstrate(substrateData: AddSubstrate): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.post(BASE_ENDPOINT, substrateData),
      RESOURCE_KEY,
      "error.action_failed",
    );
    // Backend returns the full created substrate — upsert it directly
    // instead of clearing the whole cache (which forced every view into
    // a refetch).
    await this.upsertIntoListCache(CACHE_KEY_ALL, SubstrateEvents.SUBSTRATES_UPDATED,
      SubstrateMapper.mapSubstrate(response as APISubstrate));
    return response;
  }

  /**
   * Creates a new substrate and optionally adds components in one workflow.
   *
   * Calls POST /substrates to create the substrate, then POST /substrates/:id/components
   * if `componentsData` is provided.
   *
   * Note: The V2 endpoint expects only `{ components: [...] }` in the body —
   * the substrate ID is carried in the URL, not the request body.
   *
   * @returns The ID of the newly created substrate
   */
  static async addSubstrateWithComponents(
    substrateData: AddSubstrate,
    componentsData?: AddSubstrateComponents,
  ): Promise<number> {
    const substrateResponse = await this.addSubstrate(substrateData);
    const substrateId = (substrateResponse as APISubstrate).substrate_id;

    if (componentsData?.components?.length) {
      const withComponents = await this.handleRequest(
        ApiUtils.post(`${BASE_ENDPOINT}/${substrateId}/components`, {
          components: componentsData.components,
        }),
        RESOURCE_KEY,
      );
      // The components endpoint answers with the full substrate including
      // its component mix — upsert the final state over the bare create.
      await this.upsertIntoListCache(CACHE_KEY_ALL, SubstrateEvents.SUBSTRATES_UPDATED,
        SubstrateMapper.mapSubstrate(withComponents as APISubstrate));
    }

    return substrateId;
  }

  /**
   * Updates substrate metadata via PATCH /substrates/:id.
   *
   * Accepts `name`, `isPublic`, and `removedComponents` in a single request.
   * See V2 UpdateSubstrateSchema for validation rules.
   */
  static async editSubstrate(substrateId: number, data: EditSubstrate): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.patch(`${BASE_ENDPOINT}/${substrateId}`, data),
      RESOURCE_KEY,
      "error.action_failed",
    );
    // Backend returns the full updated substrate — upsert it directly
    await this.upsertIntoListCache(CACHE_KEY_ALL, SubstrateEvents.SUBSTRATES_UPDATED,
      SubstrateMapper.mapSubstrate(response as APISubstrate));
    return response;
  }

  /**
   * Replaces the component mix for a substrate via PATCH /substrates/:id/components.
   *
   * The V2 endpoint uses "upsert" semantics — existing components are replaced,
   * not appended to.
   */
  static async editSubstrateComponents(
    substrateId: number,
    components: EditSubstrateComponent[],
  ): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.patch(`${BASE_ENDPOINT}/${substrateId}/components`, { components }),
      RESOURCE_KEY,
      "substrate.components.edit.title",
    );
    // Backend now returns the updated substrate — upsert it directly into the cache
    await this.upsertIntoListCache(CACHE_KEY_ALL, SubstrateEvents.SUBSTRATES_UPDATED,
      SubstrateMapper.mapSubstrate(response as APISubstrate));
    return response;
  }

  /**
   * Deletes a substrate via DELETE /substrates/:id.
   *
   * Only the owner can delete their own substrate (enforced by V2 backend).
   */
  static async deleteSubstrate(substrateId: number): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.delete(`${BASE_ENDPOINT}/${substrateId}`),
      RESOURCE_KEY,
      "error.action_failed",
    );
    await this.removeFromListCache(CACHE_KEY_ALL, SubstrateEvents.SUBSTRATES_UPDATED, substrateId);
    return response;
  }

  /**
   * Uploads an image for a substrate via POST /images/substrate/:id.
   *
   * Set `doInvalidate` to false when batching multiple uploads to avoid
   * redundant cache refreshes.
   */
  static async uploadSubstrateImage(
    substrateId: number,
    image: File,
    date?: string | Date,
    refreshCache = true,
  ): Promise<any> {
    const response = await ImageService.uploadImage(image, "substrate", substrateId, date);
    // Targeted refresh (GET /substrates/:id → upsert + event) — the old
    // invalidation dropped the substrate from every view until a refetch.
    if (refreshCache) {
      await this.handleRequest(this.fetchFromApi(substrateId), RESOURCE_KEY);
    }
    return response;
  }
}
