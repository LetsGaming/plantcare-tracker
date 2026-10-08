/**
 * Stores image URLs without their origin ("/uploads/plant/a.webp") so the host
 * can change without rewriting rows; responses add the origin on read.
 * Windows separators written by older releases are normalised on the way.
 */

import { sql, type Kysely } from 'kysely';

const BACKSLASH = String.fromCharCode(92);

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await sql`
    UPDATE images SET image_url = REPLACE(image_url, ${BACKSLASH}, '/')
    WHERE INSTR(image_url, ${BACKSLASH}) > 0
  `.execute(db);
  await sql`
    UPDATE images
    SET image_url = SUBSTR(image_url, INSTR(image_url, '/uploads/'))
    WHERE image_url LIKE 'http%' AND INSTR(image_url, '/uploads/') > 0
  `.execute(db);
};
