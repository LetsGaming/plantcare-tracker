/** One embedding vector (Float32 little-endian BLOB) per plant image and model. */

import { sql, type Kysely } from 'kysely';

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await sql`CREATE TABLE image_embeddings (
    image_id INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    vector BLOB NOT NULL
  )`.execute(db);
};
