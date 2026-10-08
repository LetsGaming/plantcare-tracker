/**
 * stores/plants.ts
 *
 * All plants visible to the signed-in user (their own plus public ones from
 * others). Derived lists are getters, so views bind to them directly and
 * repaint on every change, including optimistic ones.
 *
 * ## V2 API endpoints used
 *
 * | Method | Path        | Purpose                        |
 * |--------|-------------|--------------------------------|
 * | GET    | /plants     | Fetch all visible plants       |
 * | GET    | /plants/:id | Fetch / refresh a single plant |
 * | POST   | /plants     | Create a plant                 |
 * | PATCH  | /plants/:id | Update a plant                 |
 * | DELETE | /plants/:id | Delete a plant                 |
 *
 * Images are managed through ImageService (POST/PATCH/DELETE /images/plant/:id).
 *
 * Mutations are optimistic: the expected result is painted into the list at
 * once (a temporary negative id for creates), reconciled with the plant the
 * server returns, and only the affected plant is rolled back on failure.
 */

import { defineStore } from "pinia";
import ApiUtils from "@/utils/apiUtils";
import PlantMapper from "@/mapping/PlantMapping";
import ImageService from "@/services/ImageService";
import Utils from "@/utils/utils";
import { handleRequest } from "@/utils/requestFeedback";
import { useSessionStore } from "./session";
import { useSubstratesStore } from "./substrates";
import { useWateringStore } from "./watering";
import { optimisticRemove, optimisticUpsert } from "./optimistic";
import { coalesced, isStale, resourceState } from "./resource";

const BASE_ENDPOINT = "/plants";
const RESOURCE_KEY = "plants.title";

