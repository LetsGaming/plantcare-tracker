/**
 * stores/scopedLists.ts
 *
 * The lifecycle shared by stores that hold an owned list (`mine`, loaded
 * completely) and a public list (paged on the server): the page fetcher, the
 * ensure flow (memory, then storage, then the API), and the edits that keep the
 * public list and its persisted first page consistent.
 */

import ApiUtils from "@/utils/apiUtils";
import { handleRequest } from "@/utils/requestFeedback";
import { commitList, idIndexOf, removeItem, upsertItem, type ListAccess } from "./optimistic";
import { commitTracked, journaled, replaying, type Journal, type ListEdit } from "./journal";
import {
  isNotModified,
  mapPage,
  pageSearchParams,
  type ApiPage,
  type FetchPage,
  type PagedState,
} from "./paged";
import { coalesced, epoch, isStale, type ResourceStatus } from "./resource";

type Item = { id: number } & object;

export interface PagedFetcherConfig<D, T extends object> {
  endpoint: string;
  resourceKey: string;
  map: (raw: D) => T;
  /** Extra query parameters, evaluated per request. */
  extra?: () => Record<string, string | number>;
  /** Adjusts the mapped items of a page, for example to carry details already held. */
  finish?: (items: T[]) => T[];
}

/** A page fetcher for a keyset-paged list endpoint; conditional requests resolve `notModified`. */
export const pagedFetcher =
  <D, T extends object>(config: PagedFetcherConfig<D, T>): FetchPage<T> =>
  async (params) => {
    const path = `${config.endpoint}?${pageSearchParams(params, config.extra?.())}`;
    const request = params.conditional
      ? ApiUtils.get<ApiPage<D>>(path, undefined, { conditional: true })
      : ApiUtils.get<ApiPage<D>>(path);
    const page = await handleRequest(request, config.resourceKey);
    if (isNotModified(page)) return page;
    const mapped = mapPage(page, config.map);
    return config.finish ? { ...mapped, items: config.finish(mapped.items) } : mapped;
  };

/** Created per action: once the session ends, a late rollback must not write the old account's item back. */
export const trackedAccess = <T extends Item>(target: PagedState<T>): ListAccess<T> => {
  const isCurrent = epoch.guard();
  return {
    get: () => target.items,
    set: (next) => {
      if (isCurrent()) commitTracked(target, next);
    },
  };
};

export const replacing =
  <T extends Item>(item: T): ListEdit<T> =>
  (list) =>
    idIndexOf(list).has(item.id) ? upsertItem(list, item) : null;

export const removing =
  <T extends Item>(id: number): ListEdit<T> =>
  (list) =>
    idIndexOf(list).has(id) ? removeItem(list, id) : null;

/** Applies an edit to a paged list and to its persisted first page, which shares the items array when it can. */
export const editPublic = <T extends Item>(target: PagedState<T>, edit: ListEdit<T>): void => {
  const before = target.items;
  const next = edit(before);
  if (next) commitTracked(target, next);
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

export const editMine = <T extends Item>(target: PagedState<T>, edit: ListEdit<T>): void => {
  const next = edit(target.items);
  if (next) commitTracked(target, next);
};

/** Drops an item from the public list and its persisted first page, keeping both totals honest. */
export const leavePublic = <T extends Item>(target: PagedState<T>, id: number): void => {
  const inList = idIndexOf(target.items).has(id);
  const first = target.firstPage;
  const inFirst = first !== null && idIndexOf(first.items).has(id);
  editPublic(target, removing<T>(id));
  if (inList && target.total !== null) target.total = Math.max(0, target.total - 1);
  const after = target.firstPage;
  if (inFirst && after && after.total !== null) {
    target.firstPage = Object.freeze({ ...after, total: Math.max(0, after.total - 1) });
  }
};

/** Keeps `public` honest after an edit: an item made private leaves it, a newly public one asks for a refresh. */
export const syncPublicMembership = <T extends Item & { isPublic: boolean }>(
  target: PagedState<T>,
  item: T,
): void => {
  if (!item.isPublic) {
    leavePublic(target, item.id);
  } else if (!idIndexOf(target.items).has(item.id)) {
    target.fetchedAt = 0;
  }
};

/** Replays edits made during a wholesale load of an owned list, appending items added meanwhile. */
export const replayOwned =
  <T extends Item>(target: PagedState<T>) =>
  (journal: Journal<T>): void =>
    editMine(target, replaying(journal, true));

/** Replays edits made during a load of a public list; items added meanwhile are not appended. */
export const replayPublic =
  <T extends Item>(target: PagedState<T>) =>
  (journal: Journal<T>): void =>
    editPublic(target, replaying(journal, false));

const MAX_LOAD_ATTEMPTS = 2;

export interface EnsureListConfig<T extends Item> {
  owner: object;
  key: string;
  target: PagedState<T>;
  force: boolean;
  /** Restores the persisted snapshot; resolves true when one was applied. */
  hydrate: () => Promise<boolean>;
  load: (isCurrent: () => boolean) => Promise<void>;
  replay: (journal: Journal<T>) => void;
}

const isFresh = (target: { status: ResourceStatus; fetchedAt: number | null }): boolean =>
  target.status === "ready" && !isStale(target.fetchedAt);

/**
 * Makes sure a list is loaded: from memory when fresh, otherwise from storage,
 * otherwise from the API. Concurrent callers share one load. A load that was
 * dropped because the list was invalidated meanwhile runs once more.
 */
export const ensureList = <T extends Item>(config: EnsureListConfig<T>): Promise<void> => {
  const { owner, key, target, force } = config;
  if (!force && isFresh(target)) return Promise.resolve();
  return coalesced(owner, key, async (isCurrent) => {
    if (
      !force &&
      target.status === "idle" &&
      target.fetchedAt === null &&
      (await config.hydrate()) &&
      !isStale(target.fetchedAt)
    ) {
      return;
    }
    for (let attempt = 0; attempt < MAX_LOAD_ATTEMPTS; attempt += 1) {
      if (!isCurrent()) return;
      await journaled(target, isCurrent, () => config.load(isCurrent), config.replay);
      if (!isStale(target.fetchedAt) || target.status === "loading") return;
    }
  });
};
