import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import storageService from "@/services/general/StorageService";
import SubstrateMapper from "@/mapping/SubstrateMapping";
import UserService from "./UserService";
import ImageService from "./ImageService";

const BASE_ENDPOINT = "/substrates";
const RESOURCE_KEY = "substrate.title";
const CACHE_KEY_ALL = "substrates_all";

export enum SubstrateEvents {
  SUBSTRATES_UPDATED = "substrates-updated",
}

export default class SubstrateService extends BaseService {
  /* =========================================================================
      Cache helpers
      ========================================================================= */

  /**
   * Persist the full substrate list into storage and notify listeners
   * @param substrates Array of substrate entities
   */
  private static async saveSubstrates(substrates: Substrate[]): Promise<void> {
    await this.saveAndNotify(
      CACHE_KEY_ALL,
      SubstrateEvents.SUBSTRATES_UPDATED,
      substrates,
    );
  }

  /**
   * Invalidate the substrate cache.
   * If substrateId is provided, removes only that substrate.
   * Otherwise, clears the entire cache.
   * @param substrateId Optional substrate ID to remove
   */
  static async invalidateSubstrateCache(substrateId?: number): Promise<void> {
    if (!substrateId) {
      await storageService.remove(CACHE_KEY_ALL);
      return;
    }

    const stored = await storageService.get<{ data: Substrate[] }>(
      CACHE_KEY_ALL,
    );
    if (!stored?.data) return;

    const updated = stored.data.filter((s) => s.id !== substrateId);
    await this.saveSubstrates(updated);
  }

  /* =========================================================================
      Fetching
      ========================================================================= */

