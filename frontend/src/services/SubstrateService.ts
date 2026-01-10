import ApiUtils from "@/utils/apiUtils";
import ToastService from "@/services/general/ToastService";
import storageService from "@/services/general/StorageService";
import SubstrateMapper from "@/mapping/SubstrateMapping";
import localizationService from "@/services/general/LocalizationService";
import Utils from "@/utils/utils";

const BASE_ENDPOINT = "/substrates";
const CACHE_KEY_PUBLIC_SUBSTRATES = "public_substrates_data";
const CACHE_KEY_PRIVATE_SUBSTRATES = "private_substrates_data";

// Helper function to get cache key based on substrate type
const getCacheKey = (isPublic: boolean) =>
  isPublic ? CACHE_KEY_PUBLIC_SUBSTRATES : CACHE_KEY_PRIVATE_SUBSTRATES;

// Helper function to get endpoint based on substrate type
const getEndpoint = (isPublic: boolean) =>
  isPublic ? `${BASE_ENDPOINT}/public` : `${BASE_ENDPOINT}/private`;

// Helper function to retrieve cached substrates by key
async function getCachedSubstrates(cacheKey: string) {
  return await storageService.get<{ substrates: any[]; timestamp: number }>(
    cacheKey
  );
}

// Helper function to cache substrates data
async function cacheSubstrates(cacheKey: string, substrates: any[]) {
  await storageService.set(cacheKey, { substrates, timestamp: Date.now() });
}

// Invalidate both public and private substrate caches
async function invalidateSubstrateCache() {
  await storageService.remove(CACHE_KEY_PUBLIC_SUBSTRATES);
  await storageService.remove(CACHE_KEY_PRIVATE_SUBSTRATES);
}

// Fetch substrates from the API and cache them
async function fetchAndCacheSubstrates(isPublic: boolean): Promise<any[]> {
  try {
    const response = await ApiUtils.get(getEndpoint(isPublic));
    const substrates = SubstrateMapper.convertToSubstrates(response);
    await cacheSubstrates(getCacheKey(isPublic), substrates);
    return substrates;
  } catch (error) {
    if (ApiUtils.isApiError(error) && error.status === 404) {
      // No substrates found; return empty array
      return [];
    }
    ToastService.showError({ key: 'error.fetch_failed', vars: { resource: localizationService.t('substrate.title'), details: String(error) }, fallback: `Error fetching substrates: ${error}` });
    throw error;
  }
}

export default class SubstrateService {
  /**
   * Fetches all substrates from both public and private endpoints.
   * Resilient to individual endpoint failures.
   */
  static async getAllSubstrates(): Promise<any[]> {
    // Execute both requests in parallel
    const results = await Promise.allSettled([
      this.getSubstrates(false), // Private
      this.getSubstrates(true), // Public
    ]);

    const uniqueSubstrates = new Map();

    results.forEach((result) => {
      if (result.status === "fulfilled" && Array.isArray(result.value)) {
        for (const substrate of result.value) {
          // Map ensures uniqueness by ID automatically
          uniqueSubstrates.set(substrate.id, substrate);
        }
      } else if (result.status === "rejected") {
        console.error("Failed to fetch substrates:", result.reason);
      }
    });

    return Array.from(uniqueSubstrates.values());
  }

  /**
   * Fetches all substrates with caching.
   * @param isPublic Determines whether to use the public or private endpoint.
   * @param forceUpdate If true, forces a fresh fetch from the API.
   */
  static async getSubstrates(
    isPublic: boolean,
    forceUpdate: boolean = false
  ): Promise<any[]> {
    if (forceUpdate) {
      return await fetchAndCacheSubstrates(isPublic);
    }

    const cacheKey = getCacheKey(isPublic);
    const cachedData = await getCachedSubstrates(cacheKey);

    if (cachedData && !Utils.isCacheExpired(cachedData.timestamp)) {
      return cachedData.substrates;
    }

    return await fetchAndCacheSubstrates(isPublic);
  }

  /**
   * Fetches a single substrate by ID.
   * First, it checks both public and private caches.
   * If not found, it fetches from the API and invalidates the caches.
   * @param id The ID of the substrate.
   * @param forceUpdate If true, forces a fresh fetch.
   */
  static async getSubstrateById(
    id: number,
    isPublic: boolean,
    forceUpdate: boolean = false
  ): Promise<any> {
    const cacheKey = getCacheKey(isPublic);
    const cachedData = await getCachedSubstrates(cacheKey);
    if (
      cachedData &&
      !forceUpdate &&
      !Utils.isCacheExpired(cachedData.timestamp)
    ) {
      const substrate = cachedData.substrates.find((s) => s.id == id);
      if (substrate) {
        return substrate;
      }
    }

    // Not found in cache: fetch directly from API
    try {
      const response = await ApiUtils.get(`${BASE_ENDPOINT}/substrate/${id}`);
      const substrate = SubstrateMapper.convertToSubstrates(response)[0];

      return substrate;
    } catch (error) {
      ToastService.showError({ key: 'error.fetch_failed', vars: { resource: localizationService.t('substrate.info.title'), details: String(error) }, fallback: `Error fetching substrate details: ${error}` });
      throw error;
    }
  }

