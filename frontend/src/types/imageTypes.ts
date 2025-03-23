interface Image {
  id: number;
  url: string;
  date: string;
}

interface AddImage {
  date?: number;
  file: File;
}

interface EditImage {
  date?: number;
  file?: File;
}
