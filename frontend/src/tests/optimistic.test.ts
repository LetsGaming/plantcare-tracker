import { describe, it, expect, vi, afterEach } from "vitest";
import {
  idIndexOf,
  optimisticRemove,
  optimisticUpsert,
  removeItem,
  replaceItem,
  upsertItem,
  type ListAccess,
} from "@/stores/optimistic";

interface Item {
  id: number;
  name: string;
}

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const names = (list: readonly Item[]) => list.map((i) => `${i.id}:${i.name}`);

const cowList = (initial: Item[]) => {
  let current = initial;
  const access: ListAccess<Item> = {
    get: () => current,
    set: (next) => {
      current = next;
    },
  };
  return { access, read: () => current };
};

describe("optimisticUpsert on a copy-on-write list", () => {
  it("paints and reconciles with new arrays and never edits an earlier one", async () => {
    const start: Item[] = [{ id: 1, name: "one" }];
    const list = cowList(start);
    const gate = deferred<Item>();

    const pending = optimisticUpsert(
      list.access,
      { id: -5, name: "draft" },
      () => gate.promise,
      (server) => server,
    );
    const painted = list.read();
    expect(painted).not.toBe(start);
    expect(names(start)).toEqual(["1:one"]);
    expect(names(painted)).toEqual(["1:one", "-5:draft"]);

    gate.resolve({ id: 9, name: "server" });
    await pending;
    expect(list.read()).not.toBe(painted);
    expect(names(painted)).toEqual(["1:one", "-5:draft"]);
    expect(names(list.read())).toEqual(["1:one", "9:server"]);
  });

  it("replaces the temporary item in place instead of appending the server item", async () => {
    const list = cowList([
      { id: 1, name: "one" },
      { id: 2, name: "two" },
    ]);
    const gate = deferred<Item>();
    const pending = optimisticUpsert(
      list.access,
      { id: -5, name: "draft" },
      () => gate.promise,
      (server) => server,
    );
    gate.resolve({ id: 42, name: "server" });
    await pending;
    expect(names(list.read())).toEqual(["1:one", "2:two", "42:server"]);
  });

  it("drops a duplicate server item that a refetch loaded while the request was pending", async () => {
    const list = cowList([{ id: 1, name: "one" }]);
    const gate = deferred<Item>();
    const pending = optimisticUpsert(
      list.access,
      { id: -5, name: "draft" },
      () => gate.promise,
      (server) => server,
    );
    list.access.set([
      { id: 1, name: "one" },
      { id: 42, name: "refetched" },
    ]);
    gate.resolve({ id: 42, name: "server" });
    await pending;
    expect(names(list.read())).toEqual(["1:one", "42:server"]);
  });

  it("keeps length and position when an edit succeeds", async () => {
    const list = cowList([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
    ]);
    await optimisticUpsert(
      list.access,
      { id: 2, name: "b (draft)" },
      async () => ({ id: 2, name: "b (server)" }),
      (server) => server,
    );
    expect(names(list.read())).toEqual(["1:a", "2:b (server)", "3:c"]);
  });

  it("restores the previous array reference when an edit fails", async () => {
    const start: Item[] = [{ id: 1, name: "old" }];
    const list = cowList(start);

    await expect(
      optimisticUpsert(
        list.access,
        { id: 1, name: "new" },
        async () => {
          throw new Error("403");
        },
        (server: Item) => server,
      ),
    ).rejects.toThrow("403");

    expect(list.read()).toBe(start);
    expect(start[0].name).toBe("old");
  });

  it("restores the previous array reference when a create fails", async () => {
    const start: Item[] = [{ id: 1, name: "one" }];
    const list = cowList(start);
    await expect(
      optimisticUpsert(
        list.access,
        { id: -5, name: "draft" },
        async () => {
          throw new Error("400");
        },
        (server: Item) => server,
      ),
    ).rejects.toThrow("400");
    expect(list.read()).toBe(start);
  });

  it("rolls back only the affected item when the list changed in between", async () => {
    const list = cowList([{ id: 1, name: "one" }]);
    const gate = deferred<Item>();

    const pending = optimisticUpsert(
      list.access,
      { id: -5, name: "draft" },
      () => gate.promise,
      (server) => server,
    );
    list.access.set(upsertItem(list.read(), { id: 2, name: "added meanwhile" }));
    gate.reject(new Error("400"));

    await expect(pending).rejects.toThrow("400");
    expect(names(list.read())).toEqual(["1:one", "2:added meanwhile"]);
  });

  it("puts the previous item back in place when the list changed in between", async () => {
    const list = cowList([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ]);
    const original = list.read()[1];
    const gate = deferred<Item>();

    const pending = optimisticUpsert(
      list.access,
      { id: 2, name: "b (draft)" },
      () => gate.promise,
      (server) => server,
    );
    list.access.set(upsertItem(list.read(), { id: 3, name: "c" }));
    gate.reject(new Error("403"));

    await expect(pending).rejects.toThrow("403");
    expect(names(list.read())).toEqual(["1:a", "2:b", "3:c"]);
    expect(list.read()[1]).toBe(original);
  });
});

