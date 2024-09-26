import Utils from "@/utils/utils";
import ApiUtils from "@/utils/apiUtils";
import storageService from "@/services/general/StorageService";
import ToastService from "@/services/general/ToastService";
import SubstrateMapper from "@/mapping/SubstrateMapping";

const SUBSTRATES_ENDPOINT = "/substrates";
const CACHE_KEY_SUBSTRATES = "substrates_data";
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours


// Common function to handle cache retrieval
async function getCachedData() {
  return await storageService.get<{
    substrates: any[];
    timestamp: number;
  }>(CACHE_KEY_SUBSTRATES);
}

// Common function to handle cache invalidation
async function invalidateCache() {
  await storageService.remove(CACHE_KEY_SUBSTRATES);
}

// Common function to fetch substrates from API and cache them
async function fetchAndCacheSubstrates(): Promise<any[]> {
  try {
    const response = await ApiUtils.get<any[]>(SUBSTRATES_ENDPOINT);
    const substrates = SubstrateMapper.convertToSubstrates(response);
    await storageService.set(CACHE_KEY_SUBSTRATES, {
      substrates,
      timestamp: Date.now(),
    });
    return substrates;
  } catch (error) {
    console.error("Error fetching substrates:", error);
    ToastService.showError(`Error fetching substrates: ${error}`);
    throw error;
  }
}

const SubstrateService = {
  /**
   * Fetches the list of all substrates with caching.
   * @returns {Promise<any[]>} - A promise that resolves to an array of substrates.
   */
  async getSubstrates(forceUpdate: boolean = false): Promise<any[]> {
    const cachedData = await getCachedData();

    // Use cached data if it's not expired
    if (!forceUpdate && cachedData && !Utils.isCacheExpired(cachedData.timestamp)) {
      return cachedData.substrates;
    }

    // Otherwise, fetch new data from the API
    return await fetchAndCacheSubstrates();
  },

  /**
   * Fetches a single substrate by its ID.
   * @param {number} id - The ID of the substrate.
   * @returns {Promise<any>} - A promise that resolves to the substrate data.
   */
  async getSubstrateById(
    id: number,
    forceUpdate: boolean = false
  ): Promise<any> {
    const cachedData = await getCachedData();

    // Check if cached data exists and is not expired
    if (cachedData && !Utils.isCacheExpired(cachedData.timestamp)) {
      const substrate = cachedData.substrates.find((s) => s.id === id);
      if (substrate) {
        return substrate; // Return the cached substrate if found
      }
    }

    // Otherwise, fetch the substrate from the API
    try {
      const substrate = await ApiUtils.get<any>(`${SUBSTRATES_ENDPOINT}/${id}`);

      // Refresh the cache by fetching substrates
      await this.getSubstrates(true); // Invalidate the cache for substrates

      return substrate;
    } catch (error) {
      console.error(`Error fetching substrate with ID ${id}:`, error);
      ToastService.showError(`Error fetching substrate details: ${error}`);
      throw error;
    }
  },

  /**
   * Adds a new substrate.
   * @param {any} substrateData - The data for the new substrate (e.g., name).
   * @returns {Promise<any>} - A promise that resolves to the created substrate.
   */
  async addSubstrate(substrateData: any): Promise<any> {
    try {
      const response = await ApiUtils.post<any, any>(
        SUBSTRATES_ENDPOINT,
        substrateData
      );
      await invalidateCache(); // Invalidate the cached substrates
      return response; // Assuming response contains the inserted substrate
    } catch (error) {
      console.error("Error adding substrate:", error);
      ToastService.showError(`Error adding substrate: ${error}`);
      throw error;
    }
  },

  /**
   * Updates an existing substrate by its ID.
   * @param {number} id - The ID of the substrate to update.
   * @param {any} substrateData - The updated data for the substrate.
   * @param {number[]} removedComponents - Array of component IDs to be removed.
   * @returns {Promise<any>} - A promise that resolves to the updated substrate data.
   */
  async editSubstrate(
    id: number,
    substrateData: { name?: string; components?: any[] },
    removedComponents: number[]
  ): Promise<any> {
    try {
      if (!substrateData.name && !substrateData.components) {
        throw new Error("Substrate name or components are required.");
      }

      let response = await ApiUtils.put(`${SUBSTRATES_ENDPOINT}/${id}`, {
        name: substrateData.name,
        removedComponents,
      });

      if (substrateData.components) {
        response = await ApiUtils.patch(
          `${SUBSTRATES_ENDPOINT}/components/${id}`,
          {
            components: substrateData.components,
          }
        );
      }

      await invalidateCache(); // Invalidate the cache
      return response;
    } catch (error) {
      console.error(`Error updating substrate with ID ${id}:`, error);
      ToastService.showError(`Error updating substrate: ${error}`);
      throw error;
    }
  },

  /**
   * Adds a new substrate along with its components.
   * @param {AddSubstrate} substrateData - The data for the new substrate (e.g., name).
   * @param {AddSubstrateComponents} componentsData - The data for components to be added to the substrate.
   * @returns {Promise<any>} - A promise that resolves to the created substrate with its components.
   */
  async addSubstrateWithComponents(
    substrateData: AddSubstrate,
    componentsData: AddSubstrateComponents
  ): Promise<any> {
    try {
      // Step 1: Add the substrate
      const response = await ApiUtils.post(
        SUBSTRATES_ENDPOINT,
        substrateData
      ) as any;

      const substrateId = response.id; 

      // Step 2: Add components to the substrate
      if (componentsData && componentsData.components.length > 0) {
        // Set the substrate ID in componentsData
        componentsData.substrateId = substrateId;

        // Assuming there is an endpoint to add components
        const componentsResponse = await ApiUtils.post(
          `${SUBSTRATES_ENDPOINT}/components/${substrateId}`, // Adjust the endpoint as needed
          componentsData
        );

        await invalidateCache(); // Invalidate the cached substrates after adding a new substrate

        return {
          substrate: response, // The created substrate
          components: componentsResponse, // The added components
        };
      }

      await invalidateCache(); // Invalidate the cache if no components were added
      return response; // Return just the substrate if no components are added
    } catch (error) {
      console.error("Error adding substrate with components:", error);
      ToastService.showError(`Error adding substrate: ${error}`);
      throw error;
    }
  },
};

export default SubstrateService;
