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
    await store.first(vi.fn().mockResolvedValue({ notModified: true }));
    expect(store.public.items).toBe(list);
    expect(store.public.status).toBe("ready");
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
      { limit: LOAD_ALL_PAGE_SIZE, cursor: null, q: "", sort: "name" },
      { limit: LOAD_ALL_PAGE_SIZE, cursor: "a", q: "", sort: "name" },
      { limit: LOAD_ALL_PAGE_SIZE, cursor: "b", q: "", sort: "name" },
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
