import { describe, it, expect } from "vitest";
import { reactive } from "vue";
import { optimisticRemove, optimisticUpsert } from "@/stores/optimistic";

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

const names = (list: Item[]) => list.map((i) => `${i.id}:${i.name}`);

describe("optimisticUpsert", () => {
  it("paints immediately, then reconciles the temporary id with the server item", async () => {
    const list = reactive<Item[]>([{ id: 1, name: "one" }]);
    const gate = deferred<Item>();

    const pending = optimisticUpsert(
      () => list,
      { id: -5, name: "draft" },
      () => gate.promise,
      (server) => server,
    );
    expect(names(list)).toEqual(["1:one", "-5:draft"]);

    gate.resolve({ id: 9, name: "server" });
    await expect(pending).resolves.toEqual({ id: 9, name: "server" });
    expect(names(list)).toEqual(["1:one", "9:server"]);
  });

  it("rolls back only the affected item; concurrent sibling changes survive", async () => {
    const list = reactive<Item[]>([{ id: 1, name: "one" }]);
    const gate = deferred<Item>();

    const pending = optimisticUpsert(
      () => list,
      { id: -5, name: "draft" },
      () => gate.promise,
      (server) => server,
    );
    list.push({ id: 2, name: "added meanwhile" });
    gate.reject(new Error("400"));

    await expect(pending).rejects.toThrow("400");
    expect(names(list)).toEqual(["1:one", "2:added meanwhile"]);
  });

  it("restores the previous state of an edited item when the request fails", async () => {
    const list = reactive<Item[]>([{ id: 1, name: "old" }]);

    await expect(
      optimisticUpsert(
        () => list,
        { id: 1, name: "new" },
        async () => {
          throw new Error("403");
        },
        (server: Item) => server,
      ),
    ).rejects.toThrow("403");

    expect(names(list)).toEqual(["1:old"]);
  });

  it("keeps the position of an edited item when it is reconciled", async () => {
    const list = reactive<Item[]>([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
    ]);
    await optimisticUpsert(
      () => list,
      { id: 2, name: "b (draft)" },
      async () => ({ id: 2, name: "b (server)" }),
      (server) => server,
    );
    expect(names(list)).toEqual(["1:a", "2:b (server)", "3:c"]);
  });
});

describe("optimisticRemove", () => {
  it("removes immediately and stays removed on success", async () => {
    const list = reactive<Item[]>([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ]);
    const gate = deferred<void>();

    const pending = optimisticRemove(
      () => list,
      1,
      () => gate.promise,
    );
    expect(names(list)).toEqual(["2:b"]);

    gate.resolve();
    await pending;
    expect(names(list)).toEqual(["2:b"]);
  });

  it("re-inserts the item at its original position when the request fails", async () => {
    const list = reactive<Item[]>([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
    ]);

    await expect(
      optimisticRemove(
        () => list,
        2,
        async () => {
          throw new Error("404");
        },
      ),
    ).rejects.toThrow("404");

    expect(names(list)).toEqual(["1:a", "2:b", "3:c"]);
  });

  it("is a plain request when the item is not in the list", async () => {
    const list = reactive<Item[]>([{ id: 1, name: "a" }]);
    await optimisticRemove(
      () => list,
      99,
      async () => "done",
    );
    expect(names(list)).toEqual(["1:a"]);
  });
});
