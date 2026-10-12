import { variantUrl } from '../../../core/config/uploads';

const WEBP_URL = /\.webp$/i;

export interface ImageDTO {
  id: number;
  url: string;
  srcset: string | null;
  width: number | null;
  height: number | null;
  placeholder: string | null;
  date: number;
}

export interface ImageDtoSource {
  id: number;
  url: string;
  date: number;
  variants: number;
  width: number | null;
  height: number | null;
  placeholder: string | null;
}

export const toImageDto = (row: ImageDtoSource): ImageDTO => ({
  id: row.id,
  url: row.url,
  srcset:
    row.variants === 1 && WEBP_URL.test(row.url)
      ? `${variantUrl(row.url, 160)} 160w, ${variantUrl(row.url, 480)} 480w, ${row.url} 1024w`
      : null,
  width: row.width,
  height: row.height,
  placeholder: row.placeholder,
  date: row.date,
});
