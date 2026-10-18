/**
 * stores/watering.ts
 *
 * Watering history of the plants being looked at, and the global list of
 * fertilizer types.
 *
 * Plant lists carry a watering summary of their own (stores/plants.ts), so the
 * history is only loaded for a plant that is opened: its newest 50 records,
 * then older pages on request. Histories live in an LRU of 20 plants and are
 * not persisted.
 *
 * ## V2 API endpoints used
 *
 * | Method | Path                         | Purpose                             |
 * |--------|------------------------------|-------------------------------------|
 * | GET    | /watering/plant/:plantId     | One page of a plant's records       |
 * | GET    | /watering/fertilizer-types   | Fertilizer types                    |
 * | POST   | /watering/:plantId           | Add a record                        |
 * | PATCH  | /watering/:recordId          | Edit a record                       |
 * | DELETE | /watering/:recordId          | Delete a record                     |
 * | POST   | /watering/batch              | Add records for many plants         |
 * | POST   | /watering/batch/delete       | Delete many records                 |
 *
 * Every write answers with the changed records and the plants' new summaries.
 * They are applied to the loaded windows and to the plants store; histories
 * are never refetched after a write. Single writes are optimistic and only
 * their own record is rolled back on failure.
 */

import { markRaw, toRaw } from "vue";
import { defineStore } from "pinia";
import ApiUtils from "@/utils/apiUtils";
import WateringMapper from "@/mapping/WateringMapping";
import { handleRequest, withoutErrorToasts } from "@/utils/requestFeedback";
import { tzOffsetMinutes } from "@/utils/localDate";
import { coalesced, epoch, isStale } from "./resource";
import { usePlantsStore } from "./plants";
import type { ApiPage } from "./paged";

const BASE_ENDPOINT = "/watering";
const RESOURCE_KEY = "watering.title";
const BATCH_LIMIT = 200;
export const HISTORY_PAGE_SIZE = 50;
export const HISTORY_CACHE_SIZE = 20;

const EMPTY_ENTRIES: readonly WateringEntry[] = Object.freeze([]);

const chunked = <T>(items: T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / BATCH_LIMIT) }, (_, i) =>
    items.slice(i * BATCH_LIMIT, (i + 1) * BATCH_LIMIT),
  );

const toSeconds = (millis: number): number => Math.floor(millis / 1000);

/** The loaded part of one plant's history, newest first. */
export interface PlantHistory {
  readonly items: readonly WateringEntry[];
  /** Cursor of the next older page; null when the whole history is loaded. */
  readonly nextCursor: string | null;
  readonly loadedAt: number;
}

interface WriteBody {
  date?: number;
  usedFertilizer?: boolean;
  fertilizerTypeId?: number | null;
  tz_offset: number;
}

const MAX_FIRST_PAGE_RETRIES = 2;

let tempSeq = 0;

/**
 * Counts writes per plant so a first page requested before a write is requested again. Cleared
 * whenever the session changes, which also bounds its size.
 */
const writeCounts = new Map<number, number>();
let writeCountsEpoch = epoch.current();
const currentWriteCounts = (): Map<number, number> => {
  if (writeCountsEpoch !== epoch.current()) {
    writeCounts.clear();
    writeCountsEpoch = epoch.current();
  }
  return writeCounts;
};
const writeCount = (plantId: number): number => currentWriteCounts().get(plantId) ?? 0;
const noteWrite = (plantId: number): void => {
  currentWriteCounts().set(plantId, writeCount(plantId) + 1);
};

const sortsBefore = (a: WateringEntry, b: WateringEntry): boolean =>
  a.date !== b.date ? a.date > b.date : a.id > b.id;

/**
 * A new list with the entry in its place. An entry older than everything loaded is left out while
 * older pages remain: it arrives with them. `boundary` is the oldest loaded record before the
 * operation (the stand-in for the paging cursor): an entry that sorts after everything but is not
 * older than it still belongs to the window.
 */
const inserted = (
  items: readonly WateringEntry[],
  entry: WateringEntry,
  hasOlder: boolean,
  replacing: ReadonlySet<number>,
  boundary?: WateringEntry,
): readonly WateringEntry[] => {
  const rest = items.filter((item) => item.id !== entry.id && !replacing.has(item.id));
  const index = rest.findIndex((item) => sortsBefore(entry, item));
  if (index === -1) {
    const withinWindow = !hasOlder || (boundary !== undefined && !sortsBefore(boundary, entry));
    return withinWindow ? markRaw([...rest, entry]) : markRaw(rest);
  }
  return markRaw([...rest.slice(0, index), entry, ...rest.slice(index)]);
};

