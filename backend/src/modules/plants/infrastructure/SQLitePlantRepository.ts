import { query, execute } from "../../../core/database/db";
import type {
  PlantRepository,
  CreatePlantDTO,
  UpdatePlantDTO,
} from "../domain/Plant";
import { Plant } from "../domain/Plant";
import type { SubstrateRef, ImageRef } from "../domain/Plant";

// ── Species helpers ───────────────────────────────────────────────────────────

/**
 * Collapse a species name to a canonical form for fuzzy comparison:
 *   - lower-case
 *   - collapse internal whitespace to a single space
 *   - strip leading/trailing whitespace
 *   - drop common abbreviation dots ("sp." → "sp", "var." → "var")
 */
function normaliseSpecies(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.\s*/g, " ") // "sp." → "sp "
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Iterative Levenshtein distance between two strings.
 * O(m·n) time, O(n) space.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // prev[j] = edit distance between a[0..i-1] and b[0..j-1]
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,       // insertion
        prev[j] + 1,           // deletion
        prev[j - 1] + cost,    // substitution
      );
    }
    prev = curr;
  }
  return prev[n];
}

/**
 * Maximum edit distance allowed for a fuzzy species match.
 * Chosen to catch common single-word typos (≤2 edits) while avoiding
 * false positives between short, genuinely different names.
 *
 * The threshold scales with name length so very short names (e.g. "Aloe")
 * require an exact or near-exact match, and longer binomials get a little
 * more slack:
 *   length  1–4  → max 0  (exact only)
 *   length  5–8  → max 1
 *   length  9–14 → max 2
 *   length 15+   → max 3
 */
function fuzzyThreshold(normalised: string): number {
  const len = normalised.length;
  if (len <= 4) return 0;
  if (len <= 8) return 1;
  if (len <= 14) return 2;
  return 3;
}

/**
 * Looks up a species by name and returns its ID.
 *
 * Matching strategy (in order):
 *  1. Exact match (case-insensitive) — fastest path, covers clean re-submissions.
 *  2. Normalised fuzzy match — compares the incoming name against every
 *     existing species after normalisation (lower-case, collapsed whitespace,
 *     stripped punctuation). If the Levenshtein distance is within the
 *     length-scaled threshold the closest existing entry is reused, preventing
 *     duplicates from single-character typos or minor punctuation differences.
 *  3. Insert — only reached when no sufficiently close match exists.
 *
 * Returns null when the name is falsy.
 */
// ── Species cache ─────────────────────────────────────────────────────────────
//
// The species table is small (hundreds of rows at most) and changes only when
// a genuinely new species is inserted. Keeping a module-level cache means:
//   • normaliseSpecies() is called once per row on first load, then never again
//     for that row until a new insert invalidates the cache.
//   • The fuzzy-matching loop reads from a plain array in memory — no DB round
//     trip, no repeated string transformations per request.
//
// Lifecycle:
//   - null  → not yet loaded; next upsertSpecies() call will populate it.
//   - array → valid; reused for all subsequent calls.
//   - invalidated (set back to null) only when a new species is inserted,
//     so the next call re-reads the now-larger table.

interface SpeciesCacheEntry {
  id: number;
  name: string;       // original casing, used for exact NOCASE comparison
  normalised: string; // pre-computed, used for fuzzy comparison
}

let speciesCache: SpeciesCacheEntry[] | null = null;

/** Load (or reuse) the in-memory species cache. */
function loadSpeciesCache(): SpeciesCacheEntry[] {
  if (speciesCache !== null) return speciesCache;
  const rows = query<{ id: number; name: string }>(
    "SELECT id, name FROM species ORDER BY id",
  );
  speciesCache = rows.map((r) => ({
    id: r.id,
    name: r.name,
    normalised: normaliseSpecies(r.name),
  }));
  return speciesCache;
}

/** Drop the cache so the next call to loadSpeciesCache() re-reads the DB. */
function invalidateSpeciesCache(): void {
  speciesCache = null;
}

/**
 * Looks up a species by name and returns its ID.
 *
 * Matching strategy (in order):
 *  1. Exact match (case-insensitive) against the in-memory cache — zero DB
 *     round trips for the common case of a name that already exists.
 *  2. Normalised fuzzy match — compares pre-computed normalised forms from
 *     the cache. No repeated string transforms per request. If the Levenshtein
 *     distance is within the length-scaled threshold the closest existing entry
 *     is reused, preventing duplicates from single-character typos or minor
 *     punctuation differences.
 *  3. Insert — only when no sufficiently close match exists. Invalidates the
 *     cache so the new row is visible on the next call.
 *
 * Returns null when the name is falsy.
 */
function upsertSpecies(name: string | null | undefined): number | null {
  if (!name) return null;

  const trimmed = name.trim();
  if (!trimmed) return null;

  const cache = loadSpeciesCache();
  const trimmedLower = trimmed.toLowerCase();

  // 1. Exact match (case-insensitive) against the cache — no DB hit
  const exactMatch = cache.find((e) => e.name.toLowerCase() === trimmedLower);
  if (exactMatch) return exactMatch.id;

  // 2. Fuzzy match using pre-normalised cache entries
  const normIncoming = normaliseSpecies(trimmed);
  const threshold = fuzzyThreshold(normIncoming);

  if (threshold > 0) {
    let bestId: number | null = null;
    let bestDist = Infinity;

    for (const entry of cache) {
      const dist = levenshtein(normIncoming, entry.normalised);
      if (dist <= threshold && dist < bestDist) {
        bestDist = dist;
        bestId = entry.id;
        if (dist === 0) break; // normalised-exact match — stop early
      }
    }

    if (bestId !== null) return bestId;
  }

  // 3. No match found — insert as a new species and invalidate the cache
  const result = execute("INSERT INTO species (name) VALUES (?)", [trimmed]);
  invalidateSpeciesCache();
  return result.insertId;
}

