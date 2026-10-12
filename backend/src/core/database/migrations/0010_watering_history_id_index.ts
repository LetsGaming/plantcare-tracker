import { sql, type Kysely } from 'kysely';

const STATEMENTS = [
  'DROP INDEX IF EXISTS idx_watering_history',
  'CREATE INDEX idx_watering_history ON watering_records(plant_id, date DESC, id DESC)',
];

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await db.transaction().execute(async (trx) => {
    for (const statement of STATEMENTS) {
      await sql.raw(statement).execute(trx);
    }
  });
};
