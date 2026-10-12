/**
 * stores/paged.ts
 *
 * Keyset-paged list state for Options API stores. A store spreads
 * `pagedState()` into its state (or nests it, e.g. `public: pagedState()`) and
 * calls the helpers from its actions with that state object as the target.
 *
 * Owned data (own plants, own substrates, the component catalogue) is small
 * and searched on the client: load it with `loadAll`. Foreign data (public
 * plants and substrates) is paged on the server: `loadFirst`, `loadMore`, and
 * `setQuery` for search and sort.
 *
 * Persistence: declare one entry with `pagedPersistEntry`. Mode "all" stores
 * the whole list (`version: s => s.items`, the copy-on-write list reference).
 * Mode "firstPage" stores only the first page of the default query
 * (`version: s => s.firstPage`, replaced only when such a page is committed),
 * so searching, sorting or scrolling never rewrites the snapshot.
 *
 *   persist: { entries: [pagedPersistEntry("plants_public", (s) => s.public, "firstPage")] }
 */

import { markRaw } from "vue";
import type { StateTree } from "pinia";
import { commitList } from "./optimistic";
import type { PersistEntry } from "./persistence";
import type { ResourceStatus } from "./resource";

export const PAGE_SIZE = 30;
export const LOAD_ALL_PAGE_SIZE = 100;

export interface PageQuery {
  q: string;
  /** Sort key the endpoint accepts; null leaves the server default. */
  sort: string | null;
}

export interface PageParams extends PageQuery {
  limit: number;
  cursor: string | null;
}

/** One page with its items already mapped to frozen view models. */
export interface FetchedPage<T> {
  items: T[];
  next_cursor: string | null;
  total?: number;
  etag?: string | null;
}

/** The `data` of every list endpoint (`ApiUtils` unwraps `{ data }`). */
export interface ApiPage<D> {
  items: D[];
  next_cursor: string | null;
  total?: number;
}

/** Maps a raw page's items through a mapper, keeping cursor and total. */
export const mapPage = <D, T>(page: ApiPage<D>, map: (item: D) => T): FetchedPage<T> => ({
  items: page.items.map((item) => map(item)),
  next_cursor: page.next_cursor ?? null,
  ...(page.total === undefined ? {} : { total: page.total }),
});

/** Query string for a page request; empty `q` and null `sort` are left out. */
export const pageSearchParams = (
  params: PageParams,
  extra: Record<string, string | number> = {},
): string => {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit));
  if (params.cursor !== null) search.set("cursor", params.cursor);
  if (params.q !== "") search.set("q", params.q);
  if (params.sort !== null) search.set("sort", params.sort);
  for (const [key, value] of Object.entries(extra)) search.set(key, String(value));
  return search.toString();
};

/** A conditional request whose ETag still matched: the data in the state stays. */
export interface PageNotModified {
  notModified: true;
}

export type FetchPage<T> = (params: PageParams) => Promise<FetchedPage<T> | PageNotModified>;

export interface PagedOptions {
  /** False once the session that started the request ended; the result is then dropped. */
  isCurrent?: () => boolean;
}

export interface PersistedPage<T> {
  items: T[];
  nextCursor: string | null;
  total: number | null;
  fetchedAt: number;
}

export interface PagedState<T> {
  /** Frozen items in a raw array, replaced on every change, never edited in place. */
  items: T[];
  nextCursor: string | null;
  /** Count over the whole query, sent with the first page only. */
  total: number | null;
  query: PageQuery;
  defaultSort: string | null;
  status: ResourceStatus;
  loadingMore: boolean;
  fetchedAt: number | null;
  etag: string | null;
  /** Bumped by every first-page load and reset; a response from an older sequence is dropped. */
  requestSeq: number;
  /** The last committed first page of the default query (what "firstPage" persistence writes). */
  firstPage: Readonly<PersistedPage<T>> | null;
}

export const pagedState = <T>(defaultSort: string | null = null): PagedState<T> => ({
  items: markRaw([]) as T[],
  nextCursor: null,
  total: null,
  query: { q: "", sort: defaultSort },
  defaultSort,
  status: "idle",
  loadingMore: false,
  fetchedAt: null,
  etag: null,
  requestSeq: 0,
  firstPage: null,
});

