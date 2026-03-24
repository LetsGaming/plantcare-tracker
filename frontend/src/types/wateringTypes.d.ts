// ─────────────────────────────────────────────────────────────────────────────
// wateringTypes.d.ts
//
// Frontend types for the Watering domain.
//
// V2 API shapes:
//   - APIWateringRecord: record_id, plant_id, plant_name, owner_id,
//                        watering_date, used_fertilizer,
//                        fertilizer_type_id (int|null), fertilizer_type (string|null)
//   - APIFertilizerType: fertilizer_id, fertilizer_name
// ─────────────────────────────────────────────────────────────────────────────

/** Frontend model for a single watering event */
interface WateringRecord {
  id: number;
  /** Human-readable local date string */
  date: string;
  /** Epoch milliseconds for sorting and calendar rendering */
  date_millis: number;
  usedFertilizer: boolean;
  fertilizerTypeId?: number;
  /** Resolved display name of the fertilizer type, or "Unbekannt" if unknown */
  fertilizerType?: string;
}

/** Payload for creating a watering record */
interface AddWateringRecord {
  /** Optional — server defaults to now() */
  date?: number;
  usedFertilizer: boolean;
  fertilizerTypeId?: number | null;
}

/** Payload for updating a watering record */
interface EditWateringRecord {
  date?: number;
  usedFertilizer: boolean;
  fertilizerTypeId?: number | null;
}

/** Frontend model for a fertilizer type option */
interface FertilizerType {
  id: number;
  name: string;
}

// ── V2 API shapes ─────────────────────────────────────────────────────────────

/**
 * Raw watering record as returned by the V2 API.
 * Matches the query result from MySQLWateringRepository.findByPlant().
 */
interface APIWateringRecord {
  record_id: number;
  plant_id: number;
  /** Included in V2 to enable calendar rendering without additional plant lookups */
  plant_name: string;
  /** MySQL DATETIME string */
  watering_date: number;
  used_fertilizer: boolean;
  fertilizer_type_id: number | null;
  /** Resolved name from fertilizer_types table, null if no fertilizer used */
  fertilizer_type: string | null;
  /** Owner user ID — for permission checks on mutations */
  owner_id: number;
}

/** Raw fertilizer type as returned by GET /watering/fertilizer-types */
interface APIFertilizerType {
  fertilizer_id: number;
  fertilizer_name: string;
}
