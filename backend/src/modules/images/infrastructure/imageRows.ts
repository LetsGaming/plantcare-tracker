import { toPublicImageUrl } from '../../../core/config';
import { toImageDto, type ImageDTO } from '../domain/imageDto';

/** Columns every module selects from `images` to build image DTOs. */
export const IMAGE_COLUMNS = [
  'id',
  'image_url',
  'upload_date',
  'variants',
  'width',
  'height',
  'placeholder',
] as const;

export interface ImageRow {
  id: number;
  image_url: string;
  upload_date: number;
  variants: number;
  width: number | null;
  height: number | null;
  placeholder: string | null;
}

export const imageRowToDto = (row: ImageRow): ImageDTO =>
  toImageDto({
    id: row.id,
    url: toPublicImageUrl(row.image_url),
    date: row.upload_date,
    variants: row.variants,
    width: row.width,
    height: row.height,
    placeholder: row.placeholder,
  });
