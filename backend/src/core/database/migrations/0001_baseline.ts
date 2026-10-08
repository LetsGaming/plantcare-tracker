/**
 * Baseline schema. Every statement is idempotent so the migration can be
 * recorded on databases that were created before migrations existed.
 */

import { sql, type Kysely } from 'kysely';

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS roles (
     id   INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL UNIQUE COLLATE NOCASE
   )`,
  `CREATE TABLE IF NOT EXISTS users (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
     password    TEXT NOT NULL,
     role_id     INTEGER NOT NULL DEFAULT 3,
     created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
     FOREIGN KEY (role_id) REFERENCES roles(id)
   )`,
  `CREATE TABLE IF NOT EXISTS species (
     id   INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL UNIQUE COLLATE NOCASE
   )`,
  `CREATE TABLE IF NOT EXISTS fineness_levels (
     id   INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL UNIQUE
   )`,
  `CREATE TABLE IF NOT EXISTS components (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     name        TEXT NOT NULL,
     fineness_id INTEGER NOT NULL,
     FOREIGN KEY (fineness_id) REFERENCES fineness_levels(id)
   )`,
  `CREATE TABLE IF NOT EXISTS substrates (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     name        TEXT NOT NULL,
     user_id     INTEGER NOT NULL,
     is_public   INTEGER NOT NULL DEFAULT 0,
     created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
     FOREIGN KEY (user_id) REFERENCES users(id)
   )`,
  `CREATE TABLE IF NOT EXISTS plants (
     id           INTEGER PRIMARY KEY AUTOINCREMENT,
     name         TEXT NOT NULL,
     species_id   INTEGER,
     substrate_id INTEGER,
     user_id      INTEGER NOT NULL,
     is_public    INTEGER NOT NULL DEFAULT 0,
     created_at   INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
     FOREIGN KEY (species_id)   REFERENCES species(id) ON DELETE SET NULL,
     FOREIGN KEY (substrate_id) REFERENCES substrates(id) ON DELETE SET NULL,
     FOREIGN KEY (user_id)      REFERENCES users(id) ON DELETE CASCADE
   )`,
  `CREATE TABLE IF NOT EXISTS images (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     image_url   TEXT NOT NULL,
     entity_type TEXT NOT NULL CHECK(entity_type IN ('plant', 'substrate', 'component')),
     entity_id   INTEGER NOT NULL,
     upload_date INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
   )`,
  `CREATE TABLE IF NOT EXISTS fertilizer_types (
     id   INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL UNIQUE
   )`,
  `CREATE TABLE IF NOT EXISTS watering_records (
     id                 INTEGER PRIMARY KEY AUTOINCREMENT,
     plant_id           INTEGER NOT NULL,
     date               INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
     used_fertilizer    INTEGER NOT NULL DEFAULT 0,
     fertilizer_type_id INTEGER,
     FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE,
     FOREIGN KEY (fertilizer_type_id) REFERENCES fertilizer_types(id)
   )`,
  `CREATE TABLE IF NOT EXISTS substrate_components (
     substrate_id INTEGER NOT NULL,
     component_id INTEGER NOT NULL,
     parts        REAL NOT NULL,
     PRIMARY KEY (substrate_id, component_id),
     FOREIGN KEY (substrate_id) REFERENCES substrates(id) ON DELETE CASCADE,
     FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
   ) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS scrape_source_health (
     source_key           TEXT PRIMARY KEY,
     kind                 TEXT NOT NULL CHECK (kind IN ('sales', 'search')),
     seller               TEXT NOT NULL,
     status               TEXT NOT NULL CHECK (status IN ('ok', 'degraded', 'failing', 'unknown')),
     active_strategy      TEXT,
     last_item_count      INTEGER,
     consecutive_failures INTEGER NOT NULL DEFAULT 0,
     last_success_at      TEXT,
     last_failure_at      TEXT,
     last_error           TEXT,
     updated_at           TEXT NOT NULL
   )`,
  `INSERT OR IGNORE INTO roles (id, name) VALUES (1, 'admin'), (2, 'user'), (3, 'guest')`,
  `INSERT OR IGNORE INTO users (id, username, password, role_id) VALUES
     (0, 'guest', '$2a$10$JAz/R6ThStgqqGds62uJfeNBgLXsPc9dKp3sGFpCcjjLS3JLQxNBa', 3)`,
  `INSERT OR IGNORE INTO fineness_levels (id, name) VALUES (1, 'coarse'), (2, 'medium'), (3, 'fine')`,
  `INSERT OR IGNORE INTO fertilizer_types (id, name) VALUES (1, 'organic'), (2, 'synthetic')`,
  `CREATE INDEX IF NOT EXISTS idx_plants_list ON plants(is_public, user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_images_lookup ON images(entity_type, entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_watering_history ON watering_records(plant_id, date DESC)`,
];

export const up = async (db: Kysely<unknown>): Promise<void> => {
  for (const statement of STATEMENTS) {
    await sql.raw(statement).execute(db);
  }
};