  /**
   * Internal fetcher that handles API calls and cache upserting.
   * Always returns an array to keep the type signature consistent.
   */
  private static async fetchFromApi(id?: number): Promise<Substrate[]> {
    try {
      // If an ID is provided, we use the specific detail endpoint, otherwise the list endpoint
      const endpoint = id ? `${BASE_ENDPOINT}/substrate/${id}` : BASE_ENDPOINT;
      const response = await ApiUtils.get<APISubstrate | APISubstrate[]>(
        endpoint,
      );

      const substrates = SubstrateMapper.convertToSubstrates(response);

      if (id) {
        const substrate = substrates[0];
        if (substrate) {
          await this.upsertIntoListCache(
            CACHE_KEY_ALL,
            SubstrateEvents.SUBSTRATES_UPDATED,
            substrate,
          );
          return [substrate];
        }
        return [];
      } else {
        await this.saveSubstrates(substrates);
        return substrates;
      }
    } catch (error: any) {
      if (ApiUtils.isApiError(error) && error.status === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Fetch all substrates (public + private) and update the single cache.
   * @param forceUpdate If true, bypass cache and refetch from API
   * @returns Array of all substrates
   */
  static async getAllSubstrates(
    forceUpdate: boolean = false,
  ): Promise<Substrate[]> {
    const result = await this.getCachedData(
      CACHE_KEY_ALL,
      () => this.handleRequest(this.fetchFromApi(), RESOURCE_KEY),
      forceUpdate,
    );

    return result || [];
  }

  /**
   * Fetch a single substrate by ID, updating the cache if necessary.
   * @param substrateId ID of the substrate
   * @param forceUpdate If true, always refetch from API
   * @returns The substrate entity
   */
  static async getSubstrateById(
    substrateId: number,
    forceUpdate: boolean = false,
  ): Promise<Substrate> {
    const substrates = await this.getAllSubstrates(false);
    const cached = substrates.find((s) => s.id === substrateId);

    if (cached && !forceUpdate) return cached;

    const results = await this.handleRequest(
      this.fetchFromApi(substrateId),
      RESOURCE_KEY,
    );

    if (!results || results.length === 0) {
      throw new Error(`Substrate with ID ${substrateId} not found.`);
    }

    return results[0];
  }

  /* =========================================================================
      Derived views
      ========================================================================= */

  /**
   * Returns only public substrates
   * @param forceUpdate If true, refetches entity cache
   * @returns Array of public substrates
   */
  static async getPublicSubstrates(
    forceUpdate: boolean = false,
  ): Promise<Substrate[]> {
    const all = await this.getAllSubstrates(forceUpdate);
    return all.filter((s) => s.isPublic);
  }

  /**
   * Returns only private substrates
   * @param forceUpdate If true, refetches entity cache
   * @returns Array of private substrates
   */
  static async getPrivateSubstrates(
    forceUpdate: boolean = false,
  ): Promise<Substrate[]> {
    const all = await this.getAllSubstrates(forceUpdate);
    const userId = await UserService.getUserId();
    return all.filter((s) => s.userId === userId);
  }

  /* =========================================================================
      Mutations
      ========================================================================= */

  /**
   * Add a new substrate
   * @param substrateData Substrate creation payload
   * @returns API response
   */
  static async addSubstrate(substrateData: AddSubstrate): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.post(BASE_ENDPOINT, substrateData),
      RESOURCE_KEY,
      "error.action_failed",
    );

    await this.invalidateSubstrateCache();
    return response;
  }

  /**
   * Add a substrate along with components
   * @param substrateData Substrate creation payload
   * @param componentsData Optional components data
   * @returns ID of the created substrate
   */
  static async addSubstrateWithComponents(
    substrateData: AddSubstrate,
    componentsData?: AddSubstrateComponents,
  ): Promise<number> {
    const substrateResponse = await this.addSubstrate(substrateData);
    const substrateId = (substrateResponse as { substrateId: number })
      .substrateId;

    if (componentsData?.components?.length) {
      componentsData.substrateId = substrateId;
      await this.handleRequest<SubstrateComponent[]>(
        ApiUtils.post(
          `${BASE_ENDPOINT}/components/${substrateId}`,
          componentsData,
        ),
        RESOURCE_KEY,
      );
    }

    return substrateId;
  }

  /**
   * Edit substrate metadata
   * @param substrateId ID of the substrate
   * @param data Substrate update payload
   * @returns API response
   */
  static async editSubstrate(
    substrateId: number,
    data: EditSubstrate,
  ): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.patch(`${BASE_ENDPOINT}/${substrateId}`, data),
      RESOURCE_KEY,
      "error.action_failed",
    );

    await this.invalidateSubstrateCache(substrateId);
    return response;
  }

  /**
   * Edit substrate components
   * @param substrateId ID of the substrate
   * @param components Array of updated components
   * @returns API response
   */
  static async editSubstrateComponents(
    substrateId: number,
    components: EditSubstrateComponent[],
  ): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.patch(`${BASE_ENDPOINT}/components/${substrateId}`, {
        components,
      }),
      RESOURCE_KEY,
      "substrate.components.edit.title",
    );

    await this.getSubstrateById(substrateId, true);
    return response;
  }

  /**
   * Delete a substrate
   * @param substrateId ID of the substrate
   * @returns API response
   */
  static async deleteSubstrate(substrateId: number): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.delete(`${BASE_ENDPOINT}/${substrateId}`),
      RESOURCE_KEY,
      "error.action_failed",
    );

    await this.invalidateSubstrateCache(substrateId);
    return response;
  }

  /**
   * Upload an image for a substrate
   * @param substrateId ID of the substrate
   * @param image File to upload
   * @param date Optional date associated with image
   * @returns API response
   */
  static async uploadSubstrateImage(
    substrateId: number,
    image: File,
    date?: string | Date,
    doInvalidate: boolean = true,
  ): Promise<any> {
    const response = await ImageService.uploadImage(
      image,
      "substrate",
      substrateId,
      date,
    );

    if (doInvalidate) {
      await this.invalidateSubstrateCache(substrateId);
    }
    return response;
  }
}
