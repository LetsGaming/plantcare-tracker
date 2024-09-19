const pool = require('../config/db');

// Alle Gießaufzeichnungen abrufen
const getWateringRecords = (plantId) => 
  pool.query('SELECT * FROM watering_records WHERE plant_id = ?', [plantId]);

// Gießaufzeichnung hinzufügen
const addWateringRecord = (plantId, date, amount) => 
  pool.query('INSERT INTO watering_records (plant_id, date, amount) VALUES (?, ?, ?)', [plantId, date, amount]);

export default { getWateringRecords, addWateringRecord };
