import { sql, type Kysely } from 'kysely';

const STATEMENTS = [
  `CREATE TABLE sales_items (
    sale_id TEXT PRIMARY KEY,
    source_key TEXT NOT NULL,
    seller TEXT NOT NULL,
    name TEXT NOT NULL,
    link TEXT NOT NULL,
    image_url TEXT,
    old_price REAL,
    new_price REAL NOT NULL,
    discount_pct INTEGER,
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    scraped_at INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE INDEX idx_sales_active_first_seen ON sales_items(first_seen_at DESC, sale_id DESC) WHERE active = 1`,
  `CREATE INDEX idx_sales_source ON sales_items(source_key, active)`,
  `CREATE INDEX idx_sales_inactive_seen ON sales_items(last_seen_at) WHERE active = 0`,
  `CREATE TABLE sales_price_points (
    sale_id TEXT NOT NULL REFERENCES sales_items(sale_id) ON DELETE CASCADE,
    observed_at INTEGER NOT NULL,
    price REAL NOT NULL,
    PRIMARY KEY (sale_id, observed_at)
  ) WITHOUT ROWID`,
  `CREATE TABLE sales_source_state (
    source_key TEXT PRIMARY KEY,
    last_attempt_at INTEGER,
    last_success_at INTEGER,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    next_due_at INTEGER
  )`,
];

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await db.transaction().execute(async (trx) => {
    for (const statement of STATEMENTS) {
      await sql.raw(statement).execute(trx);
    }
  });
};
