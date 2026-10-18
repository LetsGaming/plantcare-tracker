/**
 * stores/plants.ts
 *
 * Plants on the paged summary contract. `mine` holds the signed-in user's own
 * plants (loaded completely, searched on the client, each with its watering
 * summary). `public` holds the public plants of everyone (paged and searched
 * on the server). `details` keeps plants opened by link that are in neither
 * list. Items are frozen view models in raw arrays replaced copy-on-write.
 *
 * ## V2 API endpoints used
 *
 * | Method | Path                                          | Purpose                      |
 * |--------|-----------------------------------------------|------------------------------|
 * | GET    | /plants?scope=mine&limit=100&tz_offset        | Own plants with summaries    |
 * | GET    | /plants?scope=public&limit&cursor&q&sort      | One page of public plants    |
 * | GET    | /plants/:id?tz_offset                         | One plant with its images    |
 * | POST   | /plants                                       | Create (answers the detail)  |
 * | PATCH  | /plants/:id                                   | Update (answers the detail)  |
 * | DELETE | /plants/:id                                   | Delete a plant               |
 *
 * Images are managed through ImageService (POST/PATCH/DELETE /images/plant/:id).
 * Mutations are optimistic: the expected plant is painted into `mine` at once
 * (a temporary negative id for creates), reconciled with the plant the server
 * returns, and only the affected plant is rolled back on failure.
 */

import { defineStore } from "pinia";
import { markRaw, toRaw } from "vue";
import ApiUtils from "@/utils/apiUtils";
import PlantMapper from "@/mapping/PlantMapping";
import ImageService from "@/services/ImageService";
import { handleRequest } from "@/utils/requestFeedback";
import { tzOffsetMinutes } from "@/utils/localDate";
import { useSessionStore } from "./session";
import { useSubstratesStore } from "./substrates";
import { useWateringStore } from "./watering";
import { commitList, idIndexOf, optimisticRemove, optimisticUpsert } from "./optimistic";
import {
  loadAll,
  loadFirst,
  loadMore,
  pagedPersistEntry,
  pagedState,
  setQuery,
  type FetchPage,
  type PagedState,
} from "./paged";
import { journaled, positionsOf, type ListEdit } from "./journal";
import {
  editMine,
  editPublic,
  ensureList,
  leavePublic,
  pagedFetcher,
  removing,
  replacing,
  replayOwned,
  replayPublic,
  syncPublicMembership,
  trackedAccess,
} from "./scopedLists";
import { epoch } from "./resource";

const BASE_ENDPOINT = "/plants";
const RESOURCE_KEY = "plants.title";
const MINE_KEY = "plants_mine";
const PUBLIC_KEY = "plants_public";
const DETAILS_LIMIT = 20;

type Scope = "mine" | "public";

interface PlantLists {
  mine: PagedState<PlantView>;
  public: PagedState<PlantView>;
  details: PlantView[];
}

const carryImages = (item: PlantView, known: PlantView | undefined): PlantView =>
  item.images ||
  !known?.images ||
  known.imageCount !== item.imageCount ||
  known.cover?.url !== item.cover?.url
    ? item
    : Object.freeze({ ...item, images: known.images });

const fetchScope = (scope: Scope, target: PagedState<PlantView>): FetchPage<PlantView> =>
  pagedFetcher<APIPlantListItem, PlantView>({
    endpoint: BASE_ENDPOINT,
    resourceKey: RESOURCE_KEY,
    map: PlantMapper.mapListItem,
    extra: () =>
      scope === "mine"
        ? { scope, tz_offset: tzOffsetMinutes() }
        : ({ scope } as Record<string, string>),
    finish: (items) => {
      const known = idIndexOf(target.items);
      return items.map((item) => carryImages(item, known.get(item.id)));
    },
  });

const applying =
  (summaries: ReadonlyMap<number, WateringSummary | null>): ListEdit<PlantView> =>
  (list) => {
    const raw = toRaw(list) as readonly PlantView[];
    const positions = positionsOf(raw);
    let next: PlantView[] | null = null;
    for (const [id, summary] of summaries) {
      const at = positions.get(id);
      if (at === undefined) continue;
      next ??= raw.slice();
      next[at] = PlantMapper.withWatering(raw[at], summary);
    }
    return next;
  };

const patchingSubstrate =
  (substrateId: number, name: string | null): ListEdit<PlantView> =>
  (list) => {
    const raw = toRaw(list) as readonly PlantView[];
    let next: PlantView[] | null = null;
    raw.forEach((plant, at) => {
      if (plant.substrate?.id !== substrateId) return;
      if (name !== null && plant.substrate.name === name) return;
      next ??= raw.slice();
      next[at] = Object.freeze({
        ...plant,
        substrate: name === null ? null : Object.freeze({ id: substrateId, name }),
      });
    });
    return next;
  };

const editDetails = (lists: PlantLists, edit: ListEdit<PlantView>): void => {
  const next = edit(lists.details);
  if (next) lists.details = commitList(next);
};

