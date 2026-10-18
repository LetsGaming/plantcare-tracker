import { sql, type Kysely } from 'kysely';

const STATEMENTS = [
  `CREATE TABLE sessions (
    sid TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX idx_sessions_user_created ON sessions(user_id, created_at)`,
  `CREATE INDEX idx_sessions_expires ON sessions(expires_at)`,
];

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await db.transaction().execute(async (trx) => {
    for (const statement of STATEMENTS) {
      await sql.raw(statement).execute(trx);
    }
  });
};
