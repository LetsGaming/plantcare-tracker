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

interface APIImage {
  id: number;
  url: string;
  date: string;
}