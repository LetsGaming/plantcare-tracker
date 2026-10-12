/**
 * The keyset paging helper (stores/paged.ts) on a throwaway store.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isReactive } from "vue";
import { defineStore } from "pinia";
import {
  LOAD_ALL_PAGE_SIZE,
  PAGE_SIZE,
  loadAll,
  loadFirst,
  loadMore,
  mapPage,
  pagedPersistEntry,
  pagedState,
  pageSearchParams,
  reset,
  setQuery,
  type FetchPage,
  type FetchedPage,
  type PageParams,
  type PagedOptions,
  type PagedState,
} from "@/stores/paged";
import {
  cancelPendingPersistence,
  createInstalledPinia,
  envelope,
  memoryStore,
  resetStore,
} from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);

import "@/stores/pinia";

interface Item {
  id: number;
  name: string;
}

interface DemoState {
  public: PagedState<Item>;
  mine: PagedState<Item>;
}

const PUBLIC_KEY = "paged_demo_public";
const MINE_KEY = "paged_demo_mine";

const useDemoStore = defineStore("pagedDemo", {
  state: (): DemoState => ({
    public: pagedState<Item>("created"),
    mine: pagedState<Item>("name"),
  }),
  persist: {
    entries: [
      pagedPersistEntry<DemoState, Item>(PUBLIC_KEY, (state) => state.public, "firstPage"),
      pagedPersistEntry<DemoState, Item>(MINE_KEY, (state) => state.mine, "all"),
    ],
  },
  actions: {
    first(fetchPage: FetchPage<Item>, options?: PagedOptions) {
      return loadFirst(this.public, fetchPage, options);
    },
    more(fetchPage: FetchPage<Item>, options?: PagedOptions) {
      return loadMore(this.public, fetchPage, options);
    },
    query(q: string, fetchPage: FetchPage<Item>, sort?: string | null) {
      return setQuery(this.public, sort === undefined ? { q } : { q, sort }, fetchPage);
    },
    all(fetchPage: FetchPage<Item>, options?: PagedOptions) {
      return loadAll(this.mine, fetchPage, options);
    },
    clear() {
      reset(this.public);
      reset(this.mine);
    },
  },
});

const items = (from: number, count: number): Item[] =>
  Array.from({ length: count }, (_, index) => ({ id: from + index, name: `Item ${from + index}` }));

const page = (list: Item[], nextCursor: string | null, total?: number): FetchedPage<Item> => ({
  items: list,
  next_cursor: nextCursor,
  total,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

/** Serves pages keyed by cursor (null is the first page). */
const pagedSource = (pages: Map<string | null, FetchedPage<Item>>) =>
  vi.fn(async (params: PageParams) => {
    const found = pages.get(params.cursor);
    if (!found) throw new Error(`no page for cursor ${params.cursor}`);
    return found;
  });

beforeEach(async () => {
  resetStore();
  await createInstalledPinia();
});

afterEach(() => {
  cancelPendingPersistence();
});

