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
import { useSessionStore } from "./session";
import { useSubstratesStore } from "./substrates";
import { useWateringStore } from "./watering";
import {
  commitList,
  idIndexOf,
  optimisticRemove,
  optimisticUpsert,
  removeItem,
  upsertItem,
  type ListAccess,
} from "./optimistic";
import {
  loadAll,
  loadFirst,
  loadMore,
  mapPage,
  pageSearchParams,
  pagedPersistEntry,
  pagedState,
  setQuery,
  type ApiPage,
  type FetchPage,
  type PageNotModified,
  type PagedState,
} from "./paged";
import { coalesced, epoch, isStale } from "./resource";

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

type ListEdit = (list: readonly PlantView[]) => PlantView[] | null;

/** Minutes east of UTC, the unit of the API's `tz_offset`. */
const tzOffset = (): number => Math.round(-new Date().getTimezoneOffset());

const sessionGuard = (): (() => boolean) => {
  const started = epoch.current();
  return () => !epoch.isStale(started);
};

const fetchScope =
  (scope: Scope): FetchPage<PlantView> =>
  async (params) => {
    const extra = scope === "mine" ? { scope, tz_offset: tzOffset() } : { scope };
    const path = `${BASE_ENDPOINT}?${pageSearchParams(params, extra)}`;
    const request = params.conditional
      ? ApiUtils.get<ApiPage<APIPlantListItem>>(path, undefined, { conditional: true })
      : ApiUtils.get<ApiPage<APIPlantListItem>>(path);
    const page = await handleRequest(request, RESOURCE_KEY);
    if ((page as Partial<PageNotModified>).notModified === true) return { notModified: true };
    return mapPage(page as ApiPage<APIPlantListItem>, PlantMapper.mapListItem);
  };

const accessOf = (target: PagedState<PlantView>): ListAccess<PlantView> => ({
  get: () => target.items,
  set: (next) => {
    target.items = commitList(next);
  },
});

const replacing =
  (plant: PlantView): ListEdit =>
  (list) =>
    idIndexOf(list).has(plant.id) ? upsertItem(list, plant) : null;

const removing =
  (id: number): ListEdit =>
  (list) =>
    idIndexOf(list).has(id) ? removeItem(list, id) : null;

const applying =
  (summaries: ReadonlyMap<number, WateringSummary | null>): ListEdit =>
  (list) => {
    const raw = toRaw(list) as readonly PlantView[];
    const index = idIndexOf(raw);
    let next: PlantView[] | null = null;
    for (const [id, summary] of summaries) {
      const item = index.get(id);
      if (!item) continue;
      next ??= raw.slice();
      next[raw.indexOf(item)] = PlantMapper.withWatering(item, summary);
    }
    return next;
  };

const editPublic = (lists: PlantLists, edit: ListEdit): void => {
  const target = lists.public;
  const before = target.items;
  const next = edit(before);
  if (next) target.items = commitList(next);
  const first = target.firstPage;
  if (!first) return;
  const sharesItems = first.items === before;
  const firstNext = sharesItems ? next : edit(first.items);
  if (!firstNext) return;
  target.firstPage = Object.freeze({
    ...first,
    items: sharesItems ? target.items : commitList(firstNext),
  });
};

const editDetails = (lists: PlantLists, edit: ListEdit): void => {
  const next = edit(lists.details);
  if (next) lists.details = commitList(next);
};

const editEverywhere = (lists: PlantLists, edit: ListEdit): void => {
  const next = edit(lists.mine.items);
  if (next) lists.mine.items = commitList(next);
  editPublic(lists, edit);
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
  const next = upsertItem(lists.details, plant);
  lists.details = commitList(next.length > DETAILS_LIMIT ? next.slice(-DETAILS_LIMIT) : next);
};

