START TRANSACTION;

-- Benutzerrollen ausgelagert
CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO roles (name) VALUES ('Admin'), ('Guest'), ('User');

-- Benutzer
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password CHAR(60) NOT NULL,
  role_id INT NOT NULL DEFAULT 3,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

INSERT INTO users (username, password, role_id) VALUES
('guest', '$2a$10$JAz/R6ThStgqqGds62uJfeNBgLXsPc9dKp3sGFpCcjjLS3JLQxNBa', 2); -- guest

-- Feinheitsgrade ausgelagert
CREATE TABLE fineness_levels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO fineness_levels (name) VALUES ('coarse'), ('medium'), ('fine');

-- Komponenten
CREATE TABLE components (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  fineness_id INT NOT NULL,
  FOREIGN KEY (fineness_id) REFERENCES fineness_levels(id)
);

-- Substrate
CREATE TABLE substrates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  user_id INT NOT NULL,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Substrat-Komponenten
CREATE TABLE substrate_components (
  substrate_id INT,
  component_id INT,
  parts DECIMAL(4,2) NOT NULL,
  PRIMARY KEY (substrate_id, component_id),
  FOREIGN KEY (substrate_id) REFERENCES substrates(id) ON DELETE CASCADE,
  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
);

-- Pflanzen
CREATE TABLE plants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  species VARCHAR(100),
  substrate_id INT,
  user_id INT NOT NULL,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (substrate_id) REFERENCES substrates(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Bilder, keine ENUMs mehr, stattdessen dedizierte Tabellen
CREATE TABLE images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  image_url VARCHAR(255) NOT NULL,
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Zuordnung Bilder zu Entitäten (Polymorphe Verknüpfung)
CREATE TABLE plant_images (
  plant_id INT NOT NULL,
  image_id INT NOT NULL,
  PRIMARY KEY (plant_id, image_id),
  FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE,
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
);

CREATE TABLE substrate_images (
  substrate_id INT NOT NULL,
  image_id INT NOT NULL,
  PRIMARY KEY (substrate_id, image_id),
  FOREIGN KEY (substrate_id) REFERENCES substrates(id) ON DELETE CASCADE,
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
);

CREATE TABLE component_images (
  component_id INT NOT NULL,
  image_id INT NOT NULL,
  PRIMARY KEY (component_id, image_id),
  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE,
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
);

-- Düngerarten ausgelagert
CREATE TABLE fertilizer_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO fertilizer_types (name) VALUES ('organic'), ('synthetic');

-- Gießaufzeichnungen
CREATE TABLE watering_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plant_id INT NOT NULL,
  date DATETIME DEFAULT CURRENT_TIMESTAMP,
  used_fertilizer BOOLEAN NOT NULL DEFAULT FALSE,
  fertilizer_type_id INT,
  FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE,
  FOREIGN KEY (fertilizer_type_id) REFERENCES fertilizer_types(id)
);

COMMIT;