describe("optimisticRemove on a copy-on-write list", () => {
  it("removes with a new array and keeps the old one intact", async () => {
    const start: Item[] = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ];
    const list = cowList(start);
    await optimisticRemove(list.access, 1, async () => "ok");
    expect(names(list.read())).toEqual(["2:b"]);
    expect(names(start)).toEqual(["1:a", "2:b"]);
  });

  it("restores the previous array reference when the request fails", async () => {
    const start: Item[] = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
    ];
    const list = cowList(start);
    await expect(
      optimisticRemove(list.access, 2, async () => {
        throw new Error("404");
      }),
    ).rejects.toThrow("404");
    expect(list.read()).toBe(start);
  });

  it("re-inserts at the original position when the list changed in between", async () => {
    const list = cowList([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
    ]);
    const gate = deferred<void>();
    const pending = optimisticRemove(list.access, 2, () => gate.promise);
    list.access.set(upsertItem(list.read(), { id: 4, name: "d" }));
    gate.reject(new Error("404"));
    await expect(pending).rejects.toThrow("404");
    expect(names(list.read())).toEqual(["1:a", "2:b", "3:c", "4:d"]);
  });

  it("is a plain request when the item is not in the list", async () => {
    const start: Item[] = [{ id: 1, name: "a" }];
    const list = cowList(start);
    await optimisticRemove(list.access, 99, async () => "done");
    expect(list.read()).toBe(start);
  });
});

describe("replaceItem", () => {
  it("replaces by the old id, appends when missing and never edits the input", () => {
    const start: Item[] = [
      { id: -1, name: "temp" },
      { id: 2, name: "two" },
    ];
    expect(names(replaceItem(start, -1, { id: 9, name: "real" }))).toEqual(["9:real", "2:two"]);
    expect(names(replaceItem(start, -7, { id: 9, name: "real" }))).toEqual([
      "-1:temp",
      "2:two",
      "9:real",
    ]);
    expect(names(start)).toEqual(["-1:temp", "2:two"]);
  });
});

describe("idIndexOf", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is built once per list identity and answers without scanning", () => {
    const list: Item[] = Array.from({ length: 200 }, (_, i) => ({ id: i, name: `n${i}` }));
    const first = idIndexOf(list);
    const find = vi.spyOn(Array.prototype, "find");
    const findIndex = vi.spyOn(Array.prototype, "findIndex");

    expect(idIndexOf(list)).toBe(first);
    expect(idIndexOf(list).get(150)).toBe(list[150]);
    expect(idIndexOf(list).get(999)).toBeUndefined();
    expect(find).not.toHaveBeenCalled();
    expect(findIndex).not.toHaveBeenCalled();
  });

  it("gives a new list its own index and keeps the first of duplicate ids", () => {
    const list: Item[] = [
      { id: 1, name: "a" },
      { id: 1, name: "dup" },
    ];
    expect(idIndexOf(list).get(1)?.name).toBe("a");
    const next = upsertItem(list, { id: 2, name: "b" });
    expect(idIndexOf(next)).not.toBe(idIndexOf(list));
    expect(idIndexOf(next).get(2)?.name).toBe("b");
    expect(removeItem(next, 2)).toHaveLength(2);
  });
});
