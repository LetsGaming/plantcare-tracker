import { markRaw, toRaw } from "vue";

type WithId = { id: number | string };

/**
 * A copy-on-write list: `get` returns the current array, `set` commits a new
 * one. Arrays are never mutated, so a reference taken earlier stays valid.
 */
export interface ListAccess<T> {
  get: () => readonly T[];
  set: (next: T[]) => void;
}

/**
 * Freezes the items and marks the array raw so Vue neither wraps the list nor
 * its items. Lists are replaced wholesale, never edited in place.
 */
export const commitList = <T extends object>(items: T[]): T[] => {
  for (const item of items) if (!Object.isFrozen(item)) Object.freeze(item);
  return markRaw(items);
};

interface IdIndex<T> {
  length: number;
  byId: Map<number | string, T>;
}

const indexes = new WeakMap<object, IdIndex<unknown>>();

/**
 * Id to item map for one list identity, built on first use and cached by the
 * array reference (the length check only guards against a list edited in place).
 * The first item wins on duplicate ids, like `Array.find`.
 */
export const idIndexOf = <T extends WithId>(list: readonly T[]): Map<number | string, T> => {
  const raw = toRaw(list) as readonly T[];
  const cached = indexes.get(raw) as IdIndex<T> | undefined;
  if (cached && cached.length === raw.length) return cached.byId;
  const byId = new Map<number | string, T>();
  for (const item of raw) if (!byId.has(item.id)) byId.set(item.id, item);
  indexes.set(raw, { length: raw.length, byId });
  return byId;
};

const findPosition = <T extends WithId>(list: readonly T[], id: number | string): number =>
  list.findIndex((item) => item.id === id);

/** A new array with the item with the same id replaced, or appended when missing. */
export const upsertItem = <T extends WithId>(list: readonly T[], item: T): T[] => {
  const raw = toRaw(list) as readonly T[];
  const index = findPosition(raw, item.id);
  const next = raw.slice();
  if (index === -1) next.push(item);
  else next[index] = item;
  return next;
};

/** A new array without the item with this id; the same array when it is missing. */
export const removeItem = <T extends WithId>(list: readonly T[], id: number | string): T[] => {
  const raw = toRaw(list) as T[];
  const index = findPosition(raw, id);
  if (index === -1) return raw;
  const next = raw.slice();
  next.splice(index, 1);
  return next;
};

/**
 * A new array with the entry with `oldId` replaced by `item` (appended when
 * missing). When the id changed and another entry already carries the new id,
 * for example a refetch that landed first, that duplicate is dropped.
 */
export const replaceItem = <T extends WithId>(
  list: readonly T[],
  oldId: number | string,
  item: T,
): T[] => {
  const raw = toRaw(list) as readonly T[];
  const index = findPosition(raw, oldId);
  const next = raw.slice();
  if (index === -1) next.push(item);
  else next[index] = item;
  if (item.id === oldId) return next;
  return next.filter((entry) => entry === item || entry.id !== item.id);
};

const upsertInPlace = async <T extends WithId, R>(
  list: () => T[],
  optimisticItem: T,
  request: () => Promise<R>,
  reconcile: (response: R) => T,
): Promise<R> => {
  const existing = list().find((item) => item.id === optimisticItem.id);
  const snapshot = existing ? toRaw(existing) : null;

  const paintIndex = list().findIndex((item) => item.id === optimisticItem.id);
  if (paintIndex === -1) list().push(optimisticItem);
  else list()[paintIndex] = optimisticItem;

  try {
    const response = await request();
    const finalItem = reconcile(response);
    const index = list().findIndex((item) => item.id === optimisticItem.id);
    if (index === -1) list().push(finalItem);
    else list()[index] = finalItem;
    return response;
  } catch (error) {
    const index = list().findIndex((item) => item.id === optimisticItem.id);
    if (snapshot) {
      if (index === -1) list().push(snapshot);
      else list()[index] = snapshot;
    } else if (index !== -1) {
      list().splice(index, 1);
    }
    throw error;
  }
};

const upsertCopyOnWrite = async <T extends WithId, R>(
  list: ListAccess<T>,
  optimisticItem: T,
  request: () => Promise<R>,
  reconcile: (response: R) => T,
): Promise<R> => {
  const before = list.get();
  const existing = idIndexOf(before).get(optimisticItem.id);

  list.set(upsertItem(before, optimisticItem));
  const painted = list.get();

  try {
    const response = await request();
    list.set(replaceItem(list.get(), optimisticItem.id, reconcile(response)));
    return response;
  } catch (error) {
    if (list.get() === painted) {
      list.set(before as T[]);
    } else if (existing) {
      list.set(upsertItem(list.get(), existing));
    } else {
      list.set(removeItem(list.get(), optimisticItem.id));
    }
    throw error;
  }
};

/**
 * Optimistic upsert on a list. The expected item is painted immediately (give
 * creates a temporary negative id), the request runs, and `reconcile` swaps the
 * item for the server's version. On failure only this item is restored (or
 * removed), so concurrent changes to other items survive. Returns the raw
 * response.
 *
 * Pass a `ListAccess` for a copy-on-write list: every step commits a new array
 * and a failure with no other change in between puts the previous array
 * reference back. A plain `() => T[]` edits the reactive array in place.
 */
export function optimisticUpsert<T extends WithId, R>(
  list: ListAccess<T> | (() => T[]),
  optimisticItem: T,
  request: () => Promise<R>,
  reconcile: (response: R) => T,
): Promise<R> {
  return typeof list === "function"
    ? upsertInPlace(list, optimisticItem, request, reconcile)
    : upsertCopyOnWrite(list, optimisticItem, request, reconcile);
}

const removeInPlace = async <T extends WithId, R>(
  list: () => T[],
  itemId: number | string,
  request: () => Promise<R>,
): Promise<R> => {
  const index = list().findIndex((item) => item.id === itemId);
  const snapshot = index === -1 ? null : toRaw(list()[index]);
  if (index !== -1) list().splice(index, 1);

  try {
    return await request();
  } catch (error) {
    if (snapshot && !list().some((item) => item.id === itemId)) {
      list().splice(Math.min(index, list().length), 0, snapshot);
    }
    throw error;
  }
};

const removeCopyOnWrite = async <T extends WithId, R>(
  list: ListAccess<T>,
  itemId: number | string,
  request: () => Promise<R>,
): Promise<R> => {
  const before = list.get();
  const item = idIndexOf(before).get(itemId);
  const index = item === undefined ? -1 : (toRaw(before) as readonly T[]).indexOf(item);
  if (item === undefined) return request();

  const removed = removeItem(before, itemId);
  list.set(removed);

  try {
    return await request();
  } catch (error) {
    if (list.get() === removed) {
      list.set(before as T[]);
    } else if (!idIndexOf(list.get()).has(itemId)) {
      const next = (toRaw(list.get()) as readonly T[]).slice();
      next.splice(Math.min(index, next.length), 0, item);
      list.set(next);
    }
    throw error;
  }
};

/**
 * Optimistic removal from a list; the item returns to its original position if
 * the request fails (the previous array reference itself when nothing else
 * changed meanwhile, for a `ListAccess`).
 */
export function optimisticRemove<T extends WithId, R>(
  list: ListAccess<T> | (() => T[]),
  itemId: number | string,
  request: () => Promise<R>,
): Promise<R> {
  return typeof list === "function"
    ? removeInPlace(list, itemId, request)
    : removeCopyOnWrite(list, itemId, request);
}
