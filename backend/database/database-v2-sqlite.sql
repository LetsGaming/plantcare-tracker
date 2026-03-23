-- =============================================================================
-- Plantcare Tracker — Database Schema V2 (SQLite)
-- Compatible with: Backend V2 (src/)
-- Notes:
--   • SQLite uses INTEGER PRIMARY KEY for auto-increment (rowid alias)
--   • BOOLEAN stored as INTEGER (0/1) — SQLite has no native BOOLEAN type
--   • TIMESTAMP stored as TEXT in ISO-8601 format; DEFAULT (datetime('now'))
--   • ENGINE=InnoDB / CHARSET clauses removed (SQLite ignores them anyway)
--   • FOREIGN KEY support requires `PRAGMA foreign_keys = ON` at connection time
--   • ON DUPLICATE KEY UPDATE replaced with INSERT OR REPLACE / upsert pattern
--   • All indexes created inline with CREATE INDEX (ALTER TABLE ADD INDEX not supported)
-- =============================================================================

PRAGMA journal_mode = WAL;        -- enables concurrent reads with a single writer
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;      -- safe with WAL; faster than FULL
PRAGMA cache_size = -64000;       -- 64 MB page cache
PRAGMA temp_store = MEMORY;

BEGIN;

-- ── Roles ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS roles (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE
);

INSERT OR IGNORE INTO roles (name) VALUES
  ('admin'),
  ('guest'),
  ('user');

-- ── Users ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT    NOT NULL UNIQUE,
  password   TEXT    NOT NULL,                    -- bcrypt hash (60 chars)
  role_id    INTEGER NOT NULL DEFAULT 3,          -- 3 = user
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- Guest user (password: "guest")
INSERT OR IGNORE INTO users (username, password, role_id) VALUES
  ('guest', '$2a$10$JAz/R6ThStgqqGds62uJfeNBgLXsPc9dKp3sGFpCcjjLS3JLQxNBa', 2);

-- ── Fineness levels (for substrate components) ────────────────────────────────

CREATE TABLE IF NOT EXISTS fineness_levels (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE
);

INSERT OR IGNORE INTO fineness_levels (name) VALUES
  ('coarse'),
  ('medium'),
  ('fine');

-- ── Components ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS components (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  fineness_id INTEGER NOT NULL,
  FOREIGN KEY (fineness_id) REFERENCES fineness_levels(id)
);

-- ── Substrates ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS substrates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  user_id    INTEGER NOT NULL,
  is_public  INTEGER NOT NULL DEFAULT 0,          -- BOOLEAN: 0=false 1=true
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ── Substrate components (composition) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS substrate_components (
  substrate_id INTEGER NOT NULL,
  component_id INTEGER NOT NULL,
  parts        REAL    NOT NULL,                  -- e.g. 2.50
  PRIMARY KEY (substrate_id, component_id),
  FOREIGN KEY (substrate_id) REFERENCES substrates(id) ON DELETE CASCADE,
  FOREIGN KEY (component_id) REFERENCES components(id)  ON DELETE CASCADE
);

-- ── Plants ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plants (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  species      TEXT,
  substrate_id INTEGER,
  user_id      INTEGER NOT NULL,
  is_public    INTEGER NOT NULL DEFAULT 0,        -- BOOLEAN: 0=false 1=true
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (substrate_id) REFERENCES substrates(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE CASCADE
);

-- ── Images ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  image_url   TEXT    NOT NULL,
  upload_date TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Polymorphic join tables — one per entity type

CREATE TABLE IF NOT EXISTS plant_images (
  plant_id INTEGER NOT NULL,
  image_id INTEGER NOT NULL,
  PRIMARY KEY (plant_id, image_id),
  FOREIGN KEY (plant_id) REFERENCES plants(id)  ON DELETE CASCADE,
  FOREIGN KEY (image_id) REFERENCES images(id)  ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS substrate_images (
  substrate_id INTEGER NOT NULL,
  image_id     INTEGER NOT NULL,
  PRIMARY KEY (substrate_id, image_id),
  FOREIGN KEY (substrate_id) REFERENCES substrates(id) ON DELETE CASCADE,
  FOREIGN KEY (image_id)     REFERENCES images(id)     ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS component_images (
  component_id INTEGER NOT NULL,
  image_id     INTEGER NOT NULL,
  PRIMARY KEY (component_id, image_id),
  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE,
  FOREIGN KEY (image_id)     REFERENCES images(id)     ON DELETE CASCADE
);

-- ── Fertilizer types ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fertilizer_types (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE
);

INSERT OR IGNORE INTO fertilizer_types (name) VALUES
  ('organic'),
  ('synthetic');

-- ── Watering records ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS watering_records (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_id           INTEGER NOT NULL,
  date               TEXT    NOT NULL DEFAULT (datetime('now')),
  used_fertilizer    INTEGER NOT NULL DEFAULT 0,  -- BOOLEAN: 0=false 1=true
  fertilizer_type_id INTEGER,
  FOREIGN KEY (plant_id)           REFERENCES plants(id)           ON DELETE CASCADE,
  FOREIGN KEY (fertilizer_type_id) REFERENCES fertilizer_types(id)
);

COMMIT;

-- =============================================================================
-- Performance indexes
-- SQLite covers the composite PKs automatically; the indexes below target
-- the most frequent single-column filter / join patterns.
-- =============================================================================

-- plants
CREATE INDEX IF NOT EXISTS idx_plants_user_id    ON plants(user_id);
CREATE INDEX IF NOT EXISTS idx_plants_is_public  ON plants(is_public);
CREATE INDEX IF NOT EXISTS idx_plants_substrate  ON plants(substrate_id);

-- substrates
CREATE INDEX IF NOT EXISTS idx_substrates_user_id   ON substrates(user_id);
CREATE INDEX IF NOT EXISTS idx_substrates_is_public ON substrates(is_public);

-- substrate_components: back-index for component_id lookups
-- (composite PK already covers substrate_id → component_id direction)
CREATE INDEX IF NOT EXISTS idx_sc_component_id ON substrate_components(component_id);

-- join tables: back-index so ON DELETE CASCADE is O(log n)
CREATE INDEX IF NOT EXISTS idx_pi_image_id ON plant_images(image_id);
CREATE INDEX IF NOT EXISTS idx_si_image_id ON substrate_images(image_id);
CREATE INDEX IF NOT EXISTS idx_ci_image_id ON component_images(image_id);

-- watering_records
CREATE INDEX IF NOT EXISTS idx_wr_plant_id ON watering_records(plant_id);
CREATE INDEX IF NOT EXISTS idx_wr_date     ON watering_records(date);

-- users
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
