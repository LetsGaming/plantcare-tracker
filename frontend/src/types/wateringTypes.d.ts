// ─────────────────────────────────────────────────────────────────────────────
// wateringTypes.d.ts
//
// Frontend types for the Watering domain.
//
// V2 API shapes (SQLite backend):
//   - APIWateringRecord: record_id, plant_id, plant_name, owner_id,
//                        watering_date (Unix epoch seconds),
//                        used_fertilizer, fertilizer_type_id (int|null),
//                        fertilizer_type (string|null)
//   - APIFertilizerType: fertilizer_id, fertilizer_name
// ─────────────────────────────────────────────────────────────────────────────

/** Frontend model for a single watering event */
interface WateringRecord {
  id: number;
  /** ID of the plant this record belongs to */
  plantId: number;
  /** Display name of the plant (included in V2 responses for calendar rendering) */
  plantName: string;
  /** Human-readable local date string */
  date: string;
  /** Epoch milliseconds for sorting and calendar rendering */
  date_millis: number;
  usedFertilizer: boolean;
  fertilizerTypeId?: number;
  /** Resolved display name of the fertilizer type, or undefined if unused */
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
 * Raw watering record as returned by the V2 API (SQLite backend).
 * watering_date is a Unix epoch integer (seconds) — NOT an ISO date string.
 */
interface APIWateringRecord {
  record_id: number;
  plant_id: number;
  /** Included in V2 to enable calendar rendering without additional plant lookups */
  plant_name: string;
  /** Unix epoch seconds stored by SQLite */
  watering_date: number;
  used_fertilizer: boolean;
  fertilizer_type_id: number | null;
  /** Resolved name from fertilizer_types table, null if no fertilizer used */
  fertilizer_type: string | null;
  /** Owner user ID — for permission checks on mutations */
  owner_id: number;
}

/** One record of GET /watering/plant/:plantId and of the write responses; date in epoch ms. */
interface APIWateringItem {
  id: number;
  plant_id: number;
  date: number;
  used_fertilizer: boolean;
  fertilizer_type_id: number | null;
}

/** Per-plant watering aggregates; epoch ms or null. */
interface APIWateringSummary {
  last_watered_at: number | null;
  last_fertilized_at: number | null;
  /** Null with fewer than two distinct local watering days. */
  avg_interval_days: number | null;
}

/** POST /watering/:plantId (201) and PATCH /watering/:id (200). */
interface APIWateringRecordResponse {
  record: APIWateringItem;
  summary: APIWateringSummary;
}

/** DELETE /watering/:id (200). */
interface APIWateringDeleteResponse {
  summary: APIWateringSummary;
}

/** Keys are plant ids as strings; a plant deleted meanwhile has no key. */
type APIWateringSummaries = Record<string, APIWateringSummary>;

/** POST /watering/batch (201). */
interface APIWateringBatchResponse {
  records: APIWateringItem[];
  summaries: APIWateringSummaries;
}

/** POST /watering/batch/delete (200). */
interface APIWateringBatchDeleteResponse {
  summaries: APIWateringSummaries;
}

/** Frozen watering record; `date` is epoch ms. */
interface WateringEntry {
  readonly id: number;
  readonly plantId: number;
  readonly date: number;
  readonly usedFertilizer: boolean;
  readonly fertilizerTypeId: number | null;
}

/** Frozen per-plant watering aggregates; epoch ms or null. */
interface WateringSummary {
  readonly lastWateredAt: number | null;
  readonly lastFertilizedAt: number | null;
  readonly avgIntervalDays: number | null;
}

/** Raw fertilizer type as returned by GET /watering/fertilizer-types */
interface APIFertilizerType {
  fertilizer_id: number;
  fertilizer_name: string;
}
