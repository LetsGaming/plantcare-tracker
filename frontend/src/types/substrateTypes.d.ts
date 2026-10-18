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

/** A single entry in the components array when adding/updating a substrate's mix */
interface BaseSubstrateComponent {
  componentId: number;
  parts: number;
}

// ── V2 API shapes ─────────────────────────────────────────────────────────────

/** One item of GET /substrates (envelope); `created_at` in epoch ms. */
interface APISubstrateListItem {
  id: number;
  name: string;
  user_id: number;
  is_public: boolean;
  created_at: number;
  cover: APIImageDTO | null;
  component_count: number;
}

/** GET /substrates/:id and the POST/PATCH responses (legacy field names); images oldest first. */
interface APISubstrateDetail {
  substrate_id: number;
  substrate_user_id: number;
  substrate_name: string;
  is_public: boolean;
  /** Epoch ms. */
  substrate_created_at: number;
  cover: APIImageDTO | null;
  images: APIImageDTO[];
  components: APISubstrateComponent[];
}

/** Frozen substrate view model; list items and details share it. */
interface SubstrateView {
  readonly id: number;
  readonly name: string;
  readonly userId: number;
  readonly isPublic: boolean;
  /** Epoch ms. */
  readonly createdAt: number;
  readonly cover: ImageView | null;
  readonly componentCount: number;
  /** The mix; null on list items, which only carry `componentCount`. */
  readonly components: readonly SubstrateComponentView[] | null;
  /** Present on details only, oldest first. */
  readonly images?: readonly ImageView[];
  /** Lowercase name for client search. */
  readonly searchText: string;
}
