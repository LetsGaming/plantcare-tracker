// ─────────────────────────────────────────────────────────────────────────────
// plantTypes.d.ts
//
// Frontend types for the Plants domain.
//
// V2 API shape (PlantData from backend):
//   plant_id, plant_user_id, plant_name, plant_species,
//   is_public (boolean), plant_created_at,
//   image_url (string|null), substrate (SubstrateRef|null), images[]
//
// Note: plant_description is NOT a V2 field. The species is used as fallback.
// Note: substrate in V2 is a lightweight SubstrateRef { substrate_id, substrate_name },
//       not a full SubstrateData object. The full substrate must be fetched separately.
// ─────────────────────────────────────────────────────────────────────────────

/** Frontend model for a plant entity */
interface Plant {
  id: number;
  userId: number;
  name: string;
  species: string;
  /** Falls back to species if no separate description exists */
  description: string;
  isPublic: boolean;
  /** ISO date converted to local display format by mapper */
  created_at: string;
  imageUrl?: string;
  /** Lightweight substrate reference; may be null if plant has no substrate */
  substrate: PlantSubstrateRef | null;
  images: Image[];
}

/**
 * Lightweight substrate reference embedded in plant responses.
 * V2 returns only { substrate_id, substrate_name } — not the full Substrate.
 */
interface PlantSubstrateRef {
  id: number;
  name: string;
}

/** Payload for creating a new plant */
interface AddPlant {
  name: string;
  species: string;
  substrateId: number;
  isPublic?: boolean;
  image?: File;
}

/** Payload for updating a plant */
interface EditPlant {
  name?: string;
  species?: string;
  substrateId?: number;
  isPublic?: boolean;
}

// ── V2 API shapes ─────────────────────────────────────────────────────────────

/**
 * Raw plant object as returned by the V2 API.
 * Matches PlantData from backend src-v2/modules/plants/domain/Plant.ts
 */
interface APIPlant {
  plant_id: number;
  plant_user_id: number;
  plant_name: string;
  plant_species: string;
  /** V2 returns boolean (not 0/1) */
  is_public: boolean;
  plant_created_at: number;
  image_url: string | null;
  /** Lightweight reference — not a full SubstrateData; null if unassigned */
  substrate: APISubstrateRef | null;
  images: APIImage[];
}

/** Lightweight substrate reference embedded in plant API responses */
interface APISubstrateRef {
  substrate_id: number;
  substrate_name: string;
}
