type EntityType = "plant" | "substrate" | "component";

interface Image {
  id: number;
  url: string;
  date: string;
  date_millis: number;
}

interface AddImage {
  date?: number;
  file: File;
}

interface EditImage {
  date?: number;
  file?: File;
}

/** Raw image object as returned by the V2 API (SQLite backend). */
interface APIImage {
  id: number;
  url: string;
  /** Unix epoch seconds (stored as INTEGER in SQLite); the mappers convert to ms. */
  date: number;
}

/** Image as every list, detail and image endpoint returns it. */
interface APIImageDTO extends APIImage {
  /** "<url160> 160w, <url480> 480w, <url1024> 1024w"; null when the image has no variants. */
  srcset: string | null;
  width: number | null;
  height: number | null;
  /** Dominant colour "#rrggbb" shown until the image loads. */
  placeholder: string | null;
}

/** Frozen frontend image; dates are epoch milliseconds everywhere in the app. */
interface ImageView {
  readonly id: number;
  readonly url: string;
  readonly srcset: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly placeholder: string | null;
  readonly dateMs: number;
}
