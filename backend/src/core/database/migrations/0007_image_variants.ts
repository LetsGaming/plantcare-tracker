import { sql, type Kysely } from 'kysely';

const STATEMENTS = [
  `ALTER TABLE images ADD COLUMN width INTEGER`,
  `ALTER TABLE images ADD COLUMN height INTEGER`,
  `ALTER TABLE images ADD COLUMN placeholder TEXT`,
  `ALTER TABLE images ADD COLUMN variants INTEGER NOT NULL DEFAULT 0`,
];

export const up = async (db: Kysely<unknown>): Promise<void> => {
  for (const statement of STATEMENTS) {
    await sql.raw(statement).execute(db);
  }
};
