import { isProxy, toRaw } from "vue";

type WithId = { id: number | string };

const snapshotOf = <T>(item: T): T => {
  const raw = isProxy(item) ? toRaw(item) : item;
  try {
    return structuredClone(raw);
  } catch {
    return JSON.parse(JSON.stringify(raw));
  }
};

/**
 * Optimistic upsert on a reactive list. The expected item is painted
 * immediately (give creates a temporary negative id), the request runs, and
 * `reconcile` swaps the item for the server's version in place. On failure
 * only this item is restored (or removed), so concurrent changes to other
 * items survive. Returns the raw response.
 */
export const optimisticUpsert = async <T extends WithId, R>(
  list: () => T[],
  optimisticItem: T,
  request: () => Promise<R>,
  reconcile: (response: R) => T,
): Promise<R> => {
  const existing = list().find((item) => item.id === optimisticItem.id);
  const snapshot = existing ? snapshotOf(existing) : null;

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

/**
 * Optimistic removal from a reactive list; the item returns to its original
 * position if the request fails.
 */
export const optimisticRemove = async <T extends WithId, R>(
  list: () => T[],
  itemId: number | string,
  request: () => Promise<R>,
): Promise<R> => {
  const index = list().findIndex((item) => item.id === itemId);
  const snapshot = index === -1 ? null : snapshotOf(list()[index]);
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
