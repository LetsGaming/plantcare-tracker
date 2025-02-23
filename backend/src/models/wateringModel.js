const pool = require('../config/db');

// Base query for selecting watering records
const selectWateringRecordsQuery = `
  SELECT 
    wr.id as record_id,
    wr.date as watering_date,
    wr.amount as watering_amount,
    wr.used_fertilizer,
    wr.fertilizer_type,
    p.id as plant_id,
    p.name as plant_name,
    p.user_id as owner_id
  FROM watering_records wr
  LEFT JOIN plants p ON wr.plant_id = p.id
`;

// Function to select watering records with dynamic conditions
const selectWateringRecords = async (conditions = {}, params = []) => {
  let whereClauses = [];

  if (conditions.plant_id) {
    whereClauses.push('wr.plant_id = ?');
    params.push(conditions.plant_id);
  }
  if (conditions.user_id) {
    whereClauses.push('p.user_id = ?');
    params.push(conditions.user_id);
  }
  if (conditions.record_id) {
    whereClauses.push('wr.id = ?');
    params.push(conditions.record_id);
  }

  const whereSQL = whereClauses.length ? ` WHERE ${whereClauses.join(' AND ')}` : '';
  const query = `${selectWateringRecordsQuery} ${whereSQL}`;
  
  const [rows] = await pool.query(query, params);
  return rows;
};

// Insert a new watering record
const addWateringRecord = async (plantId, date, amount, usedFertilizer, fertilizerType, userId) => {
  // Check if the plant belongs to the user
  const plantQuery = 'SELECT 1 FROM plants WHERE id = ? AND user_id = ?';
  const [plantCheck] = await pool.query(plantQuery, [plantId, userId]);

  if (plantCheck.length === 0) {
    throw new Error('This plant does not belong to the specified user.');
  }

  // If the plant belongs to the user, proceed to insert the watering record
  const query = 'INSERT INTO watering_records (plant_id, date, amount, used_fertilizer, fertilizer_type) VALUES (?, ?, ?, ?, ?)';
  const [result] = await pool.query(query, [plantId, date, amount, usedFertilizer, fertilizerType]);
  return result;
};

// Update an existing watering record
const updateWateringRecord = async (recordId, userId, fields) => {
  const updates = [];
  const params = [];

  if (fields.date) {
    updates.push('date = ?');
    params.push(fields.date);
  }
  if (fields.amount) {
    updates.push('amount = ?');
    params.push(fields.amount);
  }
  if (fields.usedFertilizer !== undefined) {
    updates.push('used_fertilizer = ?');
    params.push(fields.usedFertilizer);
  }
  if (fields.fertilizerType) {
    updates.push('fertilizer_type = ?');
    params.push(fields.fertilizerType);
  }

  if (updates.length === 0) {
    throw new Error('No fields provided for update.');
  }

  params.push(recordId);

  const query = `
    UPDATE watering_records 
    SET ${updates.join(', ')}
    WHERE id = ? 
    AND plant_id IN (SELECT id FROM plants WHERE user_id = ?)
  `;

  params.push(userId); // Add userId to parameters after recordId

  const [result] = await pool.query(query, params);
  return result;
};


// Delete a watering record
const deleteWateringRecord = async (recordId, userId) => {
  const query = `
    DELETE FROM watering_records 
    WHERE id = ? 
    AND plant_id IN (SELECT id FROM plants WHERE user_id = ?)
  `;
  
  const [result] = await pool.query(query, [recordId, userId]);
  return result;
};

module.exports = { 
  selectWateringRecords, 
  addWateringRecord, 
  updateWateringRecord, 
  deleteWateringRecord 
};
