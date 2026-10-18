/**
 * stores/substrates.ts
 *
 * Substrates on the paged summary contract. `mine` holds the signed-in user's
 * own substrates (loaded completely, searched on the client). `public` holds
 * the public substrates of everyone (paged and searched on the server).
 * `details` holds substrates fetched by id (with their mix and images), apart
 * from the lists, which only carry light summaries. Items are frozen view
 * models in raw arrays replaced copy-on-write.
 *
 * ## V2 API endpoints used
 *
 * | Method | Path                                           | Purpose                          |
 * |--------|------------------------------------------------|----------------------------------|
 * | GET    | /substrates?scope=mine&limit=100&sort=name     | Own substrates (summaries)       |
 * | GET    | /substrates?scope=public&limit&cursor&q&sort   | One page of public substrates    |
 * | GET    | /substrates?scope&component_id=                | Substrates using one component   |
 * | GET    | /substrates/:id                                | One substrate with mix, images   |
 * | POST   | /substrates                                    | Create, mix included             |
 * | PATCH  | /substrates/:id                                | Update, full mix replaces        |
 * | DELETE | /substrates/:id                                | Delete a substrate               |
 *
 * Mutations are pessimistic: the server answers with the full substrate.
 */

import { defineStore } from "pinia";
import { markRaw } from "vue";
import ApiUtils from "@/utils/apiUtils";
import SubstrateMapper from "@/mapping/SubstrateMapping";
import ImageService from "@/services/ImageService";
import localizationService from "@/services/general/LocalizationService";
import { compareText } from "@/utils/intlCache";
import { handleRequest } from "@/utils/requestFeedback";
import { useSessionStore } from "./session";
import { usePlantsStore } from "./plants";
import { epoch, isStale } from "./resource";
import { commitList, idIndexOf, upsertItem } from "./optimistic";
import { commitTracked, journaled } from "./journal";
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
} from "./scopedLists";
import {
  collectPages,
  loadAll,
  loadFirst,
  invalidateInFlight,
  loadMore,
  pageSearchParams,
  pagedPersistEntry,
  pagedState,
  setQuery,
  type ApiPage,
  type FetchPage,
  type PageParams,
  type PagedState,
} from "./paged";

const BASE_ENDPOINT = "/substrates";
const RESOURCE_KEY = "substrate.title";
const MINE_KEY = "substrates_mine";
const PUBLIC_KEY = "substrates_public";
const USED_IN_PAGE_SIZE = 100;

type Scope = "mine" | "public";

/** A substrate that uses a component, as the "Used in" list shows it. */
export interface UsedInSubstrate {
  readonly id: number;
  readonly name: string;
  readonly isPublic: boolean;
}

/** Body of POST and PATCH; `components` is the complete mix and replaces the stored one. */
export interface SubstrateWrite {
  name?: string;
  isPublic?: boolean;
  components?: BaseSubstrateComponent[];
}

const fetchScope = (scope: Scope): FetchPage<SubstrateView> =>
  pagedFetcher<APISubstrateListItem, SubstrateView>({
    endpoint: BASE_ENDPOINT,
    resourceKey: RESOURCE_KEY,
    map: SubstrateMapper.mapListItem,
    extra: () => ({ scope }),
  });

/** One scope of the substrates visible to the viewer that contain a component, all pages. */
const fetchUsedInScope = async (componentId: number, scope: Scope): Promise<UsedInSubstrate[]> => {
  const collected = await collectPages<APISubstrateListItem, ApiPage<APISubstrateListItem>>(
    (cursor) => {
      const params: PageParams = {
        limit: USED_IN_PAGE_SIZE,
        cursor,
        q: "",
        sort: "name",
        conditional: false,
      };
      return handleRequest(
        ApiUtils.get<ApiPage<APISubstrateListItem>>(
          `${BASE_ENDPOINT}?${pageSearchParams(params, { scope, component_id: componentId })}`,
        ),
        RESOURCE_KEY,
      );
    },
  );
  return (collected?.items ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    isPublic: item.is_public,
  }));
};

/** The list entry of a detail: the same view without its mix and images. */
const lightOf = (detail: SubstrateView): SubstrateView => {
  const { images: _images, ...entry } = detail;
  return Object.freeze({ ...entry, components: null });
};

