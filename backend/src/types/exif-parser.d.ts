declare module 'exif-parser' {
  interface ExifTags {
    DateTimeOriginal?: number | string;
    CreateDate?: number | string;
    ModifyDate?: number | string;
    GPSDateStamp?: number | string;
    [key: string]: unknown;
  }

  interface ExifResult {
    tags: ExifTags;
  }

  interface ExifParser {
    parse(): ExifResult;
  }

  export function create(buffer: Buffer | ArrayBuffer): ExifParser;
}