const entryOf = (
  id: number,
  plantId: number,
  date: number,
  data: { usedFertilizer?: boolean; fertilizerTypeId?: number | null },
): WateringEntry =>
  WateringMapper.mapEntry({
    id,
    plant_id: plantId,
    date,
    used_fertilizer: data.usedFertilizer ?? false,
    fertilizer_type_id: data.fertilizerTypeId ?? null,
  });

interface HistoryPage {
  items: WateringEntry[];
  nextCursor: string | null;
}

const fetchHistoryPage = async (plantId: number, before: string | null): Promise<HistoryPage> => {
  const params = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE) });
  if (before !== null) params.set("before", before);
  try {
    const page = await ApiUtils.get<ApiPage<APIWateringItem>>(
      `${BASE_ENDPOINT}/plant/${plantId}?${params}`,
    );
    return { items: WateringMapper.mapEntries(page.items), nextCursor: page.next_cursor };
  } catch (error) {
    // An unknown plant id has no history.
    if (before === null && ApiUtils.isApiError(error) && error.status === 404) {
      return { items: [], nextCursor: null };
    }
    throw error;
  }
};

const writeBody = (data: AddWateringRecord | EditWateringRecord): WriteBody => {
  const body: WriteBody = { tz_offset: tzOffsetMinutes() };
  if (data.date !== undefined) body.date = toSeconds(data.date);
  body.usedFertilizer = data.usedFertilizer;
  body.fertilizerTypeId = data.fertilizerTypeId;
  return body;
};

const summaryOf = (plantId: number, summary: APIWateringSummary) =>
  new Map<number, WateringSummary | null>([[plantId, WateringMapper.mapSummary(summary)]]);