/** Keeps `public` honest after an edit: a plant made private leaves it, a newly public one asks for a refresh. */
const syncPublicMembership = (lists: PlantLists, plant: PlantView): void => {
  if (!plant.isPublic) {
    editPublic(lists, removing(plant.id));
  } else if (!idIndexOf(lists.public.items).has(plant.id)) {
    lists.public.fetchedAt = 0;
  }
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
        ],
      }),
      pagedPersistEntry(PUBLIC_KEY, (state) => state.public as PagedState<PlantView>, "firstPage"),
    ],
  },

  getters: {
    personalPlants: (state): PlantView[] => state.mine.items,
    publicPlants: (state): PlantView[] => state.public.items,
    isMineStale: (state): boolean => isStale(state.mine.fetchedAt),
    isPublicStale: (state): boolean => isStale(state.public.fetchedAt),
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
      if (!force && this.mine.status === "ready" && !this.isMineStale) return Promise.resolve();
      return coalesced(this, MINE_KEY, async (isCurrent) => {
        if (
          !force &&
          this.mine.status === "idle" &&
          (await this.$hydrate([MINE_KEY])) &&
          !this.isMineStale
        ) {
          return;
        }
        if (!isCurrent()) return;
        await loadAll(this.mine, fetchScope("mine"), { isCurrent });
      });
    },

    /** Same contract as `ensureMine`, for the first page of the public plants (default query). */
    ensurePublic({ force = false }: { force?: boolean } = {}): Promise<void> {
      if (!force && this.public.status === "ready" && !this.isPublicStale) return Promise.resolve();
      return coalesced(this, PUBLIC_KEY, async (isCurrent) => {
        if (
          !force &&
          this.public.status === "idle" &&
          (await this.$hydrate([PUBLIC_KEY])) &&
          !this.isPublicStale
        ) {
          return;
        }
        if (!isCurrent()) return;
        await loadFirst(this.public, fetchScope("public"), { isCurrent });
      });
    },

    /** Alias of `ensureMine` for callers that only need the owner's plants. */
    ensureLoaded(options: { force?: boolean } = {}): Promise<void> {
      return this.ensureMine(options);
    },

    /** Server search over the public plants; resets paging. The same query is a no-op. */
    setPublicQuery(q: string): Promise<void> {
      return setQuery(this.public, { q }, fetchScope("public"), { isCurrent: sessionGuard() });
    },

    loadMorePublic(): Promise<void> {
      return loadMore(this.public, fetchScope("public"), { isCurrent: sessionGuard() });
    },

    /** Fetches one plant with its images (GET /plants/:id) and merges it into the lists. */
    async fetchOne(id: number): Promise<PlantView> {
      const isCurrent = sessionGuard();
      const response = await handleRequest(
        ApiUtils.get<APIPlantDetail>(`${BASE_ENDPOINT}/${id}?tz_offset=${tzOffset()}`),
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
      if (cached?.images && !force) return cached;
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

    /** Best-effort substrate name for an optimistic card; empty when it cannot be loaded. */
    async substrateName(substrateId: number): Promise<string> {
      const substrates = useSubstratesStore();
      await substrates.ensureLoaded().catch(() => undefined);
      return substrates.byId(substrateId)?.name ?? "";
    },

    /** Creates a plant (optimistic); resolves with the plant carrying the real id. */
    async addPlant(plantToAdd: AddPlant): Promise<PlantView> {
      // `image` is handled by uploadPlantImage after creation, never sent here.
      const { image: _image, substrateId, ...rest } = plantToAdd;
      const body = substrateId === null ? rest : { ...rest, substrateId };

      const substrate =
        substrateId === null
          ? null
          : Object.freeze({ id: substrateId, name: await this.substrateName(substrateId) });
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
        accessOf(this.mine),
        optimistic,
        async () =>
          PlantMapper.mapDetail(
            await handleRequest(
              ApiUtils.post<typeof body & { tz_offset: number }, APIPlantDetail>(BASE_ENDPOINT, {
                ...body,
                tz_offset: tzOffset(),
              }),
              RESOURCE_KEY,
              "error.action_failed",
            ),
          ),
        (plant) => plant,
      );
      syncPublicMembership(this, created);
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
        substrate = Object.freeze({ id: substrateId, name: await this.substrateName(substrateId) });
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
        accessOf(this.mine),
        optimistic,
        async () =>
          PlantMapper.mapDetail(
            await handleRequest(
              ApiUtils.patch<EditPlant & { tz_offset: number }, APIPlantDetail>(
                `${BASE_ENDPOINT}/${plantId}`,
                { ...updatedPlantData, tz_offset: tzOffset() },
              ),
              RESOURCE_KEY,
              "error.action_failed",
            ),
          ),
        (plant) => plant,
      );
      editPublic(this, replacing(updated));
      editDetails(this, replacing(updated));
      syncPublicMembership(this, updated);
      return updated;
    },

    /**
     * Deletes a plant (optimistic); it returns to its position if the request
     * fails. It leaves the other lists and its watering records are dropped
     * once the server confirmed.
     */
    async deletePlant(plantId: number): Promise<void> {
      await optimisticRemove(accessOf(this.mine), plantId, () =>
        handleRequest(
          ApiUtils.delete<void>(`${BASE_ENDPOINT}/${plantId}`),
          RESOURCE_KEY,
          "error.action_failed",
        ),
      );
      editPublic(this, removing(plantId));
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
