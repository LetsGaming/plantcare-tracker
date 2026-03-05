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

  function create(buffer: Buffer): ExifParser;
  export = create;
}