const editEverywhere = (lists: PlantLists, edit: ListEdit<PlantView>): void => {
  editMine(lists.mine, edit);
  editPublic(lists.public, edit);
  editDetails(lists, edit);
};

/** Puts a freshly fetched plant wherever it already is, or among the details when it is in no list. */
const mergeFetched = (lists: PlantLists, plant: PlantView): void => {
  const known =
    idIndexOf(lists.mine.items).has(plant.id) || idIndexOf(lists.public.items).has(plant.id);
  editEverywhere(lists, replacing(plant));
  if (known) {
    editDetails(lists, removing(plant.id));
    return;
  }
  const next = [...lists.details.filter((item) => item.id !== plant.id), plant];
  lists.details = commitList(next.length > DETAILS_LIMIT ? next.slice(-DETAILS_LIMIT) : next);
};

/** The details list is least recently used first: reading a plant moves it to the end. */
const touchDetail = (lists: PlantLists, id: number): void => {
  const held = idIndexOf(lists.details).get(id);
  if (!held || lists.details[lists.details.length - 1] === held) return;
  lists.details = commitList([...lists.details.filter((item) => item.id !== id), held]);
};

const neverWatered = (): WateringSummary =>
  Object.freeze({ lastWateredAt: null, lastFertilizedAt: null, avgIntervalDays: null });