const notModified = <T>(page: FetchedPage<T> | PageNotModified): page is PageNotModified =>
  (page as PageNotModified).notModified === true;

const isCurrent = (options?: PagedOptions): boolean => options?.isCurrent?.() ?? true;

const isDefaultQuery = (target: PagedState<unknown>): boolean =>
  target.query.q === "" && target.query.sort === target.defaultSort;

const sameQuery = (a: PageQuery, b: PageQuery): boolean => a.q === b.q && a.sort === b.sort;

interface Inflight {
  first?: { seq: number; promise: Promise<void> };
  more?: Promise<void>;
  all?: Promise<void>;
}

const inflight = new WeakMap<object, Inflight>();

const inflightOf = (target: object): Inflight => {
  let entry = inflight.get(target);
  if (!entry) inflight.set(target, (entry = {}));
  return entry;
};

const commitFirstPage = <T>(target: PagedState<T>, page: FetchedPage<T>): void => {
  const fetchedAt = Date.now();
  target.items = commitList(page.items.slice());
  target.nextCursor = page.next_cursor;
  target.total = page.total ?? null;
  target.etag = page.etag ?? null;
  target.fetchedAt = fetchedAt;
  target.status = "ready";
  if (isDefaultQuery(target)) {
    target.firstPage = Object.freeze({
      items: target.items,
      nextCursor: target.nextCursor,
      total: target.total,
      fetchedAt,
    });
  }
};

const runFirst = async <T>(
  target: PagedState<T>,
  fetchPage: FetchPage<T>,
  seq: number,
  options?: PagedOptions,
): Promise<void> => {
  const stillCurrent = () => target.requestSeq === seq && isCurrent(options);
  target.status = "loading";
  target.loadingMore = false;
  try {
    const page = await fetchPage({
      limit: PAGE_SIZE,
      cursor: null,
      q: target.query.q,
      sort: target.query.sort,
    });
    if (!stillCurrent()) return;
    if (notModified(page)) {
      target.fetchedAt = Date.now();
      target.status = "ready";
      return;
    }
    commitFirstPage(target, page);
  } catch (error) {
    if (!stillCurrent()) return;
    target.status = target.items.length > 0 ? "ready" : "error";
    throw error;
  }
};

/**
 * Loads the first page of the current query, replacing the list. Every call
 * starts a new request sequence, so a response to an earlier call is dropped.
 */
export const loadFirst = <T>(
  target: PagedState<T>,
  fetchPage: FetchPage<T>,
  options?: PagedOptions,
): Promise<void> => {
  const seq = ++target.requestSeq;
  const promise = runFirst(target, fetchPage, seq, options);
  inflightOf(target).first = { seq, promise };
  return promise;
};

/** Appends the next page; a no-op at the end of the list or while a first page loads. */
export const loadMore = <T>(
  target: PagedState<T>,
  fetchPage: FetchPage<T>,
  options?: PagedOptions,
): Promise<void> => {
  const running = inflightOf(target);
  if (running.more) return running.more;
  const cursor = target.nextCursor;
  if (cursor === null || target.status === "loading") return Promise.resolve();

  const seq = target.requestSeq;
  const stillCurrent = () =>
    target.requestSeq === seq && target.nextCursor === cursor && isCurrent(options);

  target.loadingMore = true;
  const promise = (async () => {
    try {
      const page = await fetchPage({
        limit: PAGE_SIZE,
        cursor,
        q: target.query.q,
        sort: target.query.sort,
      });
      if (!stillCurrent() || notModified(page)) return;
      target.items = commitList([...target.items, ...page.items]);
      target.nextCursor = page.next_cursor;
    } catch (error) {
      if (stillCurrent()) throw error;
    } finally {
      if (target.requestSeq === seq) target.loadingMore = false;
      running.more = undefined;
    }
  })();
  running.more = promise;
  return promise;
};

/**
 * Loads every page (100 per request) and commits the whole list once.
 * Concurrent callers share one run.
 */
