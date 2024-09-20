-- Tabelle für Benutzer
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('User', 'Admin') NOT NULL DEFAULT 'User',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabelle für Substrate
CREATE TABLE substrates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  user_id INT NOT NULL,  -- Verknüpfung mit dem Benutzer
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE  -- Substrat wird gelöscht, wenn der Benutzer gelöscht wird
);

-- Tabelle für Komponenten (mit Feinheit)
CREATE TABLE components (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  fineness ENUM('Grob', 'Mittel', 'Fein') NOT NULL  -- Feinheit der Komponente
);

-- Tabelle für Substrat-Komponenten
CREATE TABLE substrate_components (
  id INT AUTO_INCREMENT PRIMARY KEY,
  substrate_id INT,
  component_id INT,
  parts DECIMAL(2,2),
  FOREIGN KEY (substrate_id) REFERENCES substrates(id) ON DELETE CASCADE,
  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
);

-- Tabelle für Pflanzen
CREATE TABLE plants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  species VARCHAR(255),
  substrate_id INT,
  user_id INT NOT NULL,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (substrate_id) REFERENCES substrates(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE  -- Pflanze wird gelöscht, wenn der Benutzer gelöscht wird
);

-- Tabelle für Pflanzbilder
CREATE TABLE plant_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plant_id INT,
  image_url VARCHAR(255),
  upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE
);

-- Tabelle für Gießaufzeichnungen
CREATE TABLE watering_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plant_id INT,
  date DATETIME DEFAULT CURRENT_TIMESTAMP,
  amount DECIMAL(10,2),
  FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE
);
