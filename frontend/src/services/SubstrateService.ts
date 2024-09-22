import ApiUtils from '@/utils/apiUtils';

const SUBSTRATES_ENDPOINT = '/substrates';

const SubstrateService = {
  /**
   * Fetches the list of all substrates.
   * @returns {Promise<any[]>} - A promise that resolves to an array of substrates.
   */
  async getSubstrates(): Promise<any[]> {
    try {
      return await ApiUtils.get<any[]>(SUBSTRATES_ENDPOINT);
    } catch (error) {
      console.error('Error fetching substrates:', error);
      throw error;
    }
  },

  /**
   * Fetches a single substrate by its ID.
   * @param {number} id - The ID of the substrate.
   * @returns {Promise<any>} - A promise that resolves to the substrate data.
   */
  async getSubstrateById(id: number): Promise<any> {
    try {
      return await ApiUtils.get<any>(`${SUBSTRATES_ENDPOINT}/${id}`);
    } catch (error) {
      console.error(`Error fetching substrate with ID ${id}:`, error);
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
      return await ApiUtils.post<any, any>(SUBSTRATES_ENDPOINT, substrateData);
    } catch (error) {
      console.error('Error adding substrate:', error);
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
      return await ApiUtils.put<any, any>(`${SUBSTRATES_ENDPOINT}/${id}`, substrateData);
    } catch (error) {
      console.error(`Error updating substrate with ID ${id}:`, error);
      throw error;
    }
  },
};

export default SubstrateService;