export const usePlantsStore = defineStore("plants", {
  state: () => ({
    mine: pagedState<PlantView>("created"),
    public: pagedState<PlantView>("created"),
    details: markRaw([]) as PlantView[],
  }),

  persist: {
    entries: [
      pagedPersistEntry(MINE_KEY, (state) => state.mine as PagedState<PlantView>, "all", {
        dirtyOn: [
          "ensureMine",
          "fetchOne",
          "addPlant",
          "editPlant",
          "deletePlant",
          "applySummaries",
          "patchSubstrate",
        ],
      }),
      pagedPersistEntry(PUBLIC_KEY, (state) => state.public as PagedState<PlantView>, "firstPage"),
    ],
  },

  getters: {
    personalPlants: (state): PlantView[] => state.mine.items,
    byId:
      (state) =>
      (id: number): PlantView | undefined =>
        idIndexOf(state.mine.items).get(id) ??
        idIndexOf(state.public.items).get(id) ??
        idIndexOf(state.details).get(id),
  },

  actions: {
    /**
     * Makes sure the user's own plants are loaded: from memory when fresh,
     * otherwise from storage, otherwise from the API. Guests own none, so no
     * request is made for them. Concurrent callers share one load.
     */
    ensureMine({ force = false }: { force?: boolean } = {}): Promise<void> {
      if (useSessionStore().isGuest) return Promise.resolve();
      return ensureList({
        owner: this,
        key: MINE_KEY,
        target: this.mine,
        force,
        hydrate: () => this.$hydrate([MINE_KEY]),
        load: (isCurrent) => loadAll(this.mine, fetchScope("mine", this.mine), { isCurrent }),
        replay: replayOwned(this.mine),
      });
    },

    /** Same contract as `ensureMine`, for the first page of the public plants (default query). */
    ensurePublic({ force = false }: { force?: boolean } = {}): Promise<void> {
      return ensureList({
        owner: this,
        key: PUBLIC_KEY,
        target: this.public,
        force,
        hydrate: () => this.$hydrate([PUBLIC_KEY]),
        load: (isCurrent) =>
          loadFirst(this.public, fetchScope("public", this.public), { isCurrent }),
        replay: replayPublic(this.public),
      });
    },

    /** Alias of `ensureMine` for callers that only need the owner's plants. */
    ensureLoaded(options: { force?: boolean } = {}): Promise<void> {
      return this.ensureMine(options);
    },

    /** Server search over the public plants; resets paging. The same query is a no-op. */
    setPublicQuery(q: string): Promise<void> {
      const isCurrent = epoch.guard();
      return journaled(
        this.public,
        isCurrent,
        () => setQuery(this.public, { q }, fetchScope("public", this.public), { isCurrent }),
        replayPublic(this.public),
      );
    },

    loadMorePublic(): Promise<void> {
      return loadMore(this.public, fetchScope("public", this.public), {
        isCurrent: epoch.guard(),
      });
    },

    /** Fetches one plant with its images (GET /plants/:id) and merges it into the lists. */
    async fetchOne(id: number): Promise<PlantView> {
      const isCurrent = epoch.guard();
      const response = await handleRequest(
        ApiUtils.get<APIPlantDetail>(`${BASE_ENDPOINT}/${id}?tz_offset=${tzOffsetMinutes()}`),
        RESOURCE_KEY,
      );
      const plant = PlantMapper.mapDetail(response);
      if (isCurrent()) mergeFetched(this, plant);
      return plant;
    },

    /**
     * Returns a plant from memory, fetching it when it is unknown, `force` is
     * set, or only its list summary is held (no images yet).
     */
    async getPlant(id: number, force = false): Promise<PlantView> {
      const cached = this.byId(id);
      if (cached?.images && !force) {
        touchDetail(this, id);
        return cached;
      }
      return this.fetchOne(id);
    },

    /**
     * Applies watering summaries from a write response to every list holding
     * the plant: one copy-on-write commit per list, and the persisted public
     * first page follows.
     */
    applySummaries(summaries: ReadonlyMap<number, WateringSummary | null>): void {
      if (summaries.size === 0) return;
      editEverywhere(this, applying(summaries));
    },

    /** Follows a substrate rename (`name`) or deletion (`null`) in every plant that references it. */
    patchSubstrate(substrateId: number, name: string | null): void {
      editEverywhere(this, patchingSubstrate(substrateId, name));
    },

    /** Best-effort substrate name for an optimistic card; null when it cannot be loaded. */
    async substrateName(substrateId: number): Promise<string | null> {
      const substrates = useSubstratesStore();
      try {
        await substrates.ensureLoaded();
      } catch {
        // The failed request already showed its error toast; the card just lacks the name.
      }
      return substrates.byId(substrateId)?.name ?? null;
    },

    /** The substrate reference of an optimistic card; null while its name is unknown. */
    async substrateRef(substrateId: number): Promise<PlantView["substrate"]> {
      const name = await this.substrateName(substrateId);
      return name === null ? null : Object.freeze({ id: substrateId, name });
    },

    /** Creates a plant (optimistic); resolves with the plant carrying the real id. */
    async addPlant(plantToAdd: AddPlant): Promise<PlantView> {
      // `image` is handled by uploadPlantImage after creation, never sent here.
      const { image: _image, substrateId, ...rest } = plantToAdd;
      const body = substrateId === null ? rest : { ...rest, substrateId };

      const substrate = substrateId === null ? null : await this.substrateRef(substrateId);
      const species = plantToAdd.species?.trim() || null;
      const name = plantToAdd.name;

      const optimistic: PlantView = Object.freeze({
        id: -Date.now(),
        name,
        userId: useSessionStore().userId,
        isPublic: plantToAdd.isPublic ?? false,
        createdAt: Date.now(),
        speciesName: species,
        substrate,
        cover: null,
        imageCount: 0,
        watering: neverWatered(),
        searchText: PlantMapper.searchTextOf(name, species),
      });

      const created = await optimisticUpsert(
        trackedAccess(this.mine),
        optimistic,
        async () =>
          PlantMapper.mapDetail(
            await handleRequest(
              ApiUtils.post<typeof body & { tz_offset: number }, APIPlantDetail>(BASE_ENDPOINT, {
                ...body,
                tz_offset: tzOffsetMinutes(),
              }),
              RESOURCE_KEY,
              "error.action_failed",
            ),
          ),
        (plant) => plant,
      );
      syncPublicMembership(this.public, created);
      return created;
    },

    /** Updates a plant (optimistic); the previous state of that plant returns on failure. */
    async editPlant(plantId: number, updatedPlantData: EditPlant): Promise<PlantView> {
      await this.ensureMine();
      const existing = this.byId(plantId) ?? (await this.fetchOne(plantId));

      let substrate = existing.substrate;
      const { substrateId } = updatedPlantData;
      if (substrateId === null) {
        substrate = null;
      } else if (substrateId !== undefined) {
        substrate = await this.substrateRef(substrateId);
      }

      const species =
        updatedPlantData.species === undefined
          ? existing.speciesName
          : updatedPlantData.species?.trim() || null;
      const name = updatedPlantData.name ?? existing.name;

      const optimistic: PlantView = Object.freeze({
        ...existing,
        name,
        speciesName: species,
        isPublic: updatedPlantData.isPublic ?? existing.isPublic,
        substrate,
        searchText: PlantMapper.searchTextOf(name, species),
      });

      const updated = await optimisticUpsert(
        trackedAccess(this.mine),
        optimistic,
        async () =>
          PlantMapper.mapDetail(
            await handleRequest(
              ApiUtils.patch<EditPlant & { tz_offset: number }, APIPlantDetail>(
                `${BASE_ENDPOINT}/${plantId}`,
                { ...updatedPlantData, tz_offset: tzOffsetMinutes() },
              ),
              RESOURCE_KEY,
              "error.action_failed",
            ),
          ),
        (plant) => plant,
      );
      editPublic(this.public, replacing(updated));
      editDetails(this, replacing(updated));
      syncPublicMembership(this.public, updated);
      return updated;
    },

    /**
     * Deletes a plant (optimistic); it returns to its position if the request
     * fails. It leaves the other lists and its watering records are dropped
     * once the server confirmed.
     */
    async deletePlant(plantId: number): Promise<void> {
      await optimisticRemove(trackedAccess(this.mine), plantId, () =>
        handleRequest(
          ApiUtils.delete<void>(`${BASE_ENDPOINT}/${plantId}`),
          RESOURCE_KEY,
          "error.action_failed",
        ),
      );
      leavePublic(this.public, plantId);
      editDetails(this, removing(plantId));
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
