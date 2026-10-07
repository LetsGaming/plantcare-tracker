/**
 * stores/watering.ts
 *
 * Watering history per plant and the global list of fertilizer types.
 *
 * ## V2 API endpoints used
 *
 * | Method | Path                       | Purpose                           |
 * |--------|----------------------------|-----------------------------------|
 * | GET    | /watering/plant/:plantId   | Records of one plant              |
 * | GET    | /watering/fertilizer-types | Fertilizer types                  |
 * | POST   | /watering/:plantId         | Add a record                      |
 * | PATCH  | /watering/:recordId        | Edit a record                     |
 * | DELETE | /watering/:recordId        | Delete a record                   |
 *
 * Mutations are optimistic: the expected record is painted at once (a
 * temporary negative id for creates), reconciled with the server record, and
 * only that record is rolled back on failure.
 */

import { defineStore } from "pinia";
import ApiUtils from "@/utils/apiUtils";
import WateringMapper from "@/mapping/WateringMapping";
import Utils from "@/utils/utils";
import { handleRequest } from "@/utils/requestFeedback";
import { optimisticRemove, optimisticUpsert } from "./optimistic";
import { coalesced, isStale } from "./resource";

const BASE_ENDPOINT = "/watering";
const RESOURCE_KEY = "watering.title";

