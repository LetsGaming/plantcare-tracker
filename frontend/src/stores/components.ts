/**
 * stores/components.ts
 *
 * The global component catalogue (perlite, coco coir, ...) and the fineness
 * levels. Everyone reads it; mutations are admin only.
 *
 * The catalogue is small and searched on the client, so it is loaded whole
 * with `loadAll` (name order, 100 per request). The flat state is a
 * `PagedState` (`items`, `status`, `fetchedAt`, ...). List items carry no
 * images; `getComponent` fetches the detail (with images) by id and keeps it
 * in `details`, independent of the catalogue. `items` keeps server order only
 * right after a load; `upsert` appends, so sort where order matters.
 *
 * ## V2 API endpoints used
 *
 * | Method | Path                         | Purpose                |
 * |--------|------------------------------|------------------------|
 * | GET    | /components                  | Catalogue pages        |
 * | GET    | /components/:id              | One component (detail) |
 * | GET    | /components/fineness-levels  | Fineness levels        |
 * | POST   | /components                  | Create (admin)         |
 * | PUT    | /components/:id              | Update (admin)         |
 * | DELETE | /components/:id              | Delete (admin)         |
 * | GET    | /substrates?component_id=    | Substrates using one   |
 */

import { defineStore } from "pinia";
import { markRaw } from "vue";
import ApiUtils from "@/utils/apiUtils";
import ComponentMapper from "@/mapping/ComponentMapping";
import ImageService from "@/services/ImageService";
import localizationService from "@/services/general/LocalizationService";
import { compareText } from "@/utils/intlCache";
import { finenessLabel } from "@/utils/enumLabels";
import { handleRequest } from "@/utils/requestFeedback";
import { coalesced, epoch, isStale } from "./resource";
import { commitList, idIndexOf, removeItem, upsertItem } from "./optimistic";
import { useSubstratesStore } from "./substrates";
import {
  loadAll,
  mapPage,
  pagedPersistEntry,
  pagedState,
  pageSearchParams,
  type ApiPage,
  type FetchPage,
  type PageParams,
} from "./paged";

const ENDPOINT = "/components";
const RESOURCE_NAME = "components.title";

/** One catalogue entry as the substrate picker needs it: label resolved, search text ready. */
export interface SelectableComponent {
  readonly id: number;
  readonly name: string;
  /** Localized fineness label. */
  readonly fineness: string;
  /** Lowercase name and fineness label for client search. */
  readonly searchText: string;
}

/** A substrate that uses a component, as the "Used in" list shows it. */
export interface UsedInSubstrate {
  readonly id: number;
  readonly name: string;
  readonly isPublic: boolean;
}

const USED_IN_PAGE_SIZE = 100;
const USED_IN_MAX_PAGES = 10;

/** One scope of the substrates visible to the viewer that contain a component, all pages. */
const fetchUsedInScope = async (
  componentId: number,
  scope: "mine" | "public",
): Promise<UsedInSubstrate[]> => {
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
        `/substrates?${pageSearchParams(params, { scope, component_id: componentId })}`,
      ),
      RESOURCE_NAME,
    );
    for (const item of response.items) {
      found.push({ id: item.id, name: item.name, isPublic: item.is_public });
    }
    cursor = response.next_cursor;
    if (cursor === null) break;
  }
  return found;
};

const fetchCatalogue: FetchPage<ComponentView> = async (params) => {
  const page = await handleRequest(
    ApiUtils.get<ApiPage<APIComponentListItem>>(`${ENDPOINT}?${pageSearchParams(params)}`),
    RESOURCE_NAME,
  );
  return mapPage(page, ComponentMapper.mapListItem);
};

/** The catalogue entry of a detail: the same view without its images. */
const catalogueEntry = (detail: ComponentView): ComponentView => {
  const { images: _images, ...entry } = detail;
  return Object.freeze(entry);
};

const withDetail = (
  details: Readonly<Record<number, ComponentView>>,
  detail: ComponentView,
): Readonly<Record<number, ComponentView>> =>
  Object.freeze(markRaw({ ...details, [detail.id]: detail }));

