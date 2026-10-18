export const NO_FERTILIZER_CATEGORY = "watering.category.no_fertilizer";
export const ORGANIC_CATEGORY = "watering.category.organic";
export const MINERAL_CATEGORY = "watering.category.mineral";

export const WATERING_CATEGORY_NAMES: readonly string[] = [
  NO_FERTILIZER_CATEGORY,
  ORGANIC_CATEGORY,
  MINERAL_CATEGORY,
];

const SYNTHETIC_TYPE_NAME = "synthetic";

export type MarkerKind = "water" | "organic" | "mineral";

/** Category of a watering record; `typeName` is the name of its fertilizer type, when known. */
export const recordCategory = (
  record: { usedFertilizer: boolean },
  typeName: string | undefined,
): string => {
  if (!record.usedFertilizer) return NO_FERTILIZER_CATEGORY;
  return typeName === SYNTHETIC_TYPE_NAME ? MINERAL_CATEGORY : ORGANIC_CATEGORY;
};

/** Strongest watering marker among the category names of one day: mineral, then organic, then water. */
export const markerKind = (categoryNames: Iterable<string>): MarkerKind => {
  const names = new Set(categoryNames);
  if (names.has(MINERAL_CATEGORY)) return "mineral";
  if (names.has(ORGANIC_CATEGORY)) return "organic";
  return "water";
};
