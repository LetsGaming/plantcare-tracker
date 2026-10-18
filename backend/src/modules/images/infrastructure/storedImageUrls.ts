import { getSqlite } from '../../../core/database/db';

/** Streams the url of every image row. */
export const allStoredImageUrls = (): Iterable<string> =>
  getSqlite().prepare<[], string>('SELECT image_url FROM images').pluck().iterate();