export const useComponentsStore = defineStore("components", {
  state: () => ({
    ...pagedState<ComponentView>("name"),
    /** Details fetched by id (with images), kept apart from the catalogue. */
    details: markRaw({}) as Readonly<Record<number, ComponentView>>,
    /** Substrates using a component, by component id, name order. */
    usedIn: markRaw({}) as Readonly<Record<number, readonly UsedInSubstrate[]>>,
    finenessLevels: [] as APIFinenessLevel[],
    finenessFetchedAt: null as number | null,
  }),

  persist: {
    entries: [
      pagedPersistEntry("components_catalogue", (state) => state, "all", {
        dirtyOn: ["ensureLoaded", "upsert", "deleteComponent"],
      }),
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
    /** The detail when fetched (it has images), else the catalogue entry. */
    byId:
      (state) =>
      (id: number): ComponentView | undefined =>
        state.details[id] ?? idIndexOf(state.items).get(id),
    /** Catalogue in name order with fineness labels resolved; recomputed only when the catalogue or locale changes. */
    selectableComponents: (state): readonly SelectableComponent[] => {
      const compare = compareText(localizationService.getLocale());
      const rows = state.items.map((component): SelectableComponent => {
        const fineness = finenessLabel(component.fineness);
        return Object.freeze({
          id: component.id,
          name: component.name,
          fineness,
          searchText: ComponentMapper.searchTextOf(component.name, fineness),
        });
      });
      rows.sort((a, b) => compare(a.name, b.name) || a.id - b.id);
      return Object.freeze(rows);
    },
  },

  actions: {
    /** Loads the catalogue unless it is in memory and fresh; concurrent callers share one load. */
    ensureLoaded({ force = false }: { force?: boolean } = {}): Promise<void> {
      if (!force && this.status === "ready" && !this.isStale) return Promise.resolve();
      return coalesced(this, "all", async (isCurrent) => {
        if (!force && this.status === "idle" && (await this.$hydrate()) && !this.isStale) return;
        await loadAll(this, fetchCatalogue, { isCurrent });
      });
    },

    upsert(component: ComponentView): void {
      this.items = commitList(upsertItem(this.items, component));
    },

    /** Returns the component detail by id; GET /components/:id only, never the catalogue. */
    async getComponent(id: number, force = false): Promise<ComponentView> {
      const cached = this.details[id];
      if (cached && !force) return cached;

      const started = epoch.current();
      const response = await handleRequest(
        ApiUtils.get<APIComponentDetail>(`${ENDPOINT}/${id}`),
        RESOURCE_NAME,
      );
      const component = ComponentMapper.mapDetail(response);
      if (!epoch.isStale(started)) {
        this.details = withDetail(this.details, component);
        if (idIndexOf(this.items).has(id)) this.upsert(catalogueEntry(component));
      }
      return component;
    },

    /** Loads the substrates visible to the viewer that use a component (own and public, deduplicated). */
    async loadUsedIn(id: number): Promise<void> {
      const started = epoch.current();
      const [mine, shared] = await Promise.all([
        fetchUsedInScope(id, "mine"),
        fetchUsedInScope(id, "public"),
      ]);
      if (epoch.isStale(started)) return;
      const byId = new Map<number, UsedInSubstrate>();
      for (const substrate of [...mine, ...shared])
        byId.set(substrate.id, Object.freeze(substrate));
      const compare = compareText(localizationService.getLocale());
      const sorted = [...byId.values()].sort((a, b) => compare(a.name, b.name) || a.id - b.id);
      this.usedIn = Object.freeze(markRaw({ ...this.usedIn, [id]: Object.freeze(sorted) }));
    },

    /** Fineness levels change only with the backend schema, so they load once. */
    async ensureFinenessLevels(): Promise<void> {
      if (this.finenessLevels.length > 0 && !isStale(this.finenessFetchedAt)) return;
      await coalesced(this, "fineness", async (isCurrent) => {
        if (this.finenessLevels.length === 0 && (await this.$hydrate())) {
          if (this.finenessLevels.length > 0 && !isStale(this.finenessFetchedAt)) return;
        }
        const levels = await handleRequest(
          ApiUtils.get<APIFinenessLevel[]>(`${ENDPOINT}/fineness-levels`),
          RESOURCE_NAME,
        );
        if (!isCurrent()) return;
        this.finenessLevels = levels;
        this.finenessFetchedAt = Date.now();
      });
    },

    /** Creates a component (admin only); resolves with the new component. */
    async addComponent(data: AddComponent): Promise<ComponentView> {
      const response = await handleRequest(
        ApiUtils.post<{ name: string; fineness: number }, APIComponentDetail>(ENDPOINT, {
          name: data.name,
          fineness: data.finenessId,
        }),
        RESOURCE_NAME,
        "error.action_failed",
      );
      const component = ComponentMapper.mapDetail(response);
      this.upsert(catalogueEntry(component));
      this.details = withDetail(this.details, component);
      return component;
    },

    /** Updates a component (admin only); substrates embed its name, so their list is invalidated. */
    async editComponent(id: number, data: EditComponent): Promise<ComponentView> {
      const response = await handleRequest(
        ApiUtils.put<EditComponent, APIComponentDetail>(`${ENDPOINT}/${id}`, data),
        RESOURCE_NAME,
        "error.action_failed",
      );
      const component = ComponentMapper.mapDetail(response);
      this.upsert(catalogueEntry(component));
      this.details = withDetail(this.details, component);
      useSubstratesStore().invalidate();
      return component;
    },

    /** Deletes a component (admin only); the server removes it from every substrate, so their list is invalidated. */
    async deleteComponent(id: number): Promise<void> {
      await handleRequest(
        ApiUtils.delete(`${ENDPOINT}/${id}`),
        RESOURCE_NAME,
        "error.action_failed",
      );
      this.items = commitList(removeItem(this.items, id));
      const { [id]: _removed, ...rest } = this.details;
      this.details = Object.freeze(markRaw(rest));
      const { [id]: _unused, ...usedInRest } = this.usedIn;
      this.usedIn = Object.freeze(markRaw(usedInRest));
      useSubstratesStore().invalidate();
    },

    /** Uploads an image (admin only), then refreshes just this component. */
    async uploadComponentImage(id: number, image: File): Promise<unknown> {
      const response = await ImageService.uploadImage(image, "component", id);
      await this.getComponent(id, true);
      return response;
    },
  },
});