describe("loadFirst and loadMore", () => {
  it("loads the first page, appends the next ones and stops at next_cursor null", async () => {
    const store = useDemoStore();
    const fetchPage = pagedSource(
      new Map([
        [null, page(items(1, 30), "c1", 65)],
        ["c1", page(items(31, 30), "c2")],
        ["c2", page(items(61, 5), null)],
      ]),
    );

    await store.first(fetchPage);
    expect(store.public.items.map((item) => item.id)).toEqual(items(1, 30).map((i) => i.id));
    expect(store.public.total).toBe(65);
    expect(store.public.nextCursor).toBe("c1");
    expect(store.public.status).toBe("ready");
    expect(fetchPage).toHaveBeenLastCalledWith({
      limit: PAGE_SIZE,
      cursor: null,
      q: "",
      sort: "created",
      conditional: false,
    });

    const firstList = store.public.items;
    await store.more(fetchPage);
    expect(store.public.items).not.toBe(firstList);
    expect(store.public.items).toHaveLength(60);
    expect(fetchPage).toHaveBeenLastCalledWith({
      limit: PAGE_SIZE,
      cursor: "c1",
      q: "",
      sort: "created",
      conditional: false,
    });

    await store.more(fetchPage);
    expect(store.public.items).toHaveLength(65);
    expect(store.public.nextCursor).toBeNull();
    expect(store.public.total).toBe(65);

    await store.more(fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("commits frozen items in a raw array", async () => {
    const store = useDemoStore();
    await store.first(pagedSource(new Map([[null, page(items(1, 3), null)]])));
    expect(isReactive(store.public.items)).toBe(false);
    expect(store.public.items.every((item) => Object.isFrozen(item))).toBe(true);
  });

  it("shares one request between concurrent loadMore calls", async () => {
    const store = useDemoStore();
    await store.first(pagedSource(new Map([[null, page(items(1, 30), "c1")]])));
    const next = deferred<FetchedPage<Item>>();
    const fetchPage = vi.fn(() => next.promise);

    const a = store.more(fetchPage);
    const b = store.more(fetchPage);
    expect(store.public.loadingMore).toBe(true);
    next.resolve(page(items(31, 2), null));
    await Promise.all([a, b]);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(store.public.items).toHaveLength(32);
    expect(store.public.loadingMore).toBe(false);
  });

  it("keeps the list when loading the first page fails after a success", async () => {
    const store = useDemoStore();
    await store.first(pagedSource(new Map([[null, page(items(1, 2), null)]])));
    await expect(store.first(vi.fn().mockRejectedValue(new Error("offline")))).rejects.toThrow(
      "offline",
    );
    expect(store.public.items).toHaveLength(2);
    expect(store.public.status).toBe("ready");
  });

  it("keeps the data on a not-modified answer", async () => {
    const store = useDemoStore();
    await store.first(pagedSource(new Map([[null, page(items(1, 2), null)]])));
    const list = store.public.items;
    const answer = vi.fn().mockResolvedValue({ notModified: true });
    await store.first(answer);
    expect(answer).toHaveBeenCalledWith(expect.objectContaining({ conditional: true }));
    expect(store.public.items).toBe(list);
    expect(store.public.status).toBe("ready");
  });

  it("sends the first page unconditionally until one is committed", async () => {
    const store = useDemoStore();
    const fetchPage = pagedSource(new Map([[null, page(items(1, 2), "c1")]]));
    await store.first(fetchPage);
    expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ conditional: false }));
  });

  it("refetches once without the flag when a 304 arrives for a cleared list", async () => {
    const store = useDemoStore();
    const fetchPage = vi
      .fn<FetchPage<Item>>()
      .mockResolvedValueOnce({ notModified: true })
      .mockResolvedValueOnce(page(items(1, 2), null, 2));
    await store.first(fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ conditional: false }));
    expect(store.public.items).toHaveLength(2);
    expect(store.public.status).toBe("ready");
  });

  it("fails instead of looping when an unconditional request keeps answering 304", async () => {
    const store = useDemoStore();
    const fetchPage = vi.fn().mockResolvedValue({ notModified: true });
    await expect(store.first(fetchPage)).rejects.toThrow();
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(store.public.status).toBe("error");
  });

  it("does not stall when loadMore answers 304", async () => {
    const store = useDemoStore();
    await store.first(pagedSource(new Map([[null, page(items(1, 30), "c1")]])));
    await store.more(vi.fn().mockResolvedValue({ notModified: true }));
    expect(store.public.loadingMore).toBe(false);
    expect(store.public.nextCursor).toBe("c1");

    await store.more(pagedSource(new Map([["c1", page(items(31, 2), null)]])));
    expect(store.public.items).toHaveLength(32);
  });

  it("does nothing in loadMore while a first page loads", async () => {
    const store = useDemoStore();
    await store.first(pagedSource(new Map([[null, page(items(1, 30), "c1")]])));
    const pending = deferred<FetchedPage<Item>>();
    const running = store.first(vi.fn(() => pending.promise));
    const fetchMore = vi.fn();

    await store.more(fetchMore);
    expect(fetchMore).not.toHaveBeenCalled();
    expect(store.public.loadingMore).toBe(false);

    pending.resolve(page(items(1, 30), "c1"));
    await running;
  });
});

