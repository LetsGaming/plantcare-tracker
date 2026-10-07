/**
 * modules/plants/domain/SpeciesResolver.ts
 *
 * Maps a free-text species name to a catalogue entry, reusing an existing
 * entry when the name matches it exactly (ignoring case) or is within a
 * small edit distance after normalisation, so typos and punctuation
 * differences do not create duplicate species.
 */

export interface SpeciesEntry {
  id: number;
  name: string;
}

/** Persistence port for the species catalogue. */
export interface SpeciesCatalog {
  all(): SpeciesEntry[];
  add(name: string): number;
}

interface IndexedSpecies extends SpeciesEntry {
  lower: string;
  normalised: string;
}

/**
 * Collapse a species name to a canonical form for fuzzy comparison:
 * lower-case, abbreviation dots dropped ("sp." becomes "sp"), whitespace
 * collapsed and trimmed.
 */
export const normaliseSpecies = (name: string): string =>
  name.toLowerCase().replace(/\.\s*/g, ' ').replace(/\s+/g, ' ').trim();

/** Iterative Levenshtein distance, O(m*n) time and O(n) space. */
export const levenshtein = (a: string, b: string): number => {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
};

/**
 * Maximum edit distance allowed for a fuzzy match. It scales with the name
 * length so short names such as "Aloe" need an exact match:
 * 1 to 4 characters: 0, 5 to 8: 1, 9 to 14: 2, 15 and more: 3.
 */
export const fuzzyThreshold = (normalised: string): number => {
  const len = normalised.length;
  if (len <= 4) return 0;
  if (len <= 8) return 1;
  if (len <= 14) return 2;
  return 3;
};

export class SpeciesResolver {
  /** Null until first use and after an insert, so the next call re-reads the catalogue. */
  private index: IndexedSpecies[] | null = null;

  constructor(private readonly catalog: SpeciesCatalog) {}

  /**
   * Returns the id of the matching species, inserting a new one when no
   * existing entry is close enough. Blank names resolve to null.
   */
  resolve(name: string | null | undefined): number | null {
    const trimmed = name?.trim();
    if (!trimmed) return null;

    const index = this.load();
    const lower = trimmed.toLowerCase();
    const exact = index.find((entry) => entry.lower === lower);
    if (exact) return exact.id;

    const normalised = normaliseSpecies(trimmed);
    const threshold = fuzzyThreshold(normalised);
    if (threshold > 0) {
      let bestId: number | null = null;
      let bestDistance = Infinity;
      for (const entry of index) {
        const distance = levenshtein(normalised, entry.normalised);
        if (distance <= threshold && distance < bestDistance) {
          bestDistance = distance;
          bestId = entry.id;
          if (distance === 0) break;
        }
      }
      if (bestId !== null) return bestId;
    }

    const id = this.catalog.add(trimmed);
    this.index = null;
    return id;
  }

  private load(): IndexedSpecies[] {
    this.index ??= this.catalog.all().map((entry) => ({
      ...entry,
      lower: entry.name.toLowerCase(),
      normalised: normaliseSpecies(entry.name),
    }));
    return this.index;
  }
}
