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

import { markRaw, toRaw } from "vue";
import type { StateTree } from "pinia";
import { commitList } from "./optimistic";
import type { PersistEntry } from "./persistence";
import type { ResourceStatus } from "./resource";

export const PAGE_SIZE = 30;
export const LOAD_ALL_PAGE_SIZE = 100;
const LOAD_ALL_MAX_PAGES = 1000;

export interface PageQuery {
  q: string;
  /** Sort key the endpoint accepts; null leaves the server default. */
  sort: string | null;
}

export interface PageParams extends PageQuery {
  limit: number;
  cursor: string | null;
  /** True only when the caller holds a committed copy of this exact request and may accept a 304. */
  conditional: boolean;
}

/** One page with its items already mapped to frozen view models. */
export interface FetchedPage<T extends object> {
  items: T[];
  next_cursor: string | null;
  total?: number;
}

/** The `data` of every list endpoint (`ApiUtils` unwraps `{ data }`). */
export interface ApiPage<D> {
  items: D[];
  next_cursor: string | null;
  total?: number;
}

/** Maps a raw page's items through a mapper, keeping cursor and total. */
export const mapPage = <D, T extends object>(
  page: ApiPage<D>,
  map: (item: D) => T,
): FetchedPage<T> => ({
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

export type FetchPage<T extends object> = (
  params: PageParams,
) => Promise<FetchedPage<T> | PageNotModified>;

export interface PagedOptions {
  /** False once the session that started the request ended; the result is then dropped. */
  isCurrent?: () => boolean;
}

export interface PersistedPage<T extends object> {
  items: T[];
  nextCursor: string | null;
  total: number | null;
  fetchedAt: number;
}

export interface PagedState<T extends object> {
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
  /** Bumped by every first-page load and reset; a response from an older sequence is dropped. */
  requestSeq: number;
  /** The last committed first page of the default query (what "firstPage" persistence writes). */
  firstPage: Readonly<PersistedPage<T>> | null;
}

export const pagedState = <T extends object>(defaultSort: string | null = null): PagedState<T> => ({
  items: markRaw([]) as T[],
  nextCursor: null,
  total: null,
  query: { q: "", sort: defaultSort },
  defaultSort,
  status: "idle",
  loadingMore: false,
  fetchedAt: null,
  requestSeq: 0,
  firstPage: null,
});

const notModified = <T extends object>(
  page: FetchedPage<T> | PageNotModified,
): page is PageNotModified => (page as PageNotModified).notModified === true;

const isCurrent = (options?: PagedOptions): boolean => options?.isCurrent?.() ?? true;

const isDefaultQuery = (target: PagedState<object>): boolean =>
  target.query.q === "" && target.query.sort === target.defaultSort;

const sameQuery = (a: PageQuery, b: PageQuery): boolean => a.q === b.q && a.sort === b.sort;

interface Inflight {
  first?: { seq: number; promise: Promise<void> };
  more?: { seq: number; promise: Promise<void> };
  all?: { seq: number; promise: Promise<void>; live: () => boolean };
}

const inflight = new WeakMap<object, Inflight>();

// Pinia's `$reset` merges a fresh state into the existing object and sets `requestSeq` back to 0,
// so sequences come from one counter: a number is never reused by a later request.
let lastSeq = 0;
const nextSeq = (target: PagedState<object>): number => (target.requestSeq = ++lastSeq);

const inflightOf = (target: object): Inflight => {
  const key = toRaw(target);
  let entry = inflight.get(key);
  if (!entry) inflight.set(key, (entry = {}));
  return entry;
};

/** Leaves the loading status of a request the session ended, unless a newer request owns it. */
const settleDropped = <T extends object>(target: PagedState<T>, seq: number): void => {
  if (target.requestSeq !== seq) return;
  target.status = target.items.length > 0 ? "ready" : "idle";
  target.loadingMore = false;
  const running = inflightOf(target);
  if (running.first?.seq === seq) running.first = undefined;
};

const commitFirstPage = <T extends object>(target: PagedState<T>, page: FetchedPage<T>): void => {
  const fetchedAt = Date.now();
  target.items = commitList(page.items.slice());
  target.nextCursor = page.next_cursor;
  target.total = page.total ?? null;
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

const runFirst = async <T extends object>(
  target: PagedState<T>,
  fetchPage: FetchPage<T>,
  seq: number,
  options?: PagedOptions,
): Promise<void> => {
  const stillCurrent = () => target.requestSeq === seq && isCurrent(options);
  const request = (conditional: boolean) =>
    fetchPage({
      limit: PAGE_SIZE,
      cursor: null,
      q: target.query.q,
      sort: target.query.sort,
      conditional,
    });
  target.status = "loading";
  target.loadingMore = false;
  try {
    let page = await request(target.fetchedAt !== null);
    if (!stillCurrent()) return settleDropped(target, seq);
    if (notModified(page) && target.fetchedAt === null) {
      page = await request(false);
      if (!stillCurrent()) return settleDropped(target, seq);
      if (notModified(page)) throw new Error("Not Modified answered an unconditional request.");
    }
    if (notModified(page)) {
      target.fetchedAt = Date.now();
      target.status = "ready";
      return;
    }
    commitFirstPage(target, page);
  } catch (error) {
    if (!stillCurrent()) return settleDropped(target, seq);
    target.status = target.items.length > 0 ? "ready" : "error";
    throw error;
  }
};

/**
 * Loads the first page of the current query, replacing the list. Every call
 * starts a new request sequence, so a response to an earlier call is dropped.
 * The request is conditional only while a first page of this query is committed.
 */
export const loadFirst = <T extends object>(
  target: PagedState<T>,
  fetchPage: FetchPage<T>,
  options?: PagedOptions,
): Promise<void> => {
  const seq = nextSeq(target);
  const promise = runFirst(target, fetchPage, seq, options);
  inflightOf(target).first = { seq, promise };
  return promise;
};

/** Appends the next page; a no-op at the end of the list or while a first page loads. */
export const loadMore = <T extends object>(
  target: PagedState<T>,
  fetchPage: FetchPage<T>,
  options?: PagedOptions,
): Promise<void> => {
  const running = inflightOf(target);
  if (running.more && running.more.seq === target.requestSeq) return running.more.promise;
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
        conditional: false,
      });
      if (!stillCurrent() || notModified(page)) return;
      target.items = commitList([...target.items, ...page.items]);
      target.nextCursor = page.next_cursor;
    } catch (error) {
      if (stillCurrent()) throw error;
    } finally {
      if (target.requestSeq === seq) target.loadingMore = false;
      if (running.more?.seq === seq) running.more = undefined;
    }
  })();
  running.more = { seq, promise };
  return promise;
};