  /**
   * Adds a new substrate.
   * @param substrateData The data for the new substrate.
   */
  static async addSubstrate(substrateData: AddSubstrate): Promise<any> {
    try {
      const response = await ApiUtils.post(BASE_ENDPOINT, substrateData);
      await invalidateSubstrateCache();
      return response;
    } catch (error) {
      ToastService.showError({ key: 'error.action_failed', vars: { action: localizationService.t('substrate.add.title'), resource: localizationService.t('substrate.title'), details: String(error) }, fallback: `Error adding substrate: ${error}` });
      throw error;
    }
  }

  /**
   * Updates an existing substrate.
   * It can update the name, components, and image.
   * @param id The ID of the substrate.
   * @param substrateData The updated substrate data.
   * @param removedComponents An array of component IDs to remove.
   */
  static async editSubstrate(
    id: number,
    substrateData: EditSubstrate,
    removedComponents: number[]
  ): Promise<any> {
    try {
      // Validate that at least one field is being updated
      if (
        !substrateData.name &&
        !substrateData.isPublic &&
        !substrateData.image &&
        removedComponents.length === 0
      ) {
        throw new Error("No fields to update");
      }

      let response = await ApiUtils.patch(`${BASE_ENDPOINT}/${id}`, {
        name: substrateData.name,
        isPublic: substrateData.isPublic,
        removedComponents,
      });

      if (substrateData.image) {
        const formData = new FormData();
        formData.append("image", substrateData.image);
        await ApiUtils.upload(`/images/substrate/${id}`, formData);
      }

      await invalidateSubstrateCache();
      return response;
    } catch (error) {
      ToastService.showError({ key: 'error.action_failed', vars: { action: localizationService.t('substrate.save'), resource: localizationService.t('substrate.title'), details: String(error) }, fallback: `Error updating substrate: ${error}` });
      throw error;
    }
  }

  static async editSubstrateComponents(
    id: number,
    componentsData: EditSubstrateComponent[]
  ): Promise<any> {
    try {
      const response = await ApiUtils.patch(
        `${BASE_ENDPOINT}/components/${id}`,
        { components: componentsData }
      );
      await invalidateSubstrateCache();
      return response;
    } catch (error) {
      ToastService.showError({ key: 'error.action_failed', vars: { action: localizationService.t('substrate.components.edit.title'), resource: localizationService.t('substrate.title'), details: String(error) }, fallback: `Error updating substrate components: ${error}` });
      throw error;
    }
  }

  /**
   * Adds a new substrate along with its components.
   * @param substrateData The data for the new substrate.
   * @param componentsData The data for the substrate's components.
   */
  static async addSubstrateWithComponents(
    substrateData: AddSubstrate,
    componentsData: AddSubstrateComponents
  ): Promise<any> {
    try {
      // Step 1: Create the substrate
      const response = await ApiUtils.post(BASE_ENDPOINT, substrateData);
      const substrateId = (response as { substrateId: number }).substrateId;

      // Step 2: If components exist, add them to the substrate
      if (componentsData && componentsData.components.length > 0) {
        componentsData.substrateId = substrateId;
        const componentsResponse = await ApiUtils.post(
          `${BASE_ENDPOINT}/components/${substrateId}`,
          componentsData
        );
        await invalidateSubstrateCache();
        return {
          substrate: response,
          components: componentsResponse,
        };
      }

      await invalidateSubstrateCache();
      return response;
    } catch (error) {
      ToastService.showError({ key: 'error.action_failed', vars: { action: localizationService.t('substrate.add.title'), resource: localizationService.t('substrate.title'), details: String(error) }, fallback: `Error adding substrate: ${error}` });
      throw error;
    }
  }

  /**
   * Uploads an image for a substrate.
   * @param substrateId The ID of the substrate.
   * @param image The image file to upload.
   */
  static async uploadSubstrateImage(
    substrateId: number,
    image: File,
    date?: string | Date
  ): Promise<any> {
    try {
      const formData = new FormData();
      formData.append("image", image);
      if (date) {
        formData.append("date", date.toString());
      }
      const url = `/images/substrate/${substrateId}`;
      const response = await ApiUtils.upload(url, formData);
      await invalidateSubstrateCache();
      return response;
    } catch (error) {
      ToastService.showError({ key: 'error.action_failed', vars: { action: localizationService.t('image.upload'), resource: localizationService.t('substrate.title'), details: String(error) }, fallback: `Error uploading substrate image: ${error}` });
      throw error;
    }
  }

  /**
   * Deletes a substrate by ID.
   * @param id The ID of the substrate to delete.
   */
  static async deleteSubstrate(id: number): Promise<any> {
    try {
      const response = await ApiUtils.delete(`${BASE_ENDPOINT}/${id}`);
      await invalidateSubstrateCache();
      return response;
    } catch (error) {
      ToastService.showError({ key: 'error.action_failed', vars: { action: localizationService.t('substrate.delete_confirm') || localizationService.t('substrate.deleted'), resource: localizationService.t('substrate.title'), details: String(error) }, fallback: `Error deleting substrate: ${error}` });
      throw error;
    }
  }
}
