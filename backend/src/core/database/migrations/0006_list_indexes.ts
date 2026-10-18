import { sql, type Kysely } from 'kysely';

const STATEMENTS = [
  `DROP INDEX IF EXISTS idx_plants_list`,
  `DROP INDEX IF EXISTS idx_images_lookup`,
  `CREATE INDEX IF NOT EXISTS idx_images_lookup ON images(entity_type, entity_id, upload_date, id)`,
  `CREATE INDEX IF NOT EXISTS idx_plants_user_created ON plants(user_id, created_at DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_plants_user_name ON plants(user_id, name COLLATE NOCASE, id)`,
  `CREATE INDEX IF NOT EXISTS idx_plants_public_created ON plants(created_at DESC, id DESC) WHERE is_public = 1`,
  `CREATE INDEX IF NOT EXISTS idx_plants_public_name ON plants(name COLLATE NOCASE, id) WHERE is_public = 1`,
  `CREATE INDEX IF NOT EXISTS idx_plants_substrate ON plants(substrate_id) WHERE substrate_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_substrates_user_created ON substrates(user_id, created_at DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_substrates_user_name ON substrates(user_id, name COLLATE NOCASE, id)`,
  `CREATE INDEX IF NOT EXISTS idx_substrates_public_created ON substrates(created_at DESC, id DESC) WHERE is_public = 1`,
  `CREATE INDEX IF NOT EXISTS idx_substrates_public_name ON substrates(name COLLATE NOCASE, id) WHERE is_public = 1`,
  `CREATE INDEX IF NOT EXISTS idx_substrate_components_component ON substrate_components(component_id)`,
  `CREATE INDEX IF NOT EXISTS idx_components_name ON components(name COLLATE NOCASE, id)`,
];

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await db.transaction().execute(async (trx) => {
    for (const statement of STATEMENTS) {
      await sql.raw(statement).execute(trx);
    }
  });
};
