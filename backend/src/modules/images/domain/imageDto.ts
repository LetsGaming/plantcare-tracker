export interface ImageDTO {
  id: number;
  url: string;
  srcset: string | null;
  width: number | null;
  height: number | null;
  placeholder: string | null;
  date: number;
}
