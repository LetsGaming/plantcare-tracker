import type { PlantVector } from '../domain/Recognition';

const MAX_USERS = 20;
const TTL_MS = 5 * 60_000;

interface Entry {
  model: string;
  at: number;
  vectors: PlantVector[];
}

const entries = new Map<number, Entry>();
let epoch = 0;

export const cachedVectors = (
  userId: number,
  model: string,
  now = Date.now(),
): PlantVector[] | null => {
  const entry = entries.get(userId);
  if (!entry) return null;
  if (entry.model !== model || now - entry.at > TTL_MS) {
    entries.delete(userId);
    return null;
  }
  entries.delete(userId);
  entries.set(userId, entry);
  return entry.vectors;
};

export const currentEpoch = (): number => epoch;

/** Stores the vectors unless an invalidation happened since `loadedAt`, so a racing store is never cached stale. */
export const cacheVectors = (
  userId: number,
  model: string,
  vectors: PlantVector[],
  loadedAt: number,
  now = Date.now(),
): void => {
  if (loadedAt !== epoch) return;
  entries.delete(userId);
  entries.set(userId, { model, at: now, vectors });
  while (entries.size > MAX_USERS) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
};

export const invalidateVectors = (userId: number): void => {
  epoch++;
  entries.delete(userId);
};

export const clearVectorCache = (): void => {
  epoch++;
  entries.clear();
};

export const hasCachedVectors = (): boolean => entries.size > 0;
