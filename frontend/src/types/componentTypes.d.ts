// ─────────────────────────────────────────────────────────────────────────────
// componentTypes.d.ts
//
// Frontend types for the Components domain.
//
// V2 API shape (ComponentData from backend):
//   component_id, component_name, fineness_id, component_fineness,
//   image_url (string|null), images[]
//
// Note: component_description was a V1 artifact — it does not exist in V2.
//       The fineness name (component_fineness) is used as the description.
// ─────────────────────────────────────────────────────────────────────────────

/** Frontend model for a soil/substrate component */
interface Component {
  id: number;
  name: string;
  /** Fineness level ID — references fineness_levels table */
  finenessId: number;
  /** Human-readable fineness label, e.g. "Fine", "Coarse" */
  fineness: string;
  imageUrl?: string;
}

/** A component as it appears within a substrate, including mix ratio */
interface SubstrateComponent extends Omit<Component, "finenessId"> {
  /** Fineness name used as the component's description in substrate context */
  description: string;
  /** Parts by volume in the substrate mix */
  parts: number;
}

/** Payload for creating a new component (admin only) */
interface AddComponent extends Omit<Component, "id" | "fineness"> {
  /** Fineness level ID — references fineness_levels table */
  image?: File;
}

/** Payload for updating a component (admin only) */
interface EditComponent {
  name?: string;
  /** Fineness level ID */
  fineness?: number;
}

// ── V2 API shapes ─────────────────────────────────────────────────────────────

/** Raw component object as returned by GET /components and GET /components/component/:id */
interface APIComponent {
  component_id: number;
  component_name: string;
  fineness_id: number;
  /** Resolved fineness label (e.g. "Fine") — previously component_fineness in V1 */
  component_fineness: string;
  image_url: string | null;
  images: APIImage[];
}

/**
 * A component reference embedded inside a substrate response.
 * V2 SubstrateData.components — no separate `component_description` field.
 */
interface APISubstrateComponent {
  component_id: number;
  component_name: string;
  component_fineness: string;
  component_parts: number;
}

/** One item of GET /components (envelope). */
interface APIComponentListItem {
  id: number;
  name: string;
  fineness_id: number;
  fineness_name: string;
  cover: APIImageDTO | null;
}

/** GET /components/:id and the POST/PUT responses; images oldest first. */
interface APIComponentDetail extends APIComponentListItem {
  images: APIImageDTO[];
}

/**
 * Frozen component view model for the catalogue (list and detail) and for the
 * components embedded in a substrate, which carry no fineness id and no images.
 */
interface ComponentView {
  readonly id: number;
  readonly name: string;
  /** Null for components embedded in a substrate. */
  readonly finenessId: number | null;
  /** Fineness name, e.g. "Fine". */
  readonly fineness: string;
  readonly cover: ImageView | null;
  /** Present on details only, oldest first. */
  readonly images?: readonly ImageView[];
  /** Lowercase name and fineness, newline separated, for client search. */
  readonly searchText: string;
}

/** A component inside a substrate mix. */
interface SubstrateComponentView extends ComponentView {
  /** Parts by volume in the mix. */
  readonly parts: number;
}

/** Fineness level as returned by GET /components/fineness-levels */
interface APIFinenessLevel {
  fineness_id: number;
  fineness_name: string;
}
