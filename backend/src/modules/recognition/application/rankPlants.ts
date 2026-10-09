import type { PlantMatch, PlantVector } from '../domain/Recognition';

export const l2normalize = (vector: Float32Array): Float32Array => {
  let sum = 0;
  for (const x of vector) sum += x * x;
  const norm = Math.sqrt(sum) || 1;
  return vector.map((x) => x / norm);
};

const dot = (a: Float32Array, b: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};

export const rankPlants = (
  query: Float32Array,
  vectors: PlantVector[],
  limit = 5,
): PlantMatch[] => {
  const best = new Map<number, number>();
  for (const { plantId, vector } of vectors) {
    if (vector.length !== query.length) continue;
    const score = dot(query, vector);
    if (score > (best.get(plantId) ?? -Infinity)) best.set(plantId, score);
  }
  return [...best]
    .map(([plantId, score]) => ({ plantId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};
