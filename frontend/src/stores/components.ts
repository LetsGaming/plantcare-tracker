/**
 * stores/components.ts
 *
 * The global component catalogue (perlite, coco coir, ...) and the fineness
 * levels. Everyone reads it; mutations are admin only.
 *
 * ## V2 API endpoints used
 *
 * | Method | Path                         | Purpose                |
 * |--------|------------------------------|------------------------|
 * | GET    | /components                  | All components         |
 * | GET    | /components/:id              | One component          |
 * | GET    | /components/fineness-levels  | Fineness levels        |
 * | POST   | /components                  | Create (admin)         |
 * | PUT    | /components/:id              | Update (admin)         |
 * | DELETE | /components/:id              | Delete (admin)         |
 */

import { defineStore } from "pinia";
import { markRaw } from "vue";
import ApiUtils from "@/utils/apiUtils";
import ComponentMapper from "@/mapping/ComponentMapping";
import ImageService from "@/services/ImageService";
import { handleRequest } from "@/utils/requestFeedback";
import { coalesced, isStale, resourceState } from "./resource";
import { commitList, idIndexOf, removeItem, upsertItem } from "./optimistic";

const ENDPOINT = "/components";
const RESOURCE_NAME = "components.title";

export const useComponentsStore = defineStore("components", {
  state: () => ({
    items: markRaw([]) as Component[],
    ...resourceState(),
    finenessLevels: [] as APIFinenessLevel[],
    finenessFetchedAt: null as number | null,
  }),

  persist: {
    entries: [
      {
        key: "components_all",
        pick: (state) => state.items,
        timestamp: (state) => state.fetchedAt,
        version: (state) => state.items,
        dirtyOn: ["ensureLoaded", "upsert", "deleteComponent"],
        apply: (state, data: Component[], timestamp) => {
          state.items = commitList(data);
          state.fetchedAt = timestamp;
          state.status = "ready";
        },
      },
      {
        key: "components_fineness_levels",
        pick: (state) => state.finenessLevels,
        timestamp: (state) => state.finenessFetchedAt,
        version: (state) => state.finenessLevels,
        dirtyOn: ["ensureFinenessLevels"],
        apply: (state, data: APIFinenessLevel[], timestamp) => {
          state.finenessLevels = data;
          state.finenessFetchedAt = timestamp;
        },
      },
    ],
  },

  getters: {
    isStale: (state): boolean => isStale(state.fetchedAt),
    byId:
      (state) =>
      (id: number): Component | undefined =>
        idIndexOf(state.items).get(id),
  },

  actions: {
    /** Loads the catalogue unless it is in memory and fresh; concurrent callers share one load. */
    ensureLoaded({ force = false }: { force?: boolean } = {}): Promise<void> {
      if (!force && this.status === "ready" && !this.isStale) return Promise.resolve();
      return coalesced(this, "all", async () => {
        if (!force && this.status === "idle" && (await this.$hydrate()) && !this.isStale) return;
        this.status = "loading";
        try {
          const response = await handleRequest(
            ApiUtils.get<APIComponent[]>(ENDPOINT),
            RESOURCE_NAME,
          );
          this.items = commitList(ComponentMapper.convertToComponents(response));
          this.fetchedAt = Date.now();
          this.status = "ready";
        } catch (error) {
          this.status = this.items.length > 0 ? "ready" : "error";
          throw error;
        }
      });
    },

    upsert(component: Component): void {
      this.items = commitList(upsertItem(this.items, component));
    },

    /** Returns a component from the list, fetching it when missing or `force` is set. */
    async getComponent(id: number, force = false): Promise<Component> {
      await this.ensureLoaded();
      const cached = this.byId(id);
      if (cached && !force) return cached;

      const response = await handleRequest(
        ApiUtils.get<APIComponent>(`${ENDPOINT}/${id}`),
        RESOURCE_NAME,
      );
      const component = ComponentMapper.mapComponent(response);
      this.upsert(component);
      return component;
    },

    /** Fineness levels change only with the backend schema, so they load once. */
    async ensureFinenessLevels(): Promise<void> {
      if (this.finenessLevels.length > 0 && !isStale(this.finenessFetchedAt)) return;
      await coalesced(this, "fineness", async () => {
        if (this.finenessLevels.length === 0 && (await this.$hydrate())) {
          if (this.finenessLevels.length > 0 && !isStale(this.finenessFetchedAt)) return;
        }
        this.finenessLevels = await handleRequest(
          ApiUtils.get<APIFinenessLevel[]>(`${ENDPOINT}/fineness-levels`),
          RESOURCE_NAME,
        );
        this.finenessFetchedAt = Date.now();
      });
    },

    /** Creates a component (admin only); resolves with the new component. */
    async addComponent(data: AddComponent): Promise<Component> {
      const response = await handleRequest(
        ApiUtils.post<AddComponent, APIComponent>(ENDPOINT, data),
        RESOURCE_NAME,
        "error.action_failed",
      );
      const component = ComponentMapper.mapComponent(response);
      this.upsert(component);
      return component;
    },

    /** Updates a component (admin only). */
    async editComponent(id: number, data: EditComponent): Promise<Component> {
      const response = await handleRequest(
        ApiUtils.put<EditComponent, APIComponent>(`${ENDPOINT}/${id}`, data),
        RESOURCE_NAME,
        "error.action_failed",
      );
      const component = ComponentMapper.mapComponent(response);
      this.upsert(component);
      return component;
    },

    /** Deletes a component (admin only). */
    async deleteComponent(id: number): Promise<void> {
      await handleRequest(
        ApiUtils.delete(`${ENDPOINT}/${id}`),
        RESOURCE_NAME,
        "error.action_failed",
      );
      this.items = commitList(removeItem(this.items, id));
    },

    /** Uploads an image (admin only), then refreshes just this component. */
    async uploadComponentImage(id: number, image: File): Promise<unknown> {
      const response = await ImageService.uploadImage(image, "component", id);
      await this.getComponent(id, true);
      return response;
    },
  },
});
