import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import ComponentMapper from "@/mapping/ComponentMapping";
import storageService from "@/services/general/StorageService";
import ImageService from "./ImageService";

const ENDPOINT = "/components";
const CACHE_KEY_ALL = "components_all";
const RESOURCE_NAME = "components.title";

/**
 * Events emitted when the component cache changes
 */
export enum ComponentEvents {
  COMPONENTS_UPDATED = "components-updated",
}

export default class ComponentService extends BaseService {
  /* =========================================================================
     Cache helpers
     ========================================================================= */

  /**
   * Save the full component list into storage and notify listeners
   * @param components Array of component entities
   */
  private static async saveComponents(components: Component[]): Promise<void> {
    await this.saveAndNotify(
      CACHE_KEY_ALL,
      ComponentEvents.COMPONENTS_UPDATED,
      components,
    );
  }

  /**
   * Invalidate the component cache.
   * If componentId is provided, removes only that component.
   * Otherwise, clears the entire cache.
   * @param componentId Optional component ID
   */
  static async invalidateComponentCache(componentId?: number): Promise<void> {
    if (!componentId) {
      await storageService.remove(CACHE_KEY_ALL);
      return;
    }

    const stored = await storageService.get<{ data: Component[] }>(
      CACHE_KEY_ALL,
    );
    if (!stored?.data) return;

    const updated = stored.data.filter((c) => c.id !== componentId);
    await this.saveComponents(updated);
  }

  /* =========================================================================
     Fetching
     ========================================================================= */

  /**
   * Fetch all components.
   * All components are public; cache is single source of truth.
   * @param forceUpdate If true, bypass cache and refetch
   * @returns Array of components
   */
  static async getAllComponents(
    forceUpdate: boolean = false,
  ): Promise<Component[]> {
    const result = await this.getCachedData(
      CACHE_KEY_ALL,
      () =>
        this.handleRequest(
          ApiUtils.get<APIComponent[]>(ENDPOINT).then((res) =>
            ComponentMapper.convertToComponents(res),
          ),
          RESOURCE_NAME,
        ),
      forceUpdate,
    );

    await this.saveComponents(result || []);
    return result || [];
  }

  /**
   * Fetch a single component by ID.
   * @param componentId Component ID
   * @param forceUpdate If true, bypass cache
   * @returns The requested component
   */
  static async getComponentById(
    componentId: number,
    forceUpdate: boolean = false,
  ): Promise<Component> {
    const components = await this.getAllComponents(false);
    const cached = components.find((c) => c.id === componentId);

    if (cached && !forceUpdate) return cached;

    const component = await this.handleRequest(
      ApiUtils.get<APIComponent>(`${ENDPOINT}/component/${componentId}`).then(
        (res) => ComponentMapper.convertToComponents(res)[0],
      ),
      RESOURCE_NAME,
    );

    await this.upsertIntoListCache(
      CACHE_KEY_ALL,
      ComponentEvents.COMPONENTS_UPDATED,
      component,
    );
    return component;
  }

  /* =========================================================================
     Admin mutations
     ========================================================================= */

  /**
   * Create a new component (admin only)
   * @param data Component payload
   * @returns API response
   */
  static async addComponent(data: AddComponent): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.post(`${ENDPOINT}/admin`, data),
      RESOURCE_NAME,
      "error.action_failed",
    );
    await this.invalidateComponentCache();
    return response;
  }

  /**
   * Update an existing component (admin only)
   * @param componentId ID of the component
   * @param data Update payload
   * @returns API response
   */
  static async editComponent(
    componentId: number,
    data: EditComponent,
  ): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.put(`${ENDPOINT}/admin/${componentId}`, data),
      RESOURCE_NAME,
      "error.action_failed",
    );

    await this.invalidateComponentCache(componentId);
    return response;
  }

  /**
   * Delete a component (admin only)
   * @param componentId ID of the component
   * @returns API response
   */
  static async deleteComponent(componentId: number): Promise<any> {
    const response = await this.handleRequest(
      ApiUtils.delete(`${ENDPOINT}/admin/${componentId}`),
      RESOURCE_NAME,
      "error.action_failed",
    );

    await this.invalidateComponentCache(componentId);
    return response;
  }

  /**
   * Upload an image for a component (admin only)
   * @param componentId Component ID
   * @param image File to upload
   * @returns API response
   */
  static async uploadComponentImage(
    componentId: number,
    image: File,
  ): Promise<any> {
    const formData = new FormData();
    formData.append("image", image);

    const response = await ImageService.uploadImage(
      image,
      "component",
      componentId,
    );

    await this.invalidateComponentCache(componentId);
    return response;
  }
}