export const useWateringStore = defineStore("watering", {
  state: () => ({
    /** Records keyed by plant id; a missing key means "not loaded yet". */
    byPlantId: {} as Record<number, WateringRecord[]>,
    /** When each plant's records were fetched. */
    loadedAt: {} as Record<number, number>,
    fertilizerTypes: [] as FertilizerType[],
    typesFetchedAt: null as number | null,
  }),

  persist: {
    entries: [
      {
        key: "watering_records_data",
        pick: (state) => state.byPlantId,
        timestamp: (state) => Math.max(0, ...Object.values(state.loadedAt)) || null,
        apply: (state, data: Record<number, WateringRecord[]>, timestamp) => {
          state.byPlantId = data;
          state.loadedAt = Object.fromEntries(Object.keys(data).map((id) => [id, timestamp]));
        },
      },
      {
        key: "fertilizer_types_data",
        pick: (state) => state.fertilizerTypes,
        timestamp: (state) => state.typesFetchedAt,
        apply: (state, data: FertilizerType[], timestamp) => {
          state.fertilizerTypes = data;
          state.typesFetchedAt = timestamp;
        },
      },
    ],
  },

  getters: {
    recordsFor:
      (state) =>
      (plantId: number): WateringRecord[] =>
        state.byPlantId[plantId] ?? [],
  },

  actions: {
    /** Loads one plant's records unless they are in memory and fresh. */
    ensureRecords(plantId: number, { force = false }: { force?: boolean } = {}): Promise<void> {
      const fresh = this.byPlantId[plantId] && !isStale(this.loadedAt[plantId] ?? null);
      if (!force && fresh) return Promise.resolve();
      return coalesced(this, `records:${plantId}`, async () => {
        if (!force && Object.keys(this.byPlantId).length === 0) {
          await this.$hydrate();
          if (this.byPlantId[plantId] && !isStale(this.loadedAt[plantId] ?? null)) return;
        }
        this.byPlantId[plantId] = await handleRequest(this.fetchRecords(plantId), RESOURCE_KEY);
        this.loadedAt[plantId] = Date.now();
      });
    },

    async fetchRecords(plantId: number): Promise<WateringRecord[]> {
      try {
        const response = await ApiUtils.get<APIWateringRecord[]>(
          `${BASE_ENDPOINT}/plant/${plantId}`,
        );
        return WateringMapper.convertToWateringRecords(response);
      } catch (error) {
        // An unknown plant id has no history; the list endpoint itself answers [].
        if (ApiUtils.isApiError(error) && error.status === 404) return [];
        throw error;
      }
    },

    /** Loads the fertilizer types unless they are in memory and fresh. */
    ensureFertilizerTypes({ force = false }: { force?: boolean } = {}): Promise<void> {
      if (!force && this.fertilizerTypes.length > 0 && !isStale(this.typesFetchedAt)) {
        return Promise.resolve();
      }
      return coalesced(this, "types", async () => {
        if (!force && this.fertilizerTypes.length === 0) {
          await this.$hydrate();
          if (this.fertilizerTypes.length > 0 && !isStale(this.typesFetchedAt)) return;
        }
        const response = await handleRequest(
          ApiUtils.get<APIFertilizerType[]>(`${BASE_ENDPOINT}/fertilizer-types`),
          "watering.fertilizer_types",
        );
        this.fertilizerTypes = WateringMapper.convertToFertilizerTypes(response);
        this.typesFetchedAt = Date.now();
      });
    },

    /** Forgets a deleted plant's records. */
    dropPlant(plantId: number): void {
      delete this.byPlantId[plantId];
      delete this.loadedAt[plantId];
    },

    /** Adds a record (optimistic); resolves with the server record. */
    async addRecord(plantId: number, data: AddWateringRecord): Promise<WateringRecord> {
      const millis = data.date ?? Date.now();
      const optimistic: WateringRecord = {
        id: -Date.now(),
        plantId,
        plantName: this.recordsFor(plantId)[0]?.plantName ?? "",
        date: Utils.convertDateMillis(millis),
        date_millis: millis,
        usedFertilizer: data.usedFertilizer,
        fertilizerTypeId: data.fertilizerTypeId ?? undefined,
        fertilizerType: this.fertilizerName(data.fertilizerTypeId),
      };

      return optimisticUpsert(
        () => this.listFor(plantId),
        optimistic,
        async () =>
          WateringMapper.mapWateringRecord(
            await handleRequest(
              ApiUtils.post<AddWateringRecord, APIWateringRecord>(
                `${BASE_ENDPOINT}/${plantId}`,
                data,
              ),
              RESOURCE_KEY,
              "watering.add",
            ),
          ),
        (record) => record,
      );
    },

    /** Edits a record (optimistic); the previous state returns if the request fails. */
    async editRecord(
      plantId: number,
      recordId: number,
      data: EditWateringRecord,
    ): Promise<WateringRecord> {
      await this.ensureRecords(plantId);
      const existing = this.recordsFor(plantId).find((record) => record.id === recordId);
      const millis = data.date ?? existing?.date_millis ?? Date.now();
      const optimistic: WateringRecord = {
        id: recordId,
        plantId,
        plantName: existing?.plantName ?? "",
        date: Utils.convertDateMillis(millis),
        date_millis: millis,
        usedFertilizer: data.usedFertilizer,
        fertilizerTypeId: data.fertilizerTypeId ?? undefined,
        fertilizerType: this.fertilizerName(data.fertilizerTypeId),
      };

      return optimisticUpsert(
        () => this.listFor(plantId),
        optimistic,
        async () =>
          WateringMapper.mapWateringRecord(
            await handleRequest(
              ApiUtils.patch<EditWateringRecord, APIWateringRecord>(
                `${BASE_ENDPOINT}/${recordId}`,
                data,
              ),
              RESOURCE_KEY,
              "watering.update",
            ),
          ),
        (record) => record,
      );
    },

    /** Deletes a record (optimistic); it returns to its position if the request fails. */
    async deleteRecord(plantId: number, recordId: number): Promise<void> {
      await optimisticRemove(
        () => this.listFor(plantId),
        recordId,
        () =>
          handleRequest(
            ApiUtils.delete<void>(`${BASE_ENDPOINT}/${recordId}`),
            RESOURCE_KEY,
            "watering.delete",
          ),
      );
    },

    /** The mutable list of one plant, created on first use. */
    listFor(plantId: number): WateringRecord[] {
      this.byPlantId[plantId] ??= [];
      return this.byPlantId[plantId];
    },

    /** Best-effort display name from the loaded fertilizer types. */
    fertilizerName(fertilizerTypeId?: number | null): string | undefined {
      if (fertilizerTypeId == null) return undefined;
      return this.fertilizerTypes.find((type) => type.id === fertilizerTypeId)?.name;
    },
  },
});