describe("setQuery", () => {
  it("drops the response of a query that was replaced meanwhile", async () => {
    const store = useDemoStore();
    const slow = deferred<FetchedPage<Item>>();
    const fast = deferred<FetchedPage<Item>>();
    const fetchPage = vi.fn((params: PageParams) =>
      params.q === "mon" ? slow.promise : fast.promise,
    );

    const first = store.query("mon", fetchPage);
    const second = store.query("monst", fetchPage);
    fast.resolve(page([{ id: 2, name: "Monstera" }], null, 1));
    await second;
    slow.resolve(page([{ id: 1, name: "Money tree" }], "stale", 9));
    await first;

    expect(store.public.query.q).toBe("monst");
    expect(store.public.items.map((item) => item.id)).toEqual([2]);
    expect(store.public.nextCursor).toBeNull();
    expect(store.public.total).toBe(1);
  });

  it("resets paging and passes q and sort to the server", async () => {
    const store = useDemoStore();
    await store.first(pagedSource(new Map([[null, page(items(1, 30), "c1", 100)]])));
    const pending = deferred<FetchedPage<Item>>();
    const fetchPage = vi.fn(() => pending.promise);

    const running = store.query(" fern ", fetchPage, "name");
    expect(store.public.items).toHaveLength(0);
    expect(store.public.nextCursor).toBeNull();
    expect(store.public.total).toBeNull();
    expect(fetchPage).toHaveBeenCalledWith({
      limit: PAGE_SIZE,
      cursor: null,
      q: "fern",
      sort: "name",
      conditional: false,
    });

    pending.resolve(page(items(200, 1), null, 1));
    await running;
    expect(store.public.items.map((item) => item.id)).toEqual([200]);
  });

  it("coalesces a repeated query while it loads and skips it once loaded", async () => {
    const store = useDemoStore();
    const pending = deferred<FetchedPage<Item>>();
    const fetchPage = vi.fn(() => pending.promise);

    const a = store.query("ivy", fetchPage);
    const b = store.query("ivy", fetchPage);
    pending.resolve(page(items(1, 1), null));
    await Promise.all([a, b]);
    await store.query("ivy", fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("sends a revisited query unconditionally and never keeps an empty list on 304", async () => {
    const store = useDemoStore();
    const seen = new Set<string>();
    const server = vi.fn(async (params: PageParams) => {
      const known = seen.has(params.q);
      seen.add(params.q);
      if (params.conditional && known) return { notModified: true as const };
      return page(items(params.q === "abc" ? 100 : 1, 2), null, 2);
    });

    await store.query("abc", server);
    await store.query("", server);
    await store.query("abc", server);

    expect(server.mock.calls.map(([params]) => params.conditional)).toEqual([false, false, false]);
    expect(store.public.items.map((item) => item.id)).toEqual([100, 101]);
    expect(store.public.status).toBe("ready");

    await store.first(server);
    expect(server).toHaveBeenLastCalledWith(expect.objectContaining({ conditional: true }));
    expect(store.public.items.map((item) => item.id)).toEqual([100, 101]);
  });

  it("loads the same query again after its first page was dropped by the session", async () => {
    const store = useDemoStore();
    const pending = deferred<FetchedPage<Item>>();
    const dropped = store.first(
      vi.fn(() => pending.promise),
      { isCurrent: () => false },
    );
    pending.resolve(page(items(1, 1), null));
    await dropped;
    expect(store.public.status).toBe("idle");

    const fetchPage = vi.fn().mockResolvedValue(page(items(1, 1), null));
    await store.query("", fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(store.public.items).toHaveLength(1);
  });

  it("drops a loadMore that was in flight when the query changed", async () => {
    const store = useDemoStore();
    await store.first(pagedSource(new Map([[null, page(items(1, 30), "c1")]])));
    const more = deferred<FetchedPage<Item>>();
    const pendingMore = store.more(vi.fn(() => more.promise));

    await store.query("x", vi.fn().mockResolvedValue(page(items(500, 1), null)));
    more.resolve(page(items(31, 30), "c2"));
    await pendingMore;

    expect(store.public.items.map((item) => item.id)).toEqual([500]);
    expect(store.public.nextCursor).toBeNull();
  });
});

describe("loadAll", () => {
  it("loops pages of 100 until next_cursor is null and commits once", async () => {
    const store = useDemoStore();
    const fetchPage = pagedSource(
      new Map([
        [null, page(items(1, 100), "a", 230)],
        ["a", page(items(101, 100), "b")],
        ["b", page(items(201, 30), null)],
      ]),
    );
    const commits: number[] = [];
    store.$onAction(({ after }) => after(() => commits.push(store.mine.items.length)));

    await store.all(fetchPage);

    expect(fetchPage.mock.calls.map(([params]) => params)).toEqual([
      { limit: LOAD_ALL_PAGE_SIZE, cursor: null, q: "", sort: "name", conditional: false },
      { limit: LOAD_ALL_PAGE_SIZE, cursor: "a", q: "", sort: "name", conditional: false },
      { limit: LOAD_ALL_PAGE_SIZE, cursor: "b", q: "", sort: "name", conditional: false },
    ]);
    expect(store.mine.items).toHaveLength(230);
    expect(store.mine.total).toBe(230);
    expect(store.mine.nextCursor).toBeNull();
    expect(store.mine.status).toBe("ready");
    expect(commits).toEqual([230]);
  });

  it("shares one run between concurrent callers", async () => {
    const store = useDemoStore();
    const fetchPage = pagedSource(new Map([[null, page(items(1, 3), null)]]));
    await Promise.all([store.all(fetchPage), store.all(fetchPage)]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("fails on a repeated cursor instead of looping", async () => {
    const store = useDemoStore();
    const fetchPage = pagedSource(
      new Map([
        [null, page(items(1, 100), "a")],
        ["a", page(items(101, 100), "b")],
        ["b", page(items(201, 100), "a")],
      ]),
    );
    await expect(store.all(fetchPage)).rejects.toThrow("cursor loop");
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(store.mine.items).toHaveLength(0);
    expect(store.mine.status).toBe("error");
  });

  it("stops at the page cap when every cursor is new", async () => {
    const store = useDemoStore();
    let calls = 0;
    const fetchPage = vi.fn(async () => page(items(1, 1), `c${calls++}`));
    await expect(store.all(fetchPage)).rejects.toThrow("cursor loop");
    expect(calls).toBeLessThanOrEqual(1001);
  });

  it("never sends the conditional flag and fails on a stray 304 without a stored copy", async () => {
    const store = useDemoStore();
    const fetchPage = vi
      .fn<FetchPage<Item>>()
      .mockResolvedValueOnce(page(items(1, 100), "a"))
      .mockResolvedValueOnce({ notModified: true });
    const failure = await store.all(fetchPage).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain("later page");
    for (const [params] of fetchPage.mock.calls) expect(params.conditional).toBe(false);
  });

  it("commits nothing when a later page fails", async () => {
    const store = useDemoStore();
    const fetchPage = pagedSource(new Map([[null, page(items(1, 100), "missing")]]));
    await expect(store.all(fetchPage)).rejects.toThrow();
    expect(store.mine.items).toHaveLength(0);
    expect(store.mine.status).toBe("error");
  });
});

describe("logout epoch", () => {
  it("drops a first page that arrives after the session ended", async () => {
    const store = useDemoStore();
    let current = true;
    const pending = deferred<FetchedPage<Item>>();
    const running = store.first(
      vi.fn(() => pending.promise),
      { isCurrent: () => current },
    );
    current = false;
    pending.resolve(page(items(1, 3), "c1", 3));
    await running;

    expect(store.public.items).toHaveLength(0);
    expect(store.public.nextCursor).toBeNull();
    expect(store.public.firstPage).toBeNull();
  });

  it("drops a loadAll and a loadMore that finish after the session ended", async () => {
    const store = useDemoStore();
    await store.first(pagedSource(new Map([[null, page(items(1, 30), "c1")]])));
    let current = true;
    const isCurrent = () => current;
    const more = deferred<FetchedPage<Item>>();
    const all = deferred<FetchedPage<Item>>();
    const pendingMore = store.more(
      vi.fn(() => more.promise),
      { isCurrent },
    );
    const pendingAll = store.all(
      vi.fn(() => all.promise),
      { isCurrent },
    );

    current = false;
    more.resolve(page(items(31, 30), null));
    all.resolve(page(items(1, 5), null));
    await Promise.all([pendingMore, pendingAll]);

    expect(store.public.items).toHaveLength(30);
    expect(store.mine.items).toHaveLength(0);
  });

  it("swallows the failure of a request the logout aborted", async () => {
    const store = useDemoStore();
    let current = true;
    const pending = deferred<FetchedPage<Item>>();
    const running = store.first(
      vi.fn(() => pending.promise),
      { isCurrent: () => current },
    );
    current = false;
    pending.reject(new DOMException("aborted", "AbortError"));
    await expect(running).resolves.toBeUndefined();
  });

  it("$reset drops first, more and all requests still in flight", async () => {
    const store = useDemoStore();
    await store.first(pagedSource(new Map([[null, page(items(1, 30), "c1")]])));
    const first = deferred<FetchedPage<Item>>();
    const more = deferred<FetchedPage<Item>>();
    const all = deferred<FetchedPage<Item>>();
    const pendingMore = store.more(vi.fn(() => more.promise));
    const pendingAll = store.all(vi.fn(() => all.promise));
    const pendingFirst = store.first(vi.fn(() => first.promise));

    store.$reset();
    first.resolve(page(items(1, 3), null));
    more.resolve(page(items(31, 3), null));
    all.resolve(page(items(1, 4), null));
    await Promise.all([pendingFirst, pendingMore, pendingAll]);

    expect(store.public.items).toHaveLength(0);
    expect(store.public.status).toBe("idle");
    expect(store.mine.items).toHaveLength(0);
    expect(store.mine.status).toBe("idle");
  });

  it("loads again after a logout and an immediate login while the old loadAll is still running", async () => {
    const store = useDemoStore();
    let session = 1;
    const started = session;
    const oldRun = deferred<FetchedPage<Item>>();
    const pendingOld = store.all(
      vi.fn(() => oldRun.promise),
      { isCurrent: () => session === started },
    );

    session = 2;
    store.$reset();
    const fetchNew = pagedSource(new Map([[null, page(items(1, 4), null)]]));
    const pendingNew = store.all(fetchNew, { isCurrent: () => session === 2 });
    oldRun.resolve(page(items(100, 2), null));
    await Promise.all([pendingOld, pendingNew]);

    expect(fetchNew).toHaveBeenCalledTimes(1);
    expect(store.mine.items).toHaveLength(4);
    expect(store.mine.status).toBe("ready");
  });

  it("does not let a dropped run end the sharing of the run that replaced it", async () => {
    const store = useDemoStore();
    const oldRun = deferred<FetchedPage<Item>>();
    const newRun = deferred<FetchedPage<Item>>();
    const pendingOld = store.all(vi.fn(() => oldRun.promise));
    store.$reset();
    const fetchNew = vi.fn(() => newRun.promise);
    const pendingNew = store.all(fetchNew);
    oldRun.resolve(page(items(100, 2), null));
    await pendingOld;

    const joined = store.all(vi.fn(() => Promise.reject(new Error("must share"))));
    newRun.resolve(page(items(1, 4), null));
    await Promise.all([pendingNew, joined]);

    expect(store.mine.items).toHaveLength(4);
  });

  it("never reuses a request sequence after $reset", async () => {
    const store = useDemoStore();
    const first = deferred<FetchedPage<Item>>();
    const second = deferred<FetchedPage<Item>>();
    const pendingOld = store.first(vi.fn(() => first.promise));
    store.$reset();
    const pendingNew = store.first(vi.fn(() => second.promise));
    first.resolve(page(items(100, 2), null));
    await pendingOld;
    expect(store.public.items).toHaveLength(0);
    second.resolve(page(items(1, 3), null));
    await pendingNew;
    expect(store.public.items).toHaveLength(3);
  });

  it("reset drops responses still in flight", async () => {
    const store = useDemoStore();
    const pending = deferred<FetchedPage<Item>>();
    const running = store.first(vi.fn(() => pending.promise));
    store.clear();
    pending.resolve(page(items(1, 3), null));
    await running;
    expect(store.public.items).toHaveLength(0);
    expect(store.public.status).toBe("idle");
  });
});

describe("persistence", () => {
  const storedIds = (key: string): number[] | undefined =>
    (memoryStore.get(key) as { data: { items: Item[] } } | undefined)?.data.items.map(
      (item) => item.id,
    );

  it("persists only the first page of the default query", async () => {
    const store = useDemoStore();
    await store.first(
      pagedSource(
        new Map([
          [null, page(items(1, 30), "c1", 90)],
          ["c1", page(items(31, 30), "c2")],
        ]),
      ),
    );
    store.$flushPersist();
    expect(storedIds(PUBLIC_KEY)).toEqual(items(1, 30).map((item) => item.id));
    expect(memoryStore.get(PUBLIC_KEY)).toMatchObject({
      data: { nextCursor: "c1", total: 90 },
    });

    memoryStore.delete(PUBLIC_KEY);
    await store.more(pagedSource(new Map([["c1", page(items(31, 30), "c2")]])));
    store.$flushPersist();
    expect(memoryStore.has(PUBLIC_KEY)).toBe(false);

    await store.query("rare", vi.fn().mockResolvedValue(page(items(900, 2), null, 2)));
    store.$flushPersist();
    expect(memoryStore.has(PUBLIC_KEY)).toBe(false);

    await store.query("", vi.fn().mockResolvedValue(page(items(1, 30), "c1", 91)));
    store.$flushPersist();
    expect(storedIds(PUBLIC_KEY)).toEqual(items(1, 30).map((item) => item.id));
  });

  it("does not persist a first page of another sort", async () => {
    const store = useDemoStore();
    await store.query("", vi.fn().mockResolvedValue(page(items(1, 3), null)), "name");
    store.$flushPersist();
    expect(memoryStore.has(PUBLIC_KEY)).toBe(false);
  });

  it("restores the persisted first page", async () => {
    await useDemoStore().first(pagedSource(new Map([[null, page(items(1, 2), "c1", 40)]])));
    useDemoStore().$flushPersist();
    cancelPendingPersistence();

    await createInstalledPinia();
    const restored = useDemoStore();
    expect(await restored.$hydrate([PUBLIC_KEY])).toBe(true);
    expect(restored.public.items.map((item) => item.id)).toEqual([1, 2]);
    expect(restored.public.nextCursor).toBe("c1");
    expect(restored.public.total).toBe(40);
    expect(restored.public.status).toBe("ready");
  });

  it("does not write again after hydration", async () => {
    await useDemoStore().first(pagedSource(new Map([[null, page(items(1, 2), "c1", 40)]])));
    useDemoStore().$flushPersist();
    cancelPendingPersistence();

    await createInstalledPinia();
    const restored = useDemoStore();
    await restored.$hydrate([PUBLIC_KEY]);
    memoryStore.delete(PUBLIC_KEY);
    restored.$flushPersist();
    expect(memoryStore.has(PUBLIC_KEY)).toBe(false);
  });

  it("persists an owned list in full", async () => {
    const store = useDemoStore();
    await store.all(
      pagedSource(
        new Map([
          [null, page(items(1, 100), "a")],
          ["a", page(items(101, 20), null)],
        ]),
      ),
    );
    store.$flushPersist();
    expect(storedIds(MINE_KEY)).toHaveLength(120);
  });
});

describe("request helpers", () => {
  it("maps an envelope page through a mapper", () => {
    const body = envelope([{ plant_id: 1 }, { plant_id: 2 }], "next", 2).data;
    expect(mapPage(body, (dto) => ({ id: dto.plant_id }))).toEqual({
      items: [{ id: 1 }, { id: 2 }],
      next_cursor: "next",
      total: 2,
    });
    expect(mapPage(envelope([]).data, (dto) => dto)).toEqual({ items: [], next_cursor: null });
  });

  it("builds the query string, leaving out empty q and default sort", () => {
    expect(
      pageSearchParams({ limit: 30, cursor: null, q: "", sort: null }, { scope: "public" }),
    ).toBe("limit=30&scope=public");
    expect(pageSearchParams({ limit: 100, cursor: "abc", q: "a b", sort: "name" })).toBe(
      "limit=100&cursor=abc&q=a+b&sort=name",
    );
  });
});