export const usePlantsStore = defineStore("plants", {
  state: () => ({
    items: [] as Plant[],
    ...resourceState(),
  }),

  persist: {
    entries: [
      {
        key: "plants_all",
        pick: (state) => state.items,
        timestamp: (state) => state.fetchedAt,
        apply: (state, data: Plant[], timestamp) => {
          state.items = data;
          state.fetchedAt = timestamp;
          state.status = "ready";
        },
      },
    ],
  },

  getters: {
    isLoading: (state): boolean => state.status === "loading",
    isStale: (state): boolean => isStale(state.fetchedAt),
    publicPlants: (state): Plant[] => state.items.filter((plant) => plant.isPublic),
    personalPlants(): Plant[] {
      const userId = useSessionStore().userId;
      return this.items.filter((plant) => plant.userId === userId);
    },
    byId:
      (state) =>
      (id: number): Plant | undefined =>
        state.items.find((plant) => plant.id === id),
  },

  actions: {
    /**
     * Makes sure the list is loaded: from memory when fresh, otherwise from
     * storage, otherwise from the API. Concurrent callers share one load.
     */
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
        const response = await handleRequest(ApiUtils.get<APIPlant[]>(BASE_ENDPOINT), RESOURCE_KEY);
        this.items = PlantMapper.convertToPlants(response);
        this.fetchedAt = Date.now();
        this.status = "ready";
      } catch (error) {
        this.status = this.items.length > 0 ? "ready" : "error";
        throw error;
      }
    },

    /** Fetches one plant (GET /plants/:id) and upserts it into the list. */
    async fetchOne(id: number): Promise<Plant> {
      const response = await handleRequest(
        ApiUtils.get<APIPlant>(`${BASE_ENDPOINT}/${id}`),
        RESOURCE_KEY,
      );
      const plant = PlantMapper.mapPlant(response);
      const index = this.items.findIndex((item) => item.id === plant.id);
      if (index === -1) this.items.push(plant);
      else this.items[index] = plant;
      return plant;
    },

    /**
     * Returns a plant from the list, fetching it when it is missing or
     * `force` is set.
     *
     * @throws {Error} If the plant cannot be found after fetching
     */
    async getPlant(id: number, force = false): Promise<Plant> {
      await this.ensureLoaded();
      const cached = this.byId(id);
      if (cached && !force) return cached;
      return this.fetchOne(id);
    },

    /** Best-effort substrate name for an optimistic card; empty when it cannot be loaded. */
    async substrateName(substrateId: number): Promise<string> {
      const substrates = useSubstratesStore();
      await substrates.ensureLoaded().catch(() => undefined);
      return substrates.byId(substrateId)?.name ?? "";
    },

    /** Creates a plant (optimistic); resolves with the plant carrying the real id. */
    async addPlant(plantToAdd: AddPlant): Promise<Plant> {
      // `image` is handled by uploadPlantImage after creation, never sent here.
      const { image: _image, ...body } = plantToAdd;

      // Best-effort name lookup for the optimistic card; the picker the user
      // just used has warmed this cache in practice.
      const substrateName = await this.substrateName(plantToAdd.substrateId);

      const optimistic: Plant = {
        id: -Date.now(),
        userId: useSessionStore().userId,
        name: plantToAdd.name,
        species: plantToAdd.species,
        description: plantToAdd.species,
        isPublic: plantToAdd.isPublic ?? false,
        created_at: Utils.convertDateMillis(Date.now()),
        imageUrl: undefined,
        substrate: { id: plantToAdd.substrateId, name: substrateName },
        images: [],
      };

      return optimisticUpsert(
        () => this.items,
        optimistic,
        async () =>
          PlantMapper.mapPlant(
            await handleRequest(
              ApiUtils.post<typeof body, APIPlant>(BASE_ENDPOINT, body),
              RESOURCE_KEY,
              "error.action_failed",
            ),
          ),
        (plant) => plant,
      );
    },

    /** Updates a plant (optimistic); the previous state of that plant returns on failure. */
    async editPlant(plantId: number, updatedPlantData: EditPlant): Promise<Plant> {
      await this.ensureLoaded();
      const existing = this.byId(plantId);

      let substrate = existing?.substrate ?? null;
      if (updatedPlantData.substrateId !== undefined) {
        substrate = {
          id: updatedPlantData.substrateId,
          name: await this.substrateName(updatedPlantData.substrateId),
        };
      }

      const optimistic: Plant = {
        id: plantId,
        userId: existing?.userId ?? -1,
        name: updatedPlantData.name ?? existing?.name ?? "",
        species: updatedPlantData.species ?? existing?.species ?? "",
        description: updatedPlantData.species ?? existing?.description ?? "",
        isPublic: updatedPlantData.isPublic ?? existing?.isPublic ?? false,
        created_at: existing?.created_at ?? Utils.convertDateMillis(Date.now()),
        imageUrl: existing?.imageUrl,
        substrate,
        images: existing?.images ?? [],
      };

      return optimisticUpsert(
        () => this.items,
        optimistic,
        async () =>
          PlantMapper.mapPlant(
            await handleRequest(
              ApiUtils.patch<EditPlant, APIPlant>(`${BASE_ENDPOINT}/${plantId}`, updatedPlantData),
              RESOURCE_KEY,
              "error.action_failed",
            ),
          ),
        (plant) => plant,
      );
    },

    /**
     * Deletes a plant (optimistic); it returns to its position if the request
     * fails. Its watering records are dropped once the server confirmed.
     */
    async deletePlant(plantId: number): Promise<void> {
      await optimisticRemove(
        () => this.items,
        plantId,
        () =>
          handleRequest(
            ApiUtils.delete<void>(`${BASE_ENDPOINT}/${plantId}`),
            RESOURCE_KEY,
            "error.action_failed",
          ),
      );
      useWateringStore().dropPlant(plantId);
    },

    /** Uploads an image, then refreshes just this plant so the gallery shows it. */
    async uploadPlantImage(plantId: number, image: File, date?: string | Date): Promise<unknown> {
      const response = await ImageService.uploadImage(image, "plant", plantId, date);
      await this.fetchOne(plantId);
      return response;
    },
  },
});
