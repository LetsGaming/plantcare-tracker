PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;
PRAGMA temp_store = MEMORY;

BEGIN;

-- ── Roles ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

-- ── Users (Optimized with Case-Insensitivity) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password    TEXT NOT NULL,
  role_id     INTEGER NOT NULL DEFAULT 3,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- ── Species Lookup (New: Normalization) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS species (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

-- ── Fineness & Components ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fineness_levels (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS components (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  fineness_id INTEGER NOT NULL,
  FOREIGN KEY (fineness_id) REFERENCES fineness_levels(id)
);

-- ── Substrates ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS substrates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  user_id     INTEGER NOT NULL,
  is_public   INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ── Plants (Optimized with Species FK) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plants (
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
);

-- ── Consolidated Images (Reduced Join Complexity) ────────────────────────────
CREATE TABLE IF NOT EXISTS images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  image_url   TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('plant', 'substrate', 'component')),
  entity_id   INTEGER NOT NULL,
  upload_date INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- ── Watering & Fertilizers ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fertilizer_types (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS watering_records (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_id           INTEGER NOT NULL,
  date               INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  used_fertilizer    INTEGER NOT NULL DEFAULT 0,
  fertilizer_type_id INTEGER,
  FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE,
  FOREIGN KEY (fertilizer_type_id) REFERENCES fertilizer_types(id)
);

-- ── Substrate Components (Using WITHOUT ROWID for space efficiency) ──────────
CREATE TABLE IF NOT EXISTS substrate_components (
  substrate_id INTEGER NOT NULL,
  component_id INTEGER NOT NULL,
  parts        REAL NOT NULL,
  PRIMARY KEY (substrate_id, component_id),
  FOREIGN KEY (substrate_id) REFERENCES substrates(id) ON DELETE CASCADE,
  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
) WITHOUT ROWID;

COMMIT;

-- ── Performance Indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_plants_list ON plants(is_public, user_id);
CREATE INDEX IF NOT EXISTS idx_images_lookup ON images(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_watering_history ON watering_records(plant_id, date DESC);