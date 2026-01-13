import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import storageService from "@/services/general/StorageService";
import SubstrateMapper from "@/mapping/SubstrateMapping";

const BASE_ENDPOINT = "/substrates";
const RESOURCE_KEY = "substrate.title";
const CACHE_KEY_PUBLIC = "public_substrates_data";
const CACHE_KEY_PRIVATE = "private_substrates_data";

export default class SubstrateService extends BaseService {
  /**
   * Helper to resolve cache keys and endpoints dynamically.
   */
  private static getContext(isPublic: boolean) {
    return {
      cacheKey: isPublic ? CACHE_KEY_PUBLIC : CACHE_KEY_PRIVATE,
      endpoint: isPublic
        ? `${BASE_ENDPOINT}/public`
        : `${BASE_ENDPOINT}/private`,
    };
  }

  /**
   * Invalidates both public and private substrate caches.
   */
  static async invalidateSubstrateCache() {
    await storageService.remove(CACHE_KEY_PUBLIC);
    await storageService.remove(CACHE_KEY_PRIVATE);
  }

  /**
   * Fetches all substrates from both public and private endpoints.
   * Merges them into a single unique array.
   */
  static async getAllSubstrates(): Promise<any[]> {
    const results = await Promise.allSettled([
      this.getSubstrates(false),
      this.getSubstrates(true),
    ]);

    const uniqueSubstrates = new Map();
    results.forEach((result) => {
      if (result.status === "fulfilled" && Array.isArray(result.value)) {
        result.value.forEach((s) => uniqueSubstrates.set(s.id, s));
      }
    });

    return Array.from(uniqueSubstrates.values());
  }

  /**
   * Fetches substrates (Public/Private) with standardized caching.
   */
  static async getSubstrates(
    isPublic: boolean,
    forceUpdate: boolean = false
  ): Promise<any[]> {
    const { cacheKey, endpoint } = this.getContext(isPublic);

    return this.getCachedData(
      cacheKey,
      () =>
        this.handleRequest(
          ApiUtils.get(endpoint).then((res) =>
            SubstrateMapper.convertToSubstrates(res)
          ),
          RESOURCE_KEY
        ),
      forceUpdate
    );
  }

  /**
   * Fetches a single substrate, checking cache first.
   */
  static async getSubstrateById(
    id: number,
    isPublic: boolean,
    forceUpdate: boolean = false
  ): Promise<any> {
    const substrates = await this.getSubstrates(isPublic, forceUpdate);
    const found = substrates.find((s) => s.id == id);

    if (found && !forceUpdate) return found;

    return this.handleRequest(
      ApiUtils.get(`${BASE_ENDPOINT}/substrate/${id}`).then(
        (res) => SubstrateMapper.convertToSubstrates(res)[0]
      ),
      "substrate.info.title"
    );
  }

  /**
   * Mutation methods (Add, Edit, Delete)
   */
  static async addSubstrate(substrateData: AddSubstrate): Promise<any> {
    const res = await this.handleRequest(
      ApiUtils.post(BASE_ENDPOINT, substrateData),
      RESOURCE_KEY,
      "error.action_failed"
    );
    await this.invalidateSubstrateCache();
    return res;
  }

  static async editSubstrate(
    id: number,
    data: EditSubstrate,
    removedComponents: number[]
  ): Promise<any> {
    if (
      !data.name &&
      !data.isPublic &&
      !data.image &&
      removedComponents.length === 0
    ) {
      throw new Error("No fields to update");
    }

    const res = await this.handleRequest(
      ApiUtils.patch(`${BASE_ENDPOINT}/${id}`, {
        name: data.name,
        isPublic: data.isPublic,
        removedComponents,
      }),
      RESOURCE_KEY,
      "substrate.save"
    );

    if (data.image) {
      await this.uploadSubstrateImage(id, data.image);
    }

    await this.invalidateSubstrateCache();
    return res;
  }

  static async editSubstrateComponents(
    id: number,
    components: EditSubstrateComponent[]
  ): Promise<any> {
    const res = await this.handleRequest(
      ApiUtils.patch(`${BASE_ENDPOINT}/components/${id}`, { components }),
      RESOURCE_KEY,
      "substrate.components.edit.title"
    );
    await this.invalidateSubstrateCache();
    return res;
  }

  static async addSubstrateWithComponents(
    substrateData: AddSubstrate,
    componentsData: AddSubstrateComponents
  ): Promise<any> {
    const response = await this.addSubstrate(substrateData);
    const substrateId = (response as { substrateId: number }).substrateId;

    if (componentsData?.components?.length > 0) {
      componentsData.substrateId = substrateId;
      const compRes = await this.handleRequest(
        ApiUtils.post(
          `${BASE_ENDPOINT}/components/${substrateId}`,
          componentsData
        ),
        RESOURCE_KEY
      );
      return { substrate: response, components: compRes };
    }

    return response;
  }

  static async uploadSubstrateImage(
    substrateId: number,
    image: File,
    date?: string | Date
  ): Promise<any> {
    const formData = new FormData();
    formData.append("image", image);
    if (date) formData.append("date", date.toString());

    const res = await this.handleRequest(
      ApiUtils.upload(`/images/substrate/${substrateId}`, formData),
      RESOURCE_KEY,
      "image.upload"
    );
    await this.invalidateSubstrateCache();
    return res;
  }

  static async deleteSubstrate(id: number): Promise<any> {
    const res = await this.handleRequest(
      ApiUtils.delete(`${BASE_ENDPOINT}/${id}`),
      RESOURCE_KEY,
      "error.action_failed"
    );
    await this.invalidateSubstrateCache();
    return res;
  }
}
