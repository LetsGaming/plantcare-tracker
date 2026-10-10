import { ensureContrast, readableInk } from "./contrast";

export const DEFAULT_WATERING_TOKENS: Record<string, string> = {
  "watering.category.no_fertilizer": "--water",
  "watering.category.organic": "--feed-organic",
  "watering.category.mineral": "--feed-mineral",
};

export interface ResolvedCategoryColors {
  background: string;
  text: string;
}

/** A readable text color for a category background, derived from its luminance. */
export const contrastTextColor = (backgroundHex: string): string => readableInk(backgroundHex);

/**
 * Colors to paint a category with. An empty background means "use the role
 * token"; a user color is lifted until it stands out from the page. The ink is
 * always derived, a stored textColor is ignored.
 */
export const resolveCategoryColors = (
  category: Category,
  tokens: { fallback: string; page: string },
): ResolvedCategoryColors => {
  const background = category.backgroundColor
    ? ensureContrast(category.backgroundColor, tokens.page, 3)
    : tokens.fallback;
  return { background, text: contrastTextColor(background) };
};

/** True when `name` is empty or already used by another category (case-insensitive). */
export const categoryNameProblem = (
  name: string,
  others: readonly string[],
): "empty" | "duplicate" | null => {
  const trimmed = name.trim();
  if (!trimmed) return "empty";
  const lower = trimmed.toLowerCase();
  return others.some((other) => other.trim().toLowerCase() === lower) ? "duplicate" : null;
};
