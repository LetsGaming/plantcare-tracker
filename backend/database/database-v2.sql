-- =============================================================================
-- Plantcare Tracker — Datenbankschema V2
-- Kompatibel mit: Backend V2 (src/)
-- Zeichensatz: utf8mb4 (volle Unicode-Unterstützung inkl. Emoji)
-- =============================================================================

START TRANSACTION;

-- ── Rollen ────────────────────────────────────────────────────────────────────

CREATE TABLE roles (
  id   INT          AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50)  NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO roles (name) VALUES
  ('admin'),
  ('guest'),
  ('user');

-- ── Benutzer ──────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  username   VARCHAR(100) NOT NULL UNIQUE,
  password   CHAR(60)     NOT NULL,              -- bcrypt hash (immer 60 Zeichen)
  role_id    INT          NOT NULL DEFAULT 3,    -- 3 = user
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Gast-Benutzer (Passwort: "guest")
INSERT INTO users (username, password, role_id) VALUES
  ('guest', '$2a$10$JAz/R6ThStgqqGds62uJfeNBgLXsPc9dKp3sGFpCcjjLS3JLQxNBa', 2);

-- ── Feinheitsgrade (für Substrat-Komponenten) ─────────────────────────────────

CREATE TABLE fineness_levels (
  id   INT         AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO fineness_levels (name) VALUES
  ('coarse'),
  ('medium'),
  ('fine');

-- ── Komponenten ───────────────────────────────────────────────────────────────

CREATE TABLE components (
  id          INT          AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  fineness_id INT          NOT NULL,
  FOREIGN KEY (fineness_id) REFERENCES fineness_levels(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Substrate ─────────────────────────────────────────────────────────────────

CREATE TABLE substrates (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  user_id    INT          NOT NULL,
  is_public  BOOLEAN      DEFAULT FALSE,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Substrat-Komponenten (Zusammensetzung) ────────────────────────────────────

CREATE TABLE substrate_components (
  substrate_id INT            NOT NULL,
  component_id INT            NOT NULL,
  parts        DECIMAL(4,2)   NOT NULL,          -- Anteile (z.B. 2.50)
  PRIMARY KEY (substrate_id, component_id),
  FOREIGN KEY (substrate_id) REFERENCES substrates(id) ON DELETE CASCADE,
  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Pflanzen ──────────────────────────────────────────────────────────────────

CREATE TABLE plants (
  id           INT          AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  species      VARCHAR(100),
  substrate_id INT,
  user_id      INT          NOT NULL,
  is_public    BOOLEAN      DEFAULT FALSE,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (substrate_id) REFERENCES substrates(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Bilder ────────────────────────────────────────────────────────────────────
-- Zentrale Bildtabelle; Zuordnung erfolgt über dedizierte Join-Tabellen.

CREATE TABLE images (
  id          INT          AUTO_INCREMENT PRIMARY KEY,
  image_url   VARCHAR(255) NOT NULL,
  upload_date TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Polymorphe Zuordnung: separate Join-Tabelle pro Entitätstyp
-- (vermeidet ENUMs und erlaubt CASCADE pro Typ)

CREATE TABLE plant_images (
  plant_id INT NOT NULL,
  image_id INT NOT NULL,
  PRIMARY KEY (plant_id, image_id),
  FOREIGN KEY (plant_id) REFERENCES plants(id)  ON DELETE CASCADE,
  FOREIGN KEY (image_id) REFERENCES images(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE substrate_images (
  substrate_id INT NOT NULL,
  image_id     INT NOT NULL,
  PRIMARY KEY (substrate_id, image_id),
  FOREIGN KEY (substrate_id) REFERENCES substrates(id) ON DELETE CASCADE,
  FOREIGN KEY (image_id)     REFERENCES images(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE component_images (
  component_id INT NOT NULL,
  image_id     INT NOT NULL,
  PRIMARY KEY (component_id, image_id),
  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE,
  FOREIGN KEY (image_id)     REFERENCES images(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Düngerarten ───────────────────────────────────────────────────────────────

CREATE TABLE fertilizer_types (
  id   INT         AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO fertilizer_types (name) VALUES
  ('organic'),
  ('synthetic');

-- ── Gießaufzeichnungen ────────────────────────────────────────────────────────

CREATE TABLE watering_records (
  id                 INT       AUTO_INCREMENT PRIMARY KEY,
  plant_id           INT       NOT NULL,
  date               DATETIME  DEFAULT CURRENT_TIMESTAMP,
  used_fertilizer    BOOLEAN   NOT NULL DEFAULT FALSE,
  fertilizer_type_id INT,
  FOREIGN KEY (plant_id)           REFERENCES plants(id)           ON DELETE CASCADE,
  FOREIGN KEY (fertilizer_type_id) REFERENCES fertilizer_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

COMMIT;


-- =============================================================================
-- V2 Performance-Indizes
-- Behebt Full-Table-Scans aus V1 auf häufig gefilterten Spalten.
-- =============================================================================

-- plants: WHERE user_id = ?  /  WHERE is_public = 1  /  JOIN substrate_id
ALTER TABLE plants      ADD INDEX idx_plants_user_id   (user_id);
ALTER TABLE plants      ADD INDEX idx_plants_is_public (is_public);
ALTER TABLE plants      ADD INDEX idx_plants_substrate (substrate_id);

-- substrates: WHERE user_id = ?  /  WHERE is_public = 1
ALTER TABLE substrates  ADD INDEX idx_substrates_user_id   (user_id);
ALTER TABLE substrates  ADD INDEX idx_substrates_is_public (is_public);

-- substrate_components: Rück-Index für Lookups nach component_id
-- (composite PK deckt bereits substrate_id → component_id)
ALTER TABLE substrate_components ADD INDEX idx_sc_component_id (component_id);

-- join-Tabellen: Rück-Index damit ON DELETE CASCADE schnell läuft
ALTER TABLE plant_images     ADD INDEX idx_pi_image_id  (image_id);
ALTER TABLE substrate_images ADD INDEX idx_si_image_id  (image_id);
ALTER TABLE component_images ADD INDEX idx_ci_image_id  (image_id);

-- watering_records: häufiger Filter nach plant_id + date
ALTER TABLE watering_records ADD INDEX idx_wr_plant_id (plant_id);
ALTER TABLE watering_records ADD INDEX idx_wr_date     (date);

-- users: role_id für rollenbasierte Queries
ALTER TABLE users ADD INDEX idx_users_role_id (role_id);

