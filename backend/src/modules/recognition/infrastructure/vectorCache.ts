import type { PlantVector } from '../domain/Recognition';

const MAX_USERS = 20;
const TTL_MS = 5 * 60_000;
export const MAX_CACHE_BYTES = 64 * 1024 * 1024;

interface Entry {
  model: string;
  at: number;
  vectors: PlantVector[];
  bytes: number;
}

const entries = new Map<number, Entry>();
let epoch = 0;
let totalBytes = 0;

const byteSize = (vectors: PlantVector[]): number =>
  vectors.reduce((sum, v) => sum + v.vector.byteLength, 0);

const drop = (userId: number): void => {
  const entry = entries.get(userId);
  if (!entry) return;
  totalBytes -= entry.bytes;
  entries.delete(userId);
};

export const cachedVectors = (
  userId: number,
  model: string,
  now = Date.now(),
): PlantVector[] | null => {
  const entry = entries.get(userId);
  if (!entry) return null;
  if (entry.model !== model || now - entry.at > TTL_MS) {
    drop(userId);
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
  drop(userId);
  const bytes = byteSize(vectors);
  if (bytes > MAX_CACHE_BYTES) return;
  for (const [id, entry] of entries) {
    if (now - entry.at > TTL_MS) drop(id);
  }
  entries.set(userId, { model, at: now, vectors, bytes });
  totalBytes += bytes;
  while (entries.size > MAX_USERS || totalBytes > MAX_CACHE_BYTES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    drop(oldest);
  }
};

/** Keeps entries but makes every load that started earlier uncacheable. */
export const bumpEpoch = (): void => {
  epoch++;
};

export const invalidateVectors = (userId: number): void => {
  epoch++;
  drop(userId);
};

/** For delete paths where the owning user is unknown. */
export const clearVectorCache = (): void => {
  epoch++;
  entries.clear();
  totalBytes = 0;
};

export const cachedBytes = (): number => totalBytes;

export const hasCachedVectors = (): boolean => entries.size > 0;
