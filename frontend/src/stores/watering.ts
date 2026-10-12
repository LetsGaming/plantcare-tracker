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
 * | POST   | /watering/batch            | Add records for many plants       |
 * | POST   | /watering/batch/delete     | Delete many records               |
 *
 * Mutations are optimistic: the expected record is painted at once (a
 * temporary negative id for creates), reconciled with the server record, and
 * only that record is rolled back on failure.
 */

import { toRaw } from "vue";
import { defineStore } from "pinia";
import ApiUtils from "@/utils/apiUtils";
import WateringMapper from "@/mapping/WateringMapping";
import Utils from "@/utils/utils";
import { handleRequest, withoutErrorToasts } from "@/utils/requestFeedback";
import { optimisticRemove, optimisticUpsert } from "./optimistic";
import { coalesced, isStale } from "./resource";

const BASE_ENDPOINT = "/watering";
const RESOURCE_KEY = "watering.title";
const BATCH_LIMIT = 200;

const chunked = <T>(items: T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / BATCH_LIMIT) }, (_, i) =>
    items.slice(i * BATCH_LIMIT, (i + 1) * BATCH_LIMIT),
  );

interface RecordState {
  byPlantId: Record<number, WateringRecord[]>;
  loadedAt: Record<number, number>;
  maxLoadedAt: number;
}

interface RecordSource {
  collectRecords(plantId: number, force: boolean): Promise<WateringRecord[] | null>;
}

const collecting = new WeakMap<object, Map<number, Promise<WateringRecord[] | null>>>();

/**
 * Stores fetched records with one assignment per field, however many plants. Deliberately not a
 * store action: persistence marks only the outer action that started in the current session.
 */
const commitRecords = (state: RecordState, records: Map<number, WateringRecord[]>): void => {
  if (records.size === 0) return;
  const now = Date.now();
  const byPlantId = { ...toRaw(state.byPlantId) };
  const loadedAt = { ...toRaw(state.loadedAt) };
  for (const [plantId, list] of records) {
    byPlantId[plantId] = list;
    loadedAt[plantId] = now;
  }
  state.byPlantId = byPlantId;
  state.loadedAt = loadedAt;
  state.maxLoadedAt = now;
};

/** Warms many plants, `limit` requests at a time, committing once per `limit` finished plants. */
const warmRecords = async (
  store: RecordState & RecordSource,
  plantIds: number[],
  limit: number,
  force: boolean,
): Promise<void> => {
  const queue = [...plantIds];
  let wave = new Map<number, WateringRecord[]>();
  const commitWave = () => {
    if (wave.size === 0) return;
    const finished = wave;
    wave = new Map();
    commitRecords(store, finished);
  };
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        const records = await store.collectRecords(id, force);
        if (records) wave.set(id, records);
        if (wave.size >= limit) commitWave();
      } catch {
        // The list simply shows no watering line for this plant.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker));
  commitWave();
};

