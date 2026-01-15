import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import storageService from "@/services/general/StorageService";
import SubstrateMapper from "@/mapping/SubstrateMapping";

const BASE_ENDPOINT = "/substrates";
const RESOURCE_KEY = "substrate.title";
const CACHE_KEY_PUBLIC = "public_substrates_data";
const CACHE_KEY_PRIVATE = "private_substrates_data";

export enum SubstrateEvents {
  PUBLIC_SUBSTRATES_UPDATED = "public-substrates-updated",
  PRIVATE_SUBSTRATES_UPDATED = "private-substrates-updated",
}

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
   * Invalidates substrate caches. If an ID is provided, removes only that substrate from cache.
   */
  /**
   * Invalidates substrate caches. If an ID is provided, removes only that substrate from cache.
   */
  static async invalidateSubstrateCache(
    substrateId?: number,
    isPublic?: boolean
  ) {
    // 1. Full Reset Scenario: Clear all if parameters are missing
    if (substrateId === undefined || isPublic === undefined) {
      await Promise.all([
        storageService.remove(CACHE_KEY_PUBLIC),
        storageService.remove(CACHE_KEY_PRIVATE),
      ]);
      return;
    }

    // 2. Single Item Invalidation
    const { cacheKey } = this.getContext(isPublic);

    // Retrieve the stored object (e.g., { substrates: [...] })
    const stored = await storageService.get<{ data: Substrate[] }>(cacheKey);
    if (stored && stored.data) {
      const substrates = stored.data;
      const updatedSubstrates = substrates.filter((s) => s.id !== substrateId);

      // Save the filtered list and trigger the event for UI observers
      await this.saveAndNotify(
        cacheKey,
        isPublic
          ? SubstrateEvents.PUBLIC_SUBSTRATES_UPDATED
          : SubstrateEvents.PRIVATE_SUBSTRATES_UPDATED,
        updatedSubstrates,
        "substrates"
      );
    }
  }

  /**
   * Fetches substrates (Public/Private) with standardized caching.
   */
  static async getSubstrates(
    isPublic: boolean,
    forceUpdate: boolean = false
  ): Promise<Substrate[]> {
    const { cacheKey, endpoint } = this.getContext(isPublic);

    const result = await this.getCachedData(
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

    return result || [];
  }

  /**
   * Fetches all substrates (both public and private) and merges into unique array.
   */
  static async getAllSubstrates(): Promise<Substrate[]> {
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
   * Fetches a single substrate by ID, checking cache first.
   */
  static async getSubstrateById(
    substrateId: number,
    isPublic: boolean,
    forceUpdate: boolean = false
  ): Promise<Substrate> {
    // Never force-update the list here
    const substrates = await this.getSubstrates(isPublic, false);
    const found = substrates.find((s) => s.id === substrateId);

    if (found && !forceUpdate) return found;

    const substrate = await this.handleRequest(
      ApiUtils.get(`${BASE_ENDPOINT}/${substrateId}`).then(
        (res) => SubstrateMapper.convertToSubstrates(res)[0]
      ),
      RESOURCE_KEY
    );

    await this.upsertIntoListCache(
      isPublic ? CACHE_KEY_PUBLIC : CACHE_KEY_PRIVATE,
      isPublic
        ? SubstrateEvents.PUBLIC_SUBSTRATES_UPDATED
        : SubstrateEvents.PRIVATE_SUBSTRATES_UPDATED,
      substrate
    );

    return substrate;
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

    // Invalidate both caches after addition
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

    // Invalidate cache for this substrate specifically
    if (data.isPublic !== undefined) {
      await this.invalidateSubstrateCache(id, data.isPublic);
    } else {
      await this.invalidateSubstrateCache(id, true);
      await this.invalidateSubstrateCache(id, false);
    }

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

    await this.invalidateSubstrateCache(id, false);
    await this.invalidateSubstrateCache(id, true);

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

    // Only invalidate the specific substrate in private cache
    await this.invalidateSubstrateCache(substrateId, false);

    return res;
  }

  static async deleteSubstrate(id: number): Promise<any> {
    const res = await this.handleRequest(
      ApiUtils.delete(`${BASE_ENDPOINT}/${id}`),
      RESOURCE_KEY,
      "error.action_failed"
    );

    // Remove this substrate from both caches
    await this.invalidateSubstrateCache(id, false);
    await this.invalidateSubstrateCache(id, true);

    return res;
  }
}
