import ApiUtils from "@/utils/apiUtils";
import storageService from "@/services/general/StorageService";
import ToastService from "@/services/general/ToastService";
import SubstrateMapper from "@/mapping/SubstrateMapping";

const SUBSTRATES_ENDPOINT = "/substrates";
const CACHE_KEY_SUBSTRATES = "substrates_data";
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Check if cached data is expired
function isCacheExpired(timestamp: number): boolean {
  return Date.now() - timestamp > CACHE_EXPIRY_MS;
}

const SubstrateService = {
  /**
   * Fetches the list of all substrates with caching.
   * @returns {Promise<any[]>} - A promise that resolves to an array of substrates.
   */
  async getSubstrates(forceUpdate: boolean = false): Promise<any[]> {
    // Try to get the cached data
    const cachedData = await storageService.get<{
      substrates: any[];
      timestamp: number;
    }>(CACHE_KEY_SUBSTRATES);

    // If not forcing update, check if cached data exists and is not expired
    if (!forceUpdate && cachedData && !isCacheExpired(cachedData.timestamp)) {
      return cachedData.substrates;
    }

    // Otherwise, fetch new data from the API
    try {
      const response = await ApiUtils.get<any[]>(SUBSTRATES_ENDPOINT);
      const substrates = SubstrateMapper.convertToSubstrates(response);

      // Store the substrates and current timestamp in storage
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
    const cachedData = await storageService.get<{
      substrates: Substrate[];
      timestamp: number;
    }>(CACHE_KEY_SUBSTRATES);

    // Check if cached data exists and is not expired
    if (cachedData && !isCacheExpired(cachedData.timestamp)) {
      const substrate = cachedData.substrates.find(
        (s) => s.id === id
      );
      if (substrate) {
        return substrate; // Return the cached substrate if found
      }
    }

    // Otherwise, fetch the substrate from the API
    try {
      const substrate = await ApiUtils.get<any>(`${SUBSTRATES_ENDPOINT}/${id}`);

      // Refresh the cache by calling getSubstrates
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
   * @param {any} substrateData - The data for the new substrate (e.g., name, components).
   * @returns {Promise<any>} - A promise that resolves to the created substrate.
   */
  async addSubstrate(substrateData: any): Promise<any> {
    try {
      const response = await ApiUtils.post<any, any>(
        SUBSTRATES_ENDPOINT,
        substrateData
      );

      // Invalidate the cached substrates after adding a new substrate
      await storageService.remove(CACHE_KEY_SUBSTRATES);

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
   * @returns {Promise<any>} - A promise that resolves to the updated substrate data.
   */
  async updateSubstrate(id: number, substrateData: any): Promise<any> {
    try {
      const response = await ApiUtils.put<any, any>(
        `${SUBSTRATES_ENDPOINT}/${id}`,
        substrateData
      );

      // Invalidate the cached substrates after updating
      await storageService.remove(CACHE_KEY_SUBSTRATES);

      return response;
    } catch (error) {
      console.error(`Error updating substrate with ID ${id}:`, error);
      ToastService.showError(`Error updating substrate: ${error}`);
      throw error;
    }
  },
};

export default SubstrateService;
