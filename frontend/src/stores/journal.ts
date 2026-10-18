/**
 * stores/journal.ts
 *
 * Lets a list that is loaded wholesale (`loadAll`, `loadFirst`) survive local
 * edits made while the load is in flight. Every local commit goes through
 * `commitTracked`, which records what it changed in the open journals of that
 * list; `journaled` replays them onto the loaded list afterwards.
 */

import { toRaw } from "vue";
import { commitList, idIndexOf } from "./optimistic";
import type { PagedState } from "./paged";

type WithNumericId = { id: number };

/** Id to the item a local commit left behind, or null when it removed the item. */
export type Journal<T> = Map<number, T | null>;

/** An edit of a list: the new array, or null when nothing changes. */
export type ListEdit<T> = (list: readonly T[]) => T[] | null;

const journals = new WeakMap<object, Set<Map<number, unknown>>>();

const openJournals = <T extends WithNumericId>(
  target: PagedState<T>,
): Set<Journal<T>> | undefined =>
  journals.get(toRaw(target)) as unknown as Set<Journal<T>> | undefined;

/** Records what a local commit changed in every load of this list that is still in flight. */
const recordChange = <T extends WithNumericId>(
  target: PagedState<T>,
  before: readonly T[],
  after: readonly T[],
): void => {
  const open = openJournals(target);
  if (!open || open.size === 0 || before === after) return;
  const was = idIndexOf(before);
  const now = idIndexOf(after);
  const changes: [number, T | null][] = [];
  for (const [id, item] of now) if (was.get(id) !== item) changes.push([id as number, item]);
  for (const id of was.keys()) if (!now.has(id)) changes.push([id as number, null]);
  for (const journal of open) for (const [id, item] of changes) journal.set(id, item);
};

/** Every local commit to a list goes through here so a load in flight can be reconciled afterwards. */
export const commitTracked = <T extends WithNumericId & object>(
  target: PagedState<T>,
  next: T[],
): void => {
  const before = target.items;
  target.items = commitList(next);
  recordChange(target, before, target.items);
};

/**
 * Runs a load that replaces the list wholesale. Local edits committed while it was in flight
 * (add, edit, delete, summaries, fetched details) are replayed onto the loaded list afterwards.
 */
export const journaled = async <T extends WithNumericId & object>(
  target: PagedState<T>,
  isCurrent: () => boolean,
  load: () => Promise<void>,
  replay: (journal: Journal<T>) => void,
): Promise<void> => {
  const key = toRaw(target);
  let open = openJournals(target);
  if (!open) {
    open = new Set();
    journals.set(key, open as unknown as Set<Map<number, unknown>>);
  }
  const journal: Journal<T> = new Map();
  open.add(journal);
  try {
    const run = load();
    const seq = target.requestSeq;
    await run;
    open.delete(journal);
    if (journal.size > 0 && target.requestSeq === seq && target.status === "ready" && isCurrent()) {
      replay(journal);
    }
  } finally {
    open.delete(journal);
  }
};

export const positionsOf = <T extends WithNumericId>(list: readonly T[]): Map<number, number> => {
  const positions = new Map<number, number>();
  list.forEach((item, at) => {
    if (!positions.has(item.id)) positions.set(item.id, at);
  });
  return positions;
};

/** Journal entries as an edit: changed items replace, removed ones leave, new ones append when allowed. */
export const replaying =
  <T extends WithNumericId>(journal: Journal<T>, append: boolean): ListEdit<T> =>
  (list) => {
    const raw = toRaw(list) as readonly T[];
    const positions = positionsOf(raw);
    const next = raw.slice();
    const removed = new Set<number>();
    const added: T[] = [];
    let changed = false;
    for (const [id, item] of journal) {
      const at = positions.get(id);
      if (at === undefined) {
        if (item && append) {
          added.push(item);
          changed = true;
        }
      } else if (item === null) {
        removed.add(at);
        changed = true;
      } else if (raw[at] !== item) {
        next[at] = item;
        changed = true;
      }
    }
    if (!changed) return null;
    return [...next.filter((_, at) => !removed.has(at)), ...added];
  };