export const useWateringStore = defineStore("watering", {
  state: () => ({
    /** Loaded history windows by plant id; a missing key means "not loaded". Not persisted. */
    byPlantId: {} as Record<number, PlantHistory>,
    /** Plant ids in `byPlantId`, least recently used first. */
    order: [] as number[],
    fertilizerTypes: [] as FertilizerType[],
    typesFetchedAt: null as number | null,
  }),

  persist: {
    entries: [
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
    /** The loaded newest-first window of one plant; empty when not loaded. */
    recordsFor:
      (state) =>
      (plantId: number): readonly WateringEntry[] =>
        state.byPlantId[plantId]?.items ?? EMPTY_ENTRIES,
    isLoaded:
      (state) =>
      (plantId: number): boolean =>
        !!state.byPlantId[plantId],
    hasOlder:
      (state) =>
      (plantId: number): boolean =>
        (state.byPlantId[plantId]?.nextCursor ?? null) !== null,
    isFresh:
      (state) =>
      (plantId: number): boolean =>
        !!state.byPlantId[plantId] && !isStale(state.byPlantId[plantId].loadedAt),
  },

  actions: {
    /** Loads the newest page of one plant's history unless it is in memory and fresh. */
    ensureRecords(plantId: number, { force = false }: { force?: boolean } = {}): Promise<void> {
      if (!force && this.isFresh(plantId)) {
        this.touch(plantId);
        return Promise.resolve();
      }
      return coalesced(this, `records:${plantId}`, async (isCurrent) => {
        const request = () => handleRequest(fetchHistoryPage(plantId, null), RESOURCE_KEY);
        let seen = writeCount(plantId);
        let page = await request();
        for (
          let retry = 0;
          retry < MAX_FIRST_PAGE_RETRIES && isCurrent() && writeCount(plantId) !== seen;
          retry++
        ) {
          seen = writeCount(plantId);
          page = await request();
        }
        if (!isCurrent()) return;
        this.commitHistory(plantId, {
          items: markRaw(page.items),
          nextCursor: page.nextCursor,
          loadedAt: Date.now(),
        });
      });
    },

    /** Appends the next older page to a loaded window; no-op when everything is loaded. */
    loadOlder(plantId: number): Promise<void> {
      const cursor = this.byPlantId[plantId]?.nextCursor ?? null;
      if (cursor === null) return Promise.resolve();
      return coalesced(this, `older:${plantId}`, async (isCurrent) => {
        const page = await handleRequest(fetchHistoryPage(plantId, cursor), RESOURCE_KEY);
        if (!isCurrent()) return;
        const current = this.byPlantId[plantId];
        if (!current || current.nextCursor !== cursor) return;
        const known = new Set(current.items.map((item) => item.id));
        this.commitHistory(plantId, {
          items: markRaw([...current.items, ...page.items.filter((item) => !known.has(item.id))]),
          nextCursor: page.nextCursor,
          loadedAt: current.loadedAt,
        });
      });
    },

    /** Stores a window and makes the plant the most recently used; evicts beyond the cache size. */
    commitHistory(plantId: number, history: PlantHistory): void {
      const byPlantId = { ...toRaw(this.byPlantId), [plantId]: history };
      const order = [...toRaw(this.order).filter((id) => id !== plantId), plantId];
      while (order.length > HISTORY_CACHE_SIZE) {
        delete byPlantId[order.shift() as number];
      }
      this.byPlantId = byPlantId;
      this.order = order;
    },

    touch(plantId: number): void {
      const order = toRaw(this.order);
      if (order[order.length - 1] === plantId || !order.includes(plantId)) return;
      this.order = [...order.filter((id) => id !== plantId), plantId];
    },

    /** Loads the fertilizer types unless they are in memory and fresh. */
    ensureFertilizerTypes({ force = false }: { force?: boolean } = {}): Promise<void> {
      if (!force && this.fertilizerTypes.length > 0 && !isStale(this.typesFetchedAt)) {
        return Promise.resolve();
      }
      return coalesced(this, "types", async (isCurrent) => {
        if (!force && this.fertilizerTypes.length === 0) {
          await this.$hydrate();
          if (this.fertilizerTypes.length > 0 && !isStale(this.typesFetchedAt)) return;
        }
        const response = await handleRequest(
          ApiUtils.get<APIFertilizerType[]>(`${BASE_ENDPOINT}/fertilizer-types`),
          "watering.fertilizer_types",
        );
        if (!isCurrent()) return;
        this.fertilizerTypes = WateringMapper.convertToFertilizerTypes(response);
        this.typesFetchedAt = Date.now();
      });
    },

    /** Forgets a deleted plant's history. */
    dropPlant(plantId: number): void {
      if (!this.byPlantId[plantId]) return;
      const byPlantId = { ...toRaw(this.byPlantId) };
      delete byPlantId[plantId];
      this.byPlantId = byPlantId;
      this.order = toRaw(this.order).filter((id) => id !== plantId);
    },

    /**
     * Puts an entry into a loaded window at its place (nothing when the plant's window is not
     * loaded); `replacing` ids leave the window in the same commit.
     */
    applyEntry(
      plantId: number,
      entry: WateringEntry,
      replacing: number[] = [],
      boundary?: WateringEntry,
    ): void {
      const history = this.byPlantId[plantId];
      if (!history) return;
      this.touch(plantId);
      const items = inserted(
        history.items,
        entry,
        history.nextCursor !== null,
        new Set(replacing),
        boundary,
      );
      this.byPlantId = { ...toRaw(this.byPlantId), [plantId]: { ...history, items } };
    },

    /** Removes records from every loaded window with one commit. */
    dropEntries(recordIds: number[]): void {
      const ids = new Set(recordIds);
      const byPlantId = { ...toRaw(this.byPlantId) };
      let changed = false;
      for (const [key, history] of Object.entries(byPlantId)) {
        if (!history.items.some((item) => ids.has(item.id))) continue;
        byPlantId[Number(key)] = {
          ...history,
          items: markRaw(history.items.filter((item) => !ids.has(item.id))),
        };
        changed = true;
      }
      if (changed) this.byPlantId = byPlantId;
    },

    /** Adds a record (optimistic); resolves with the server record. */
    async addRecord(plantId: number, data: AddWateringRecord): Promise<WateringEntry> {
      const isCurrent = epoch.guard();
      const optimistic = entryOf(-++tempSeq, plantId, data.date ?? Date.now(), data);
      noteWrite(plantId);
      this.applyEntry(plantId, optimistic);
      try {
        const response = await handleRequest(
          ApiUtils.post<WriteBody, APIWateringRecordResponse>(
            `${BASE_ENDPOINT}/${plantId}`,
            writeBody(data),
          ),
          RESOURCE_KEY,
          "watering.add",
        );
        const saved = WateringMapper.mapEntry(response.record);
        if (isCurrent()) {
          this.applyEntry(plantId, saved, [optimistic.id]);
          usePlantsStore().applySummaries(summaryOf(plantId, response.summary));
        }
        return saved;
      } catch (error) {
        if (isCurrent()) this.dropEntries([optimistic.id]);
        throw error;
      }
    },

    /** Edits a record (optimistic); the previous state returns if the request fails. */
    async editRecord(
      plantId: number,
      recordId: number,
      data: EditWateringRecord,
    ): Promise<WateringEntry> {
      const isCurrent = epoch.guard();
      const { existing, boundary } = this.windowPosition(plantId, recordId);
      noteWrite(plantId);
      if (existing) {
        this.applyEntry(
          plantId,
          entryOf(recordId, plantId, data.date ?? existing.date, data),
          [],
          boundary,
        );
      }
      try {
        const response = await handleRequest(
          ApiUtils.patch<WriteBody, APIWateringRecordResponse>(
            `${BASE_ENDPOINT}/${recordId}`,
            writeBody(data),
          ),
          RESOURCE_KEY,
          "watering.update",
        );
        const saved = WateringMapper.mapEntry(response.record);
        if (isCurrent()) {
          this.applyEntry(plantId, saved, [], boundary);
          usePlantsStore().applySummaries(summaryOf(plantId, response.summary));
        }
        return saved;
      } catch (error) {
        if (isCurrent() && existing) this.applyEntry(plantId, existing, [], boundary);
        throw error;
      }
    },

    /** Deletes a record (optimistic); it returns to its position if the request fails. */
    async deleteRecord(plantId: number, recordId: number): Promise<void> {
      const isCurrent = epoch.guard();
      const { existing, boundary } = this.windowPosition(plantId, recordId);
      noteWrite(plantId);
      this.dropEntries([recordId]);
      try {
        const response = await handleRequest(
          ApiUtils.delete<APIWateringDeleteResponse>(
            `${BASE_ENDPOINT}/${recordId}?tz_offset=${tzOffsetMinutes()}`,
          ),
          RESOURCE_KEY,
          "watering.delete",
        );
        if (isCurrent()) usePlantsStore().applySummaries(summaryOf(plantId, response.summary));
      } catch (error) {
        if (isCurrent() && existing) this.applyEntry(plantId, existing, [], boundary);
        throw error;
      }
    },

    /** A loaded record and the oldest loaded record of its window (the paging boundary). */
    windowPosition(
      plantId: number,
      recordId: number,
    ): { existing?: WateringEntry; boundary?: WateringEntry } {
      const items = this.byPlantId[plantId]?.items;
      const existing = items?.find((item) => item.id === recordId);
      return existing ? { existing, boundary: items?.[items.length - 1] } : {};
    },

    /**
     * Logs one watering per entry, in requests of at most `BATCH_LIMIT`; resolves with the new
     * record ids. If a request fails, the records created so far are deleted again.
     */
    async addBatch(entries: WateringBatchEntry[]): Promise<number[]> {
      const isCurrent = epoch.guard();
      const ids: number[] = [];
      try {
        for (const chunk of chunked(entries)) {
          const created = await handleRequest(
            ApiUtils.post<
              { entries: WateringBatchEntry[]; tz_offset: number },
              APIWateringBatchResponse
            >(`${BASE_ENDPOINT}/batch`, { entries: chunk, tz_offset: tzOffsetMinutes() }),
            RESOURCE_KEY,
            "watering.add",
          );
          ids.push(...created.records.map((record) => record.id));
          if (!isCurrent()) return ids;
          for (const record of created.records) {
            noteWrite(record.plant_id);
            this.applyEntry(record.plant_id, WateringMapper.mapEntry(record));
          }
          usePlantsStore().applySummaries(WateringMapper.mapSummaries(created.summaries));
        }
      } catch (error) {
        if (isCurrent()) {
          try {
            await withoutErrorToasts(() => this.deleteChunks(ids));
          } catch (rollbackError) {
            console.error("Rolling back the watering batch failed:", rollbackError);
          }
        }
        throw error;
      }
      return ids;
    },

    /** Deletes records created by `addBatch`. */
    async removeBatch(recordIds: number[], plantIds: number[] = []): Promise<void> {
      for (const plantId of plantIds) noteWrite(plantId);
      await this.deleteChunks(recordIds);
    },

    async deleteChunks(recordIds: number[]): Promise<void> {
      const isCurrent = epoch.guard();
      for (const chunk of chunked(recordIds)) {
        const response = await handleRequest(
          ApiUtils.post<{ ids: number[]; tz_offset: number }, APIWateringBatchDeleteResponse>(
            `${BASE_ENDPOINT}/batch/delete`,
            { ids: chunk, tz_offset: tzOffsetMinutes() },
          ),
          RESOURCE_KEY,
          "watering.delete",
        );
        if (!isCurrent()) return;
        this.dropEntries(chunk);
        usePlantsStore().applySummaries(WateringMapper.mapSummaries(response.summaries));
      }
    },
  },
});