/**
 * Loads every page (100 per request) and commits the whole list once.
 * Concurrent callers share one run. Requests are never conditional.
 */
export const loadAll = <T extends object>(
  target: PagedState<T>,
  fetchPage: FetchPage<T>,
  options?: PagedOptions,
): Promise<void> => {
  const running = inflightOf(target);
  if (running.all && running.all.seq === target.requestSeq && running.all.live()) {
    return running.all.promise;
  }

  const seq = nextSeq(target);
  const stillCurrent = () => target.requestSeq === seq && isCurrent(options);

  target.status = "loading";
  const promise = (async () => {
    try {
      const collected: T[] = [];
      const seen = new Set<string>();
      let cursor: string | null = null;
      let total: number | null = null;
      do {
        const page: FetchedPage<T> | PageNotModified = await fetchPage({
          limit: LOAD_ALL_PAGE_SIZE,
          cursor,
          q: "",
          sort: target.defaultSort,
          conditional: false,
        });
        if (!stillCurrent()) return settleDropped(target, seq);
        if (notModified(page)) {
          if (cursor === null && target.fetchedAt !== null) {
            target.status = "ready";
            return;
          }
          throw new Error("Not Modified answered an unconditional request.");
        }
        if (cursor === null) total = page.total ?? null;
        collected.push(...page.items);
        cursor = page.next_cursor;
        if (cursor !== null) {
          if (seen.has(cursor) || seen.size >= LOAD_ALL_MAX_PAGES) {
            throw new Error("The list endpoint returned a cursor loop.");
          }
          seen.add(cursor);
        }
      } while (cursor !== null);

      target.query = { q: "", sort: target.defaultSort };
      commitFirstPage(target, {
        items: collected,
        next_cursor: null,
        total: total ?? collected.length,
      });
    } catch (error) {
      if (!stillCurrent()) return settleDropped(target, seq);
      target.status = target.items.length > 0 ? "ready" : "error";
      throw error;
    } finally {
      if (running.all?.seq === seq) running.all = undefined;
    }
  })();
  running.all = { seq, promise, live: stillCurrent };
  return promise;
};

/**
 * Switches search or sort: resets paging and loads the first page. Asking for
 * the query that is already loading shares that request; a response to an
 * older query is dropped.
 */
export const setQuery = <T extends object>(
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
  target.fetchedAt = null;
  return loadFirst(target, fetchPage, options);
};

/** Back to the initial state; responses still in flight are dropped. */
export const reset = <T extends object>(target: PagedState<T>): void => {
  nextSeq(target);
  target.items = commitList([]);
  target.nextCursor = null;
  target.total = null;
  target.query = { q: "", sort: target.defaultSort };
  target.status = "idle";
  target.loadingMore = false;
  target.fetchedAt = null;
  target.firstPage = null;
  inflight.delete(toRaw(target));
};

const applyPage = <T extends object>(
  target: PagedState<T>,
  data: PersistedPage<T>,
  timestamp: number,
): void => {
  if (!Array.isArray(data?.items)) return;
  if (target.fetchedAt !== null && target.fetchedAt >= timestamp) return;
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
export const pagedPersistEntry = <S extends StateTree, T extends object>(
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
