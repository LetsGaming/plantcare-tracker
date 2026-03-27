// ─────────────────────────────────────────────────────────────────────────────
// substrateTypes.d.ts
//
// Frontend types for the Substrates domain.
//
// V2 API shape (SubstrateData from backend):
//   substrate_id, substrate_user_id, substrate_name,
//   is_public (boolean), substrate_created_at,
//   image_url (string|null), images[], components[]
// ─────────────────────────────────────────────────────────────────────────────

/** Frontend model for a substrate entity */
interface Substrate {
  id: number;
  userId: number;
  name: string;
  isPublic: boolean;
  /** ISO date string, converted to local display format by mapper */
  created_at: string;
  imageUrl?: string;
  images: Image[];
  components: SubstrateComponent[];
}

/** Payload for creating a new substrate */
interface AddSubstrate {
  name: string;
  isPublic?: boolean;
  image?: File;
}

/**
 * Payload for updating substrate metadata.
 * V2 PATCH /substrates/:id accepts name, isPublic, and removedComponents
 * in a single request.
 */
interface EditSubstrate {
  name?: string;
  isPublic?: boolean;
  /** Component IDs to remove from the substrate mix */
  removedComponents?: number[];
}

/** A single entry in the components array when adding/updating a substrate's mix */
interface BaseSubstrateComponent {
  componentId: number;
  parts: number;
}

/** Payload body for POST /substrates/components/:id */
interface AddSubstrateComponents {
  components: BaseSubstrateComponent[];
}

/** Payload body for PATCH /substrates/components/:id */
interface EditSubstrateComponent extends BaseSubstrateComponent {}

// ── V2 API shapes ─────────────────────────────────────────────────────────────

/**
 * Raw substrate object as returned by the V2 API.
 * Matches SubstrateData from backend src-v2/modules/substrate/domain/Substrate.ts
 */
interface APISubstrate {
  substrate_id: number;
  substrate_user_id: number;
  substrate_name: string;
  /** V2 returns boolean (not 0/1) — is_public from MySQL normalized by repo */
  is_public: boolean;
  substrate_created_at: number;
  image_url: string | null;
  images: APIImage[];
  components: APISubstrateComponent[];
}
