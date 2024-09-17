-- Tabelle für Benutzer
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabelle für Pflanzen
CREATE TABLE plants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  species VARCHAR(255),
  substrate_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (substrate_id) REFERENCES substrates(id)
);

-- Tabelle für Substrate
CREATE TABLE substrates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);

-- Tabelle für Substrat-Komponenten
CREATE TABLE substrate_components (
  id INT AUTO_INCREMENT PRIMARY KEY,
  substrate_id INT,
  component_name VARCHAR(255),
  percentage DECIMAL(5,2),
  FOREIGN KEY (substrate_id) REFERENCES substrates(id)
);

-- Tabelle für Pflanzbilder
CREATE TABLE plant_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plant_id INT,
  image_url VARCHAR(255),
  upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plant_id) REFERENCES plants(id)
);

-- Tabelle für Gießaufzeichnungen
CREATE TABLE watering_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plant_id INT,
  date DATETIME DEFAULT CURRENT_TIMESTAMP,
  amount DECIMAL(10,2),
  FOREIGN KEY (plant_id) REFERENCES plants(id)
);
