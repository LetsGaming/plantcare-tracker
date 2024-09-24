import ApiUtils from "@/utils/apiUtils";
import storageService from "@/services/general/StorageService";
import ToastService from "@/services/general/ToastService";
import ComponentMapper from "@/mapping/ComponentMapping";
import Utils from "@/utils/utils";

const COMPONENTS_ENDPOINT = "/components";
const CACHE_KEY_COMPONENTS = "components_data";
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

const ComponentService = {
  /**
   * Fetches the list of all components with caching.
   * @returns {Promise<any[]>} - A promise that resolves to an array of components.
   */
  async getComponents(forceUpdate: boolean = false): Promise<any[]> {
    const cachedData = await storageService.get<{
      components: any[];
      timestamp: number;
    }>(CACHE_KEY_COMPONENTS);

    if (!forceUpdate && cachedData && !Utils.isCacheExpired(cachedData.timestamp, CACHE_EXPIRY_MS)) {
      return cachedData.components;
    }

    // Fetch new data from the API
    try {
      const response = await ApiUtils.get<any[]>(COMPONENTS_ENDPOINT);
      const components = ComponentMapper.convertToComponents(response);

      // Store the components and current timestamp in storage
      await storageService.set(CACHE_KEY_COMPONENTS, {
        components,
        timestamp: Date.now(),
      });

      return components;
    } catch (error) {
      console.error("Error fetching components:", error);
      ToastService.showError(`Error fetching components: ${error}`);
      throw error;
    }
  },

  /**
   * Fetches a single component by its ID.
   * @param {number} id - The ID of the component.
   * @returns {Promise<any>} - A promise that resolves to the component data.
   */
  async getComponentById(id: number, forceUpdate: boolean = false): Promise<any> {
    const cachedData = await storageService.get<{
      components: any[];
      timestamp: number;
    }>(CACHE_KEY_COMPONENTS);

    if (cachedData && !Utils.isCacheExpired(cachedData.timestamp, CACHE_EXPIRY_MS)) {
      const component = cachedData.components.find((c) => c.id === id);
      if (component) {
        return component; // Return the cached component if found
      }
    }

    // Otherwise, fetch the component from the API
    try {
      const component = await ApiUtils.get<any>(`${COMPONENTS_ENDPOINT}/${id}`);

      // Refresh the cache by calling getComponents
      await this.getComponents(true); // Invalidate the cache for components

      return component;
    } catch (error) {
      console.error(`Error fetching component with ID ${id}:`, error);
      ToastService.showError(`Error fetching component details: ${error}`);
      throw error;
    }
  },

  /**
   * Adds a new component.
   * @param {any} componentData - The data for the new component (e.g., name, fineness).
   * @returns {Promise<any>} - A promise that resolves to the created component.
   */
  async addComponent(componentData: any): Promise<any> {
    try {
      const addEndpoint = `${COMPONENTS_ENDPOINT}/admin`;
      const response = await ApiUtils.post<any, any>(addEndpoint, componentData);

      // Invalidate the cached components after adding a new component
      await storageService.remove(CACHE_KEY_COMPONENTS);

      return response; // Assuming response contains the inserted component
    } catch (error) {
      console.error("Error adding component:", error);
      ToastService.showError(`Error adding component: ${error}`);
      throw error;
    }
  },

  /**
   * Updates an existing component by its ID.
   * @param {number} id - The ID of the component to update.
   * @param {any} componentData - The updated data for the component.
   * @returns {Promise<any>} - A promise that resolves to the updated component data.
   */
  async updateComponent(id: number, componentData: any): Promise<any> {
    try {
      const updateEndpoint = `${COMPONENTS_ENDPOINT}/admin/${id}`;
      const response = await ApiUtils.put<any, any>(updateEndpoint, componentData);

      // Invalidate the cached components after updating
      await storageService.remove(CACHE_KEY_COMPONENTS);

      return response;
    } catch (error) {
      console.error(`Error updating component with ID ${id}:`, error);
      ToastService.showError(`Error updating component: ${error}`);
      throw error;
    }
  },

  /**
   * Deletes a component by its ID.
   * @param {number} id - The ID of the component to delete.
   * @returns {Promise<void>} - A promise that resolves when the component is deleted.
   */
  async deleteComponent(id: number): Promise<void> {
    try {
      const deleteEndpoint = `${COMPONENTS_ENDPOINT}/admin/${id}`;
      await ApiUtils.delete<any>(deleteEndpoint);

      // Invalidate the cached components after deleting
      await storageService.remove(CACHE_KEY_COMPONENTS);
      ToastService.showSuccess(`Component with ID ${id} deleted successfully.`);
    } catch (error) {
      console.error(`Error deleting component with ID ${id}:`, error);
      ToastService.showError(`Error deleting component: ${error}`);
      throw error;
    }
  },
};

export default ComponentService;