const detailFetchedAt = new WeakMap<SubstrateView, number>();

const withDetail = (
  details: Readonly<Record<number, SubstrateView>>,
  detail: SubstrateView,
): Readonly<Record<number, SubstrateView>> => {
  detailFetchedAt.set(detail, Date.now());
  return Object.freeze(markRaw({ ...details, [detail.id]: detail }));
};

const withoutKey = <T>(
  record: Readonly<Record<number, T>>,
  id: number,
): Readonly<Record<number, T>> => {
  const { [id]: _removed, ...rest } = record;
  return Object.freeze(markRaw(rest));
};

export const useSubstratesStore = defineStore("substrates", {
  state: () => ({
    mine: pagedState<SubstrateView>("name"),
    public: pagedState<SubstrateView>("name"),
    /** Substrates fetched by id (mix and images), kept apart from the light list items. */
    details: markRaw({}) as Readonly<Record<number, SubstrateView>>,
    /** Substrates using a component, by component id, name order. */
    usedByComponent: markRaw({}) as Readonly<Record<number, readonly UsedInSubstrate[]>>,
  }),

  persist: {
    entries: [
      pagedPersistEntry(MINE_KEY, (state) => state.mine as PagedState<SubstrateView>, "all", {
        dirtyOn: [
          "ensureMine",
          "fetchOne",
          "addSubstrate",
          "editSubstrate",
          "deleteSubstrate",
          "invalidate",
        ],
      }),
      pagedPersistEntry(
        PUBLIC_KEY,
        (state) => state.public as PagedState<SubstrateView>,
        "firstPage",
      ),
    ],
  },

  getters: {
    byId:
      (state) =>
      (id: number): SubstrateView | undefined =>
        idIndexOf(state.mine.items).get(id) ??
        idIndexOf(state.public.items).get(id) ??
        state.details[id],
    /** The substrate with its mix and images, once fetched by id. */
    detailOf:
      (state) =>
      (id: number): SubstrateView | undefined =>
        state.details[id],
  },

  actions: {
    /**
     * Makes sure the user's own substrates are loaded: from memory when fresh,
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
        load: (isCurrent) => loadAll(this.mine, fetchScope("mine"), { isCurrent }),
        replay: replayOwned(this.mine),
      });
    },

    /** Same contract as `ensureMine`, for the first page of the public substrates (default query). */
    ensurePublic({ force = false }: { force?: boolean } = {}): Promise<void> {
      return ensureList({
        owner: this,
        key: PUBLIC_KEY,
        target: this.public,
        force,
        hydrate: () => this.$hydrate([PUBLIC_KEY]),
        load: (isCurrent) => loadFirst(this.public, fetchScope("public"), { isCurrent }),
        replay: replayPublic(this.public),
      });
    },

    /** Alias of `ensureMine` for callers that only need the owner's substrates. */
    ensureLoaded(options: { force?: boolean } = {}): Promise<void> {
      return this.ensureMine(options);
    },

    /** Server search over the public substrates; resets paging. The same query is a no-op. */
    setPublicQuery(q: string): Promise<void> {
      const isCurrent = epoch.guard();
      return journaled(
        this.public,
        isCurrent,
        () => setQuery(this.public, { q }, fetchScope("public"), { isCurrent }),
        replayPublic(this.public),
      );
    },

    loadMorePublic(): Promise<void> {
      return loadMore(this.public, fetchScope("public"), { isCurrent: epoch.guard() });
    },

    /**
     * Marks everything held stale so the next ensure refetches. The persisted
     * snapshots are rewritten as expired (and a not yet hydrated one is not
     * read), so a cached list cannot come back as fresh. A load already in
     * flight is dropped (and reloaded by its caller), so it cannot commit
     * pre-change data with a fresh timestamp.
     */
    invalidate(): void {
      invalidateInFlight(this.mine);
      invalidateInFlight(this.public);
      this.mine.fetchedAt = 0;
      this.public.fetchedAt = 0;
      if (this.mine.items.length > 0) this.mine.items = commitList(this.mine.items.slice());
      const first = this.public.firstPage;
      if (first) this.public.firstPage = Object.freeze({ ...first, fetchedAt: 0 });
      this.details = Object.freeze(markRaw({}));
      this.usedByComponent = Object.freeze(markRaw({}));
    },

    /** Fetches one substrate with its mix and images (GET /substrates/:id); the catalogue is never loaded. */
    async fetchOne(id: number): Promise<SubstrateView> {
      const isCurrent = epoch.guard();
      const response = await handleRequest(
        ApiUtils.get<APISubstrateDetail>(`${BASE_ENDPOINT}/${id}`),
        RESOURCE_KEY,
      );
      const substrate = SubstrateMapper.mapDetail(response);
      if (isCurrent()) this.commitDetail(substrate);
      return substrate;
    },

    /** Returns the substrate detail from memory, fetching it when unknown, stale or `force` is set. */
    async getSubstrate(id: number, force = false): Promise<SubstrateView> {
      const cached = this.details[id];
      if (cached && !force && !isStale(detailFetchedAt.get(cached) ?? null)) return cached;
      return this.fetchOne(id);
    },

    /** Puts a server-confirmed detail where it belongs: details, and the light entry of every list holding it. */
    commitDetail(substrate: SubstrateView): void {
      const light = lightOf(substrate);
      editMine(this.mine, replacing(light));
      editPublic(this.public, replacing(light));
      this.details = withDetail(this.details, substrate);
    },

    /** Substrates of the viewer (own and public, deduplicated, name order) that contain a component. */
    async loadUsedByComponent(componentId: number): Promise<void> {
      const isCurrent = epoch.guard();
      const guest = useSessionStore().isGuest;
      const [mine, shared] = await Promise.all([
        guest ? Promise.resolve([]) : fetchUsedInScope(componentId, "mine"),
        fetchUsedInScope(componentId, "public"),
      ]);
      if (!isCurrent()) return;
      const unique = new Map<number, UsedInSubstrate>();
      for (const substrate of [...mine, ...shared]) {
        unique.set(substrate.id, Object.freeze(substrate));
      }
      const compare = compareText(localizationService.getLocale());
      const sorted = [...unique.values()].sort((a, b) => compare(a.name, b.name) || a.id - b.id);
      this.usedByComponent = Object.freeze(
        markRaw({ ...this.usedByComponent, [componentId]: Object.freeze(sorted) }),
      );
    },

    /** Creates a substrate with its mix in one request; resolves with the new substrate. */
    async addSubstrate(data: SubstrateWrite): Promise<SubstrateView> {
      const isCurrent = epoch.guard();
      const response = await handleRequest(
        ApiUtils.post<SubstrateWrite, APISubstrateDetail>(BASE_ENDPOINT, data),
        RESOURCE_KEY,
        "error.action_failed",
      );
      const substrate = SubstrateMapper.mapDetail(response);
      if (isCurrent()) this.commitWritten(substrate);
      return substrate;
    },

    /** Updates a substrate in one request; `components`, when given, is the complete new mix. */
    async editSubstrate(substrateId: number, data: SubstrateWrite): Promise<SubstrateView> {
      const isCurrent = epoch.guard();
      const response = await handleRequest(
        ApiUtils.patch<SubstrateWrite, APISubstrateDetail>(`${BASE_ENDPOINT}/${substrateId}`, data),
        RESOURCE_KEY,
        "error.action_failed",
      );
      const substrate = SubstrateMapper.mapDetail(response);
      if (isCurrent()) this.commitWritten(substrate);
      return substrate;
    },

    commitWritten(substrate: SubstrateView): void {
      const light = lightOf(substrate);
      if (substrate.userId === useSessionStore().userId) {
        commitTracked(this.mine, upsertItem(this.mine.items, light));
      } else {
        editMine(this.mine, replacing(light));
      }
      editPublic(this.public, replacing(light));
      this.details = withDetail(this.details, substrate);
      syncPublicMembership(this.public, light);
      usePlantsStore().patchSubstrate(substrate.id, substrate.name);
    },

    async deleteSubstrate(substrateId: number): Promise<void> {
      const isCurrent = epoch.guard();
      await handleRequest(
        ApiUtils.delete(`${BASE_ENDPOINT}/${substrateId}`),
        RESOURCE_KEY,
        "error.action_failed",
      );
      if (!isCurrent()) return;
      editMine(this.mine, removing(substrateId));
      leavePublic(this.public, substrateId);
      this.details = withoutKey(this.details, substrateId);
      usePlantsStore().patchSubstrate(substrateId, null);
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
