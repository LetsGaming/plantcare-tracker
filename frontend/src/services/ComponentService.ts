import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import ComponentMapper from "@/mapping/ComponentMapping";
import storageService from "@/services/general/StorageService";

const ENDPOINT = "/components";
const CACHE_KEY = "components_data";
const RESOURCE_NAME = "components.title";

export default class ComponentService extends BaseService {
  /**
   * Fetches all components with standardized caching logic.
   */
  static async getComponents(forceUpdate: boolean = false): Promise<any[]> {
    return this.getCachedData(
      CACHE_KEY,
      () =>
        this.handleRequest(
          ApiUtils.get<any[]>(ENDPOINT).then((res) =>
            ComponentMapper.convertToComponents(res)
          ),
          RESOURCE_NAME
        ),
      forceUpdate
    );
  }

  /**
   * Fetches a single component, checking cache first.
   */
  static async getComponentById(
    id: number,
    forceUpdate: boolean = false
  ): Promise<any> {
    const cached = await this.getComponents(forceUpdate);
    const component = cached.find((c) => c.id === id);

    if (component && !forceUpdate) return component;

    // Fetch specifically if not in list or forced
    const result = await this.handleRequest(
      ApiUtils.get<any>(`${ENDPOINT}/${id}`),
      RESOURCE_NAME
    );

    // Refresh the full list cache in the background
    await this.getComponents(true);
    return result;
  }

  /**
   * Generic handler for Create, Update, Delete to clear cache.
   */
  private static async mutate(
    request: Promise<any>,
    actionKey: string
  ): Promise<any> {
    const response = await this.handleRequest(
      request,
      RESOURCE_NAME,
      actionKey
    );
    await storageService.remove(CACHE_KEY);
    return response;
  }

  static async addComponent(data: any): Promise<any> {
    return this.mutate(
      ApiUtils.post(`${ENDPOINT}/admin`, data),
      "error.action_failed"
    );
  }

  static async editComponent(id: number, data: any): Promise<any> {
    return this.mutate(
      ApiUtils.put(`${ENDPOINT}/admin/${id}`, data),
      "error.action_failed"
    );
  }

  static async deleteComponent(id: number): Promise<any> {
    return this.mutate(
      ApiUtils.delete(`${ENDPOINT}/admin/${id}`),
      "error.action_failed"
    );
  }

  static async uploadComponentImage(
    componentId: number,
    image: File
  ): Promise<any> {
    const formData = new FormData();
    formData.append("image", image);

    return this.mutate(
      ApiUtils.upload(`/images/component/${componentId}`, formData),
      "error.action_failed"
    );
  }
}
