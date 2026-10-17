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
import { coalesced, epoch, isStale } from "./resource";
import { commitList, idIndexOf, removeItem, upsertItem } from "./optimistic";
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
  type PageParams,
  type PagedState,
} from "./paged";

const BASE_ENDPOINT = "/substrates";
const RESOURCE_KEY = "substrate.title";
const MINE_KEY = "substrates_mine";
const PUBLIC_KEY = "substrates_public";
const USED_IN_PAGE_SIZE = 100;
const USED_IN_MAX_PAGES = 10;

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

interface SubstrateLists {
  mine: PagedState<SubstrateView>;
  public: PagedState<SubstrateView>;
}

type ListEdit = (list: readonly SubstrateView[]) => SubstrateView[] | null;

const sessionGuard = (): (() => boolean) => {
  const started = epoch.current();
  return () => !epoch.isStale(started);
};

const fetchScope =
  (scope: Scope): FetchPage<SubstrateView> =>
  async (params) => {
    const path = `${BASE_ENDPOINT}?${pageSearchParams(params, { scope })}`;
    const request = params.conditional
      ? ApiUtils.get<ApiPage<APISubstrateListItem>>(path, undefined, { conditional: true })
      : ApiUtils.get<ApiPage<APISubstrateListItem>>(path);
    const page = await handleRequest(request, RESOURCE_KEY);
    if ((page as Partial<PageNotModified>).notModified === true) return { notModified: true };
    return mapPage(page as ApiPage<APISubstrateListItem>, SubstrateMapper.mapListItem);
  };

/** One scope of the substrates visible to the viewer that contain a component, all pages. */
const fetchUsedInScope = async (componentId: number, scope: Scope): Promise<UsedInSubstrate[]> => {
  const found: UsedInSubstrate[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < USED_IN_MAX_PAGES; page += 1) {
    const params: PageParams = {
      limit: USED_IN_PAGE_SIZE,
      cursor,
      q: "",
      sort: "name",
      conditional: false,
    };
    const response: ApiPage<APISubstrateListItem> = await handleRequest(
      ApiUtils.get<ApiPage<APISubstrateListItem>>(
        `${BASE_ENDPOINT}?${pageSearchParams(params, { scope, component_id: componentId })}`,
      ),
      RESOURCE_KEY,
    );
    for (const item of response.items) {
      found.push({ id: item.id, name: item.name, isPublic: item.is_public });
    }
    cursor = response.next_cursor;
    if (cursor === null) break;
  }
  return found;
};

/** The list entry of a detail: the same view without its mix and images. */
const lightOf = (detail: SubstrateView): SubstrateView => {
  const { images: _images, ...entry } = detail;
  return Object.freeze({ ...entry, components: null });
};

const replacing =
  (substrate: SubstrateView): ListEdit =>
  (list) =>
    idIndexOf(list).has(substrate.id) ? upsertItem(list, substrate) : null;

const removing =
  (id: number): ListEdit =>
  (list) =>
    idIndexOf(list).has(id) ? removeItem(list, id) : null;

const editPublic = (lists: SubstrateLists, edit: ListEdit): void => {
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

const editMine = (lists: SubstrateLists, edit: ListEdit): void => {
  const next = edit(lists.mine.items);
  if (next) lists.mine.items = commitList(next);
};

/** A substrate made private leaves `public`; a newly public one asks for a refresh. */
const syncPublicMembership = (lists: SubstrateLists, substrate: SubstrateView): void => {
  if (!substrate.isPublic) {
    editPublic(lists, removing(substrate.id));
  } else if (!idIndexOf(lists.public.items).has(substrate.id)) {
    lists.public.fetchedAt = 0;
  }
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
    personalSubstrates: (state): SubstrateView[] => state.mine.items,
    publicSubstrates: (state): SubstrateView[] => state.public.items,
    isMineStale: (state): boolean => isStale(state.mine.fetchedAt),
    isPublicStale: (state): boolean => isStale(state.public.fetchedAt),
    isStale(): boolean {
      return this.isMineStale;
    },
    /** Own substrates first, then the loaded public ones not already listed (the plant forms' picker). */
    items(state): SubstrateView[] {
      const seen = idIndexOf(state.mine.items);
      return [...state.mine.items, ...state.public.items.filter((s) => !seen.has(s.id))];
    },
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
      if (!force && this.mine.status === "ready" && !this.isMineStale) return Promise.resolve();
      return coalesced(this, MINE_KEY, async (isCurrent) => {
        if (
          !force &&
          this.mine.status === "idle" &&
          this.mine.fetchedAt === null &&
          (await this.$hydrate([MINE_KEY])) &&
          !this.isMineStale
        ) {
          return;
        }
        if (!isCurrent()) return;
        await loadAll(this.mine, fetchScope("mine"), { isCurrent });
      });
    },

    /** Same contract as `ensureMine`, for the first page of the public substrates (default query). */
    ensurePublic({ force = false }: { force?: boolean } = {}): Promise<void> {
      if (!force && this.public.status === "ready" && !this.isPublicStale) return Promise.resolve();
      return coalesced(this, PUBLIC_KEY, async (isCurrent) => {
        if (
          !force &&
          this.public.status === "idle" &&
          this.public.fetchedAt === null &&
          (await this.$hydrate([PUBLIC_KEY])) &&
          !this.isPublicStale
        ) {
          return;
        }
        if (!isCurrent()) return;
        await loadFirst(this.public, fetchScope("public"), { isCurrent });
      });
    },

    /** Alias of `ensureMine` for callers that only need the owner's substrates. */
    ensureLoaded(options: { force?: boolean } = {}): Promise<void> {
      return this.ensureMine(options);
    },

    /** Server search over the public substrates; resets paging. The same query is a no-op. */
    setPublicQuery(q: string): Promise<void> {
      return setQuery(this.public, { q }, fetchScope("public"), { isCurrent: sessionGuard() });
    },

    loadMorePublic(): Promise<void> {
      return loadMore(this.public, fetchScope("public"), { isCurrent: sessionGuard() });
    },

    /**
     * Marks everything held stale so the next ensure refetches. The persisted
     * snapshots are rewritten as expired (and a not yet hydrated one is not
     * read), so a cached list cannot come back as fresh. A load already in
     * flight is not cancelled: paged.ts keeps its request sequence private, and
     * bumping it from here would strand the list in "loading" behind the shared
     * coalesced promise.
     */
    invalidate(): void {
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
      const isCurrent = sessionGuard();
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
      editMine(this, replacing(light));
      editPublic(this, replacing(light));
      this.details = withDetail(this.details, substrate);
    },

    /** Substrates of the viewer (own and public, deduplicated, name order) that contain a component. */
    async loadUsedByComponent(componentId: number): Promise<void> {
      const isCurrent = sessionGuard();
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
      const isCurrent = sessionGuard();
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
      const isCurrent = sessionGuard();
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
        this.mine.items = commitList(upsertItem(this.mine.items, light));
      } else {
        editMine(this, replacing(light));
      }
      editPublic(this, replacing(light));
      this.details = withDetail(this.details, substrate);
      syncPublicMembership(this, light);
      usePlantsStore().patchSubstrate(substrate.id, substrate.name);
    },

    async deleteSubstrate(substrateId: number): Promise<void> {
      const isCurrent = sessionGuard();
      await handleRequest(
        ApiUtils.delete(`${BASE_ENDPOINT}/${substrateId}`),
        RESOURCE_KEY,
        "error.action_failed",
      );
      if (!isCurrent()) return;
      editMine(this, removing(substrateId));
      editPublic(this, removing(substrateId));
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
