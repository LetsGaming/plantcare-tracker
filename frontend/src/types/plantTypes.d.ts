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
  /** Null when the plant has no species; views print a localized label instead. */
  species: string | null;
  /** The species, or empty when there is none */
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
  species?: string;
  substrateId: number | null;
  isPublic?: boolean;
  image?: File;
}

/** Payload for updating a plant; an empty or null species and a null substrateId clear the field */
interface EditPlant {
  name?: string;
  species?: string | null;
  substrateId?: number | null;
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
  plant_species: string | null;
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

/** One item of GET /plants (envelope); `created_at` in epoch ms. */
interface APIPlantListItem {
  plant_id: number;
  plant_name: string;
  user_id: number;
  is_public: boolean;
  created_at: number;
  species_name: string | null;
  substrate: APISubstrateRef | null;
  cover: APIImageDTO | null;
  image_count: number;
  /** Only for the owner (scope=mine and the owner's detail); null otherwise. */
  watering: APIWateringSummary | null;
}

/** GET /plants/:id and the POST/PATCH responses; images oldest first. */
interface APIPlantDetail extends APIPlantListItem {
  images: APIImageDTO[];
}

/** Frozen plant view model shared by lists and details. */
interface PlantView {
  readonly id: number;
  readonly name: string;
  readonly userId: number;
  readonly isPublic: boolean;
  /** Epoch ms. */
  readonly createdAt: number;
  readonly speciesName: string | null;
  readonly substrate: Readonly<PlantSubstrateRef> | null;
  readonly cover: ImageView | null;
  readonly imageCount: number;
  /** Null for plants of others and before the owner's summary is known. */
  readonly watering: WateringSummary | null;
  /** Present on details only, oldest first. */
  readonly images?: readonly ImageView[];
  /** Lowercase name and species, newline separated, for client search. */
  readonly searchText: string;
}
