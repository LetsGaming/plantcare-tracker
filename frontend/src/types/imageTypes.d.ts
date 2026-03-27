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
  /** Unix epoch seconds — stored as INTEGER in SQLite. Use Utils.convertToMillis() to get ms. */
  date: number;
}