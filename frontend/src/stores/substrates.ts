/**
 * stores/substrates.ts
 *
 * Substrates visible to the signed-in user (public ones plus their own).
 *
 * ## V2 API endpoints used
 *
 * | Method | Path                       | Purpose                               |
 * |--------|----------------------------|---------------------------------------|
 * | GET    | /substrates                | All public + own substrates (deduped) |
 * | GET    | /substrates/:id            | Single substrate                      |
 * | POST   | /substrates                | Create a substrate                    |
 * | PATCH  | /substrates/:id            | Update name / isPublic                |
 * | POST   | /substrates/:id/components | Add components                        |
 * | PATCH  | /substrates/:id/components | Replace the component mix             |
 * | DELETE | /substrates/:id            | Delete a substrate                    |
 *
 * Mutations are pessimistic: the server answers with the full substrate, which
 * is upserted into the list.
 */

import { defineStore } from "pinia";
import ApiUtils from "@/utils/apiUtils";
import SubstrateMapper from "@/mapping/SubstrateMapping";
import ImageService from "@/services/ImageService";
import { handleRequest } from "@/utils/requestFeedback";
import { useSessionStore } from "./session";
import { coalesced, isStale, resourceState } from "./resource";

const BASE_ENDPOINT = "/substrates";
const RESOURCE_KEY = "substrate.title";

export const useSubstratesStore = defineStore("substrates", {
  state: () => ({
    items: [] as Substrate[],
    ...resourceState(),
  }),

  persist: {
    entries: [
      {
        key: "substrates_all",
        pick: (state) => state.items,
        timestamp: (state) => state.fetchedAt,
        apply: (state, data: Substrate[], timestamp) => {
          state.items = data;
          state.fetchedAt = timestamp;
          state.status = "ready";
        },
      },
    ],
  },

  getters: {
    isStale: (state): boolean => isStale(state.fetchedAt),
    publicSubstrates: (state): Substrate[] => state.items.filter((s) => s.isPublic),
    privateSubstrates(): Substrate[] {
      const userId = useSessionStore().userId;
      return this.items.filter((s) => s.userId === userId);
    },
    byId:
      (state) =>
      (id: number): Substrate | undefined =>
        state.items.find((s) => s.id === id),
  },

  actions: {
    /** Loads the list unless it is in memory and fresh; concurrent callers share one load. */
    ensureLoaded({ force = false }: { force?: boolean } = {}): Promise<void> {
      if (!force && this.status === "ready" && !this.isStale) return Promise.resolve();
      return coalesced(this, "all", async () => {
        if (!force && this.status === "idle" && (await this.$hydrate()) && !this.isStale) return;
        await this.fetchAll();
      });
    },

    async fetchAll(): Promise<void> {
      this.status = "loading";
      try {
        const response = await handleRequest(
          ApiUtils.get<APISubstrate[]>(BASE_ENDPOINT),
          RESOURCE_KEY,
        );
        this.items = SubstrateMapper.convertToSubstrates(response);
        this.fetchedAt = Date.now();
        this.status = "ready";
      } catch (error) {
        this.status = this.items.length > 0 ? "ready" : "error";
        throw error;
      }
    },

    upsert(substrate: Substrate): void {
      const index = this.items.findIndex((item) => item.id === substrate.id);
      if (index === -1) this.items.push(substrate);
      else this.items[index] = substrate;
    },

    /** Fetches one substrate (GET /substrates/:id) and upserts it. */
    async fetchOne(id: number): Promise<Substrate> {
      const response = await handleRequest(
        ApiUtils.get<APISubstrate>(`${BASE_ENDPOINT}/${id}`),
        RESOURCE_KEY,
      );
      const substrate = SubstrateMapper.mapSubstrate(response);
      this.upsert(substrate);
      return substrate;
    },

    /**
     * Returns a substrate from the list, fetching it when it is missing or
     * `force` is set.
     */
    async getSubstrate(id: number, force = false): Promise<Substrate> {
      await this.ensureLoaded();
      const cached = this.byId(id);
      if (cached && !force) return cached;
      return this.fetchOne(id);
    },

    async addSubstrate(substrateData: AddSubstrate): Promise<APISubstrate> {
      const response = (await handleRequest(
        ApiUtils.post(BASE_ENDPOINT, substrateData),
        RESOURCE_KEY,
        "error.action_failed",
      )) as APISubstrate;
      this.upsert(SubstrateMapper.mapSubstrate(response));
      return response;
    },

    /**
     * Creates a substrate and, when given, its components in one workflow.
     * The V2 components endpoint takes only `{ components }`; the id is in the URL.
     *
     * @returns The id of the new substrate
     */
    async addSubstrateWithComponents(
      substrateData: AddSubstrate,
      componentsData?: AddSubstrateComponents,
    ): Promise<number> {
      const created = await this.addSubstrate(substrateData);
      const substrateId = created.substrate_id;

      if (componentsData?.components?.length) {
        const withComponents = (await handleRequest(
          ApiUtils.post(`${BASE_ENDPOINT}/${substrateId}/components`, {
            components: componentsData.components,
          }),
          RESOURCE_KEY,
        )) as APISubstrate;
        // The components endpoint answers with the full substrate including its mix.
        this.upsert(SubstrateMapper.mapSubstrate(withComponents));
      }

      return substrateId;
    },

    async editSubstrate(substrateId: number, data: EditSubstrate): Promise<APISubstrate> {
      const response = (await handleRequest(
        ApiUtils.patch(`${BASE_ENDPOINT}/${substrateId}`, data),
        RESOURCE_KEY,
        "error.action_failed",
      )) as APISubstrate;
      this.upsert(SubstrateMapper.mapSubstrate(response));
      return response;
    },

    /** Replaces the component mix ("upsert" semantics on the server). */
    async editSubstrateComponents(
      substrateId: number,
      components: EditSubstrateComponent[],
    ): Promise<APISubstrate> {
      const response = (await handleRequest(
        ApiUtils.patch(`${BASE_ENDPOINT}/${substrateId}/components`, { components }),
        RESOURCE_KEY,
        "substrate.components.edit.title",
      )) as APISubstrate;
      this.upsert(SubstrateMapper.mapSubstrate(response));
      return response;
    },

    async deleteSubstrate(substrateId: number): Promise<void> {
      await handleRequest(
        ApiUtils.delete(`${BASE_ENDPOINT}/${substrateId}`),
        RESOURCE_KEY,
        "error.action_failed",
      );
      this.items = this.items.filter((item) => item.id !== substrateId);
    },

    /** Uploads an image, then refreshes just this substrate so it shows up. */
    async uploadSubstrateImage(
      substrateId: number,
      image: File,
      date?: string | Date,
      refresh = true,
    ): Promise<unknown> {
      const response = await ImageService.uploadImage(image, "substrate", substrateId, date);
      if (refresh) await this.fetchOne(substrateId);
      return response;
    },
  },
});
