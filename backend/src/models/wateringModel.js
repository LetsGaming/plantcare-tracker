const pool = require('../config/db');

// Base query for selecting watering records
const selectWateringRecordsQuery = `
  SELECT 
    watering_records.id as record_id,
    watering_records.date as watering_date,
    watering_records.amount as watering_amount,
    plants.id as plant_id,
    plants.name as plant_name
  FROM watering_records
  LEFT JOIN plants ON watering_records.plant_id = plants.id
`;

// Function to select watering records with dynamic conditions
const selectWateringRecords = (conditions = {}, params = []) => {
  let whereClauses = [];

  if (conditions.plant_id) {
    whereClauses.push('watering_records.plant_id = ?');
    params.push(conditions.plant_id);
  }

  const whereSQL = whereClauses.length ? ` WHERE ${whereClauses.join(' AND ')}` : '';
  const query = `${selectWateringRecordsQuery} ${whereSQL}`;
  
  return pool.query(query, params);
};

// Wrapper for selecting watering records by plant ID
const getWateringRecords = (plantId) => selectWateringRecords({ plant_id: plantId });

// Insert a new watering record
const addWateringRecord = (plantId, date, amount) =>
  pool.query('INSERT INTO watering_records (plant_id, date, amount) VALUES (?, ?, ?)', [plantId, date, amount]);

module.exports = { getWateringRecords, addWateringRecord };