export const useWateringStore = defineStore("watering", {
  state: () => ({
    /** Records keyed by plant id; a missing key means "not loaded yet". */
    byPlantId: {} as Record<number, WateringRecord[]>,
    /** When each plant's records were fetched. */
    loadedAt: {} as Record<number, number>,
    /** The newest `loadedAt` value, kept so persisting never scans the map; 0 when nothing is loaded. */
    maxLoadedAt: 0,
    /** Whether the stored snapshot was already read this session; it is read at most once. */
    hydrateAttempted: false,
    fertilizerTypes: [] as FertilizerType[],
    typesFetchedAt: null as number | null,
  }),

  persist: {
    entries: [
      {
        key: "watering_records_data",
        pick: (state) => state.byPlantId,
        timestamp: (state) => state.maxLoadedAt || null,
        dirtyOn: [
          "ensureRecords",
          "ensureRecordsFor",
          "dropPlant",
          "addRecord",
          "editRecord",
          "deleteRecord",
          "addBatch",
          "removeBatch",
        ],
        version: (state) => state.byPlantId,
        apply: (state, data: Record<number, WateringRecord[]>, timestamp) => {
          // Records already in memory are newer than the snapshot and win.
          state.byPlantId = { ...data, ...toRaw(state.byPlantId) };
          state.loadedAt = {
            ...Object.fromEntries(Object.keys(data).map((id) => [id, timestamp])),
            ...toRaw(state.loadedAt),
          };
          state.maxLoadedAt =
            Object.keys(data).length > 0
              ? Math.max(timestamp, state.maxLoadedAt)
              : state.maxLoadedAt;
        },
      },
      {
        key: "fertilizer_types_data",
        pick: (state) => state.fertilizerTypes,
        timestamp: (state) => state.typesFetchedAt,
        dirtyOn: ["ensureFertilizerTypes"],
        version: (state) => state.typesFetchedAt,
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
    isFresh:
      (state) =>
      (plantId: number): boolean =>
        !!state.byPlantId[plantId] && !isStale(state.loadedAt[plantId] ?? null),
  },

  actions: {
    /** Loads one plant's records unless they are in memory and fresh. */
    ensureRecords(plantId: number, { force = false }: { force?: boolean } = {}): Promise<void> {
      if (!force && this.isFresh(plantId)) return Promise.resolve();
      return coalesced(this, `records:${plantId}`, async () => {
        const records = await this.collectRecords(plantId, force);
        if (records) commitRecords(this, new Map([[plantId, records]]));
      });
    },

    /**
     * Warms the records of many plants, `limit` requests at a time; failures are skipped.
     * Results are committed to the state once per `limit` finished plants.
     */
    async ensureRecordsFor(
      plantIds: number[],
      limit = 3,
      { force = false }: { force?: boolean } = {},
    ): Promise<void> {
      await warmRecords(this, plantIds, limit, force);
    },

    /**
     * Reads one plant's records from storage or the API without touching the records; null when
     * already fresh. Overlapping callers for one plant share a single read.
     */
    collectRecords(plantId: number, force: boolean): Promise<WateringRecord[] | null> {
      let byPlant = collecting.get(this);
      if (!byPlant) collecting.set(this, (byPlant = new Map()));
      const running = byPlant.get(plantId);
      if (running) return running;
      const promise = this.loadRecords(plantId, force).finally(() => byPlant.delete(plantId));
      byPlant.set(plantId, promise);
      return promise;
    },

    async loadRecords(plantId: number, force: boolean): Promise<WateringRecord[] | null> {
      if (!force && this.isFresh(plantId)) return null;
      if (!force && !this.hydrateAttempted && Object.keys(toRaw(this.byPlantId)).length === 0) {
        await this.$hydrate();
        this.hydrateAttempted = true;
        if (this.isFresh(plantId)) return null;
      }
      return handleRequest(this.fetchRecords(plantId), RESOURCE_KEY);
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
      const byPlantId = { ...toRaw(this.byPlantId) };
      const loadedAt = { ...toRaw(this.loadedAt) };
      delete byPlantId[plantId];
      delete loadedAt[plantId];
      this.byPlantId = byPlantId;
      this.loadedAt = loadedAt;
      if (Object.keys(byPlantId).length === 0) this.maxLoadedAt = 0;
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

      const saved = await optimisticUpsert(
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
      this.renewRecords();
      return saved;
    },

    /** Gives the record map a new identity after in-place list edits, which is what persistence compares. */
    renewRecords(): void {
      this.byPlantId = { ...toRaw(this.byPlantId) };
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

      const saved = await optimisticUpsert(
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
      this.renewRecords();
      return saved;
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
      this.renewRecords();
    },

    /**
     * Logs one watering per entry, in requests of at most `BATCH_LIMIT`; resolves with the new
     * record ids. If a request fails, the records created so far are deleted again.
     */
    async addBatch(entries: WateringBatchEntry[]): Promise<number[]> {
      const ids: number[] = [];
      try {
        for (const chunk of chunked(entries)) {
          const created = await handleRequest(
            ApiUtils.post<{ entries: WateringBatchEntry[] }, { ids: number[] }>(
              `${BASE_ENDPOINT}/batch`,
              { entries: chunk },
            ),
            RESOURCE_KEY,
            "watering.add",
          );
          ids.push(...created.ids);
        }
      } catch (error) {
        await withoutErrorToasts(() => this.deleteChunks(ids)).catch(() => undefined);
        throw error;
      }
      await this.refetchPlants(entries.map((entry) => entry.plantId));
      return ids;
    },

    /** Deletes records created by `addBatch`. */
    async removeBatch(recordIds: number[], plantIds: number[]): Promise<void> {
      await this.deleteChunks(recordIds);
      await this.refetchPlants(plantIds);
    },

    async deleteChunks(recordIds: number[]): Promise<void> {
      for (const chunk of chunked(recordIds)) {
        await handleRequest(
          ApiUtils.post<{ ids: number[] }, void>(`${BASE_ENDPOINT}/batch/delete`, { ids: chunk }),
          RESOURCE_KEY,
          "watering.delete",
        );
      }
    },

    /** Refreshes the affected plants; the records already changed, so failures are ignored. */
    async refetchPlants(plantIds: number[]): Promise<void> {
      await withoutErrorToasts(() => warmRecords(this, [...new Set(plantIds)], 3, true));
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