export const loadAll = <T>(
  target: PagedState<T>,
  fetchPage: FetchPage<T>,
  options?: PagedOptions,
): Promise<void> => {
  const running = inflightOf(target);
  if (running.all) return running.all;

  const seq = ++target.requestSeq;
  const stillCurrent = () => target.requestSeq === seq && isCurrent(options);

  target.status = "loading";
  const promise = (async () => {
    try {
      const collected: T[] = [];
      let cursor: string | null = null;
      let total: number | null = null;
      let etag: string | null = null;
      do {
        const page = await fetchPage({
          limit: LOAD_ALL_PAGE_SIZE,
          cursor,
          q: "",
          sort: target.defaultSort,
        });
        if (!stillCurrent()) return;
        if (notModified(page)) {
          if (cursor === null) {
            target.fetchedAt = Date.now();
            target.status = "ready";
            return;
          }
          throw new Error("A later page answered 304 Not Modified.");
        }
        if (cursor === null) {
          total = page.total ?? null;
          etag = page.etag ?? null;
        }
        collected.push(...page.items);
        cursor = page.next_cursor;
      } while (cursor !== null);

      target.query = { q: "", sort: target.defaultSort };
      commitFirstPage(target, {
        items: collected,
        next_cursor: null,
        total: total ?? collected.length,
        etag,
      });
    } catch (error) {
      if (!stillCurrent()) return;
      target.status = target.items.length > 0 ? "ready" : "error";
      throw error;
    } finally {
      running.all = undefined;
    }
  })();
  running.all = promise;
  return promise;
};

/**
 * Switches search or sort: resets paging and loads the first page. Asking for
 * the query that is already loading shares that request; a response to an
 * older query is dropped.
 */
export const setQuery = <T>(
  target: PagedState<T>,
  query: Partial<PageQuery>,
  fetchPage: FetchPage<T>,
  options?: PagedOptions,
): Promise<void> => {
  const next: PageQuery = {
    q: (query.q ?? target.query.q).trim(),
    sort: query.sort === undefined ? target.query.sort : query.sort,
  };
  const pending = inflightOf(target).first;
  if (sameQuery(next, target.query)) {
    if (target.status === "loading" && pending?.seq === target.requestSeq) return pending.promise;
    if (target.status === "ready") return Promise.resolve();
  }
  target.query = next;
  target.items = commitList([]);
  target.nextCursor = null;
  target.total = null;
  target.etag = null;
  return loadFirst(target, fetchPage, options);
};

/** Back to the initial state; responses still in flight are dropped. */
export const reset = <T>(target: PagedState<T>): void => {
  target.requestSeq += 1;
  target.items = commitList([]);
  target.nextCursor = null;
  target.total = null;
  target.query = { q: "", sort: target.defaultSort };
  target.status = "idle";
  target.loadingMore = false;
  target.fetchedAt = null;
  target.etag = null;
  target.firstPage = null;
  inflight.delete(target);
};

const applyPage = <T>(target: PagedState<T>, data: PersistedPage<T>, timestamp: number): void => {
  target.items = commitList(data.items);
  target.nextCursor = data.nextCursor;
  target.total = data.total;
  target.query = { q: "", sort: target.defaultSort };
  target.fetchedAt = timestamp;
  target.status = "ready";
  target.firstPage = Object.freeze({ ...data, items: target.items, fetchedAt: timestamp });
};

/**
 * The persist entry for one paged list. "all" writes the whole list whenever
 * its reference changes; "firstPage" writes only the default query's first page.
 */
export const pagedPersistEntry = <S extends StateTree, T>(
  key: string,
  select: (state: S) => PagedState<T>,
  mode: "all" | "firstPage",
  extra: Partial<Pick<PersistEntry<S>, "dirtyOn" | "keepOnClear">> = {},
): PersistEntry<S> =>
  mode === "all"
    ? {
        ...extra,
        key,
        version: (state) => select(state).items,
        timestamp: (state) => (select(state).status === "ready" ? select(state).fetchedAt : null),
        pick: (state): PersistedPage<T> => {
          const target = select(state);
          return {
            items: target.items,
            nextCursor: null,
            total: target.total,
            fetchedAt: target.fetchedAt ?? 0,
          };
        },
        apply: (state, data: PersistedPage<T>, timestamp) =>
          applyPage(select(state), data, timestamp),
      }
    : {
        ...extra,
        key,
        version: (state) => select(state).firstPage,
        timestamp: (state) => select(state).firstPage?.fetchedAt ?? null,
        pick: (state) => select(state).firstPage,
        apply: (state, data: PersistedPage<T>, timestamp) =>
          applyPage(select(state), data, timestamp),
      };