type SqlParam = string | number | boolean | null;

// ── Raw DB row ────────────────────────────────────────────────────────────────
interface PlantRow {
  plant_id: number;
  plant_user_id: number;
  plant_name: string;
  plant_species_id: number | null;
  plant_species_name: string | null;
  is_public: number;
  plant_created_at: number;
  substrate_id: number | null;
  substrate_name: string | null;
  image_id: number | null;
  image_url: string | null;
  upload_date: number | null;
}

// ── Base query using consolidated images ───────────────────────────────────────
const BASE_QUERY = `
  SELECT
    p.id            AS plant_id,
    p.user_id       AS plant_user_id,
    p.name          AS plant_name,
    p.species_id    AS plant_species_id,
    p.created_at    AS plant_created_at,
    p.is_public     AS is_public,
    species.name    AS plant_species_name,
    s.id            AS substrate_id,
    s.name          AS substrate_name,
    img.id          AS image_id,
    REPLACE(img.image_url, '\\', '/') AS image_url,
    img.upload_date
  FROM plants p
  LEFT JOIN species           ON p.species_id = species.id
  LEFT JOIN substrates s      ON p.substrate_id = s.id
  LEFT JOIN images img        ON img.entity_type = 'plant' AND img.entity_id = p.id
`;

// ── Repository ───────────────────────────────────────────────────────────────
export class SQLitePlantRepository implements PlantRepository {
  async findAllPublic(): Promise<Plant[]> {
    const rows = query<PlantRow>(
      `${BASE_QUERY} WHERE p.is_public = 1 ORDER BY p.created_at DESC`,
    );
    return this.groupRows(rows);
  }

  async findAllByUser(userId: number): Promise<Plant[]> {
    const rows = query<PlantRow>(
      `${BASE_QUERY} WHERE p.user_id = ? ORDER BY p.created_at DESC`,
      [userId],
    );
    return this.groupRows(rows);
  }

  async findById(id: number): Promise<Plant | null> {
    const rows = query<PlantRow>(`${BASE_QUERY} WHERE p.id = ?`, [id]);
    const plants = this.groupRows(rows);
    return plants[0] ?? null;
  }

  async create(dto: CreatePlantDTO): Promise<number> {
    const speciesId = upsertSpecies(dto.species);
    const result = execute(
      `INSERT INTO plants (name, species_id, substrate_id, is_public, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))`,
      [
        dto.name,
        speciesId,
        dto.substrateId ?? null,
        dto.isPublic ? 1 : 0,
        dto.userId,
      ],
    );

    return result.insertId as number;
  }

  async update(
    id: number,
    userId: number,
    dto: UpdatePlantDTO,
  ): Promise<boolean> {
    const updates: string[] = [];
    const params: SqlParam[] = [];

    if (dto.name !== undefined) {
      updates.push("name = ?");
      params.push(dto.name);
    }
    if (dto.species !== undefined) {
      updates.push("species_id = ?");
      params.push(upsertSpecies(dto.species));
    }
    if (dto.substrateId !== undefined) {
      updates.push("substrate_id = ?");
      params.push(dto.substrateId);
    }
    if (dto.isPublic !== undefined) {
      updates.push("is_public = ?");
      params.push(dto.isPublic ? 1 : 0);
    }

    if (updates.length === 0) return false;

    params.push(id, userId);

    const result = execute(
      `UPDATE plants SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
      params,
    );

    return result.affectedRows > 0;
  }

  async delete(id: number, userId: number): Promise<boolean> {
    const result = execute("DELETE FROM plants WHERE id = ? AND user_id = ?", [
      id,
      userId,
    ]);
    return result.affectedRows > 0;
  }

  // ── Collapse JOIN rows into Plant entities ────────────────────────────────
  private groupRows(rows: PlantRow[]): Plant[] {
    const map = new Map<number, { data: PlantRow; images: ImageRef[] }>();

    for (const row of rows) {
      if (!map.has(row.plant_id)) {
        map.set(row.plant_id, { data: row, images: [] });
      }
      if (row.image_id && row.image_url) {
        map.get(row.plant_id)!.images.push({
          id: row.image_id,
          url: row.image_url,
          date: row.upload_date ?? 0,
        });
      }
    }

    return Array.from(map.values()).map(({ data, images }) => {
      const substrate: SubstrateRef | null = data.substrate_id
        ? {
            substrate_id: data.substrate_id,
            substrate_name: data.substrate_name ?? "",
          }
        : null;

      const latestImage =
        images.length > 0 ? images[images.length - 1].url : null;

      return new Plant({
        plant_id: data.plant_id,
        plant_user_id: data.plant_user_id,
        plant_name: data.plant_name,
        plant_species: data.plant_species_name ?? "Unknown",
        is_public: Boolean(data.is_public),
        plant_created_at: data.plant_created_at,
        image_url: latestImage,
        substrate,
        images,
      });
    });
  }
}
