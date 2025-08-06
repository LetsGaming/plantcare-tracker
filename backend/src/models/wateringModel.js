const pool = require("../config/db");

// Base query for selecting watering records
const selectWateringRecordsQuery = `
  SELECT 
    wr.id as record_id,
    wr.date as watering_date,
    wr.used_fertilizer,
    ft.name as fertilizer_type, 
    p.id as plant_id,
    p.name as plant_name,
    p.user_id as owner_id
  FROM watering_records wr
  LEFT JOIN plants p ON wr.plant_id = p.id
  LEFT JOIN fertilizer_types ft ON wr.fertilizer_type_id = ft.id 
`;

// Helper function to build the WHERE clause dynamically
const buildWhereClause = (conditions, params) => {
  const whereClauses = [];

  // If plant_id is provided, add condition
  if (conditions.plant_id) {
    whereClauses.push("wr.plant_id = ?");
    params.push(conditions.plant_id);
  }

  // If user_id is provided, add condition
  if (conditions.user_id) {
    whereClauses.push("p.user_id = ?");
    params.push(conditions.user_id);
  }
  // If record_id is provided, add condition
  if (conditions.record_id) {
    whereClauses.push("wr.id = ?");
    params.push(conditions.record_id);
  }

  return whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
};

// Function to select watering records with dynamic conditions
const selectWateringRecords = async (conditions = {}, params = []) => {
  const whereSQL = buildWhereClause(conditions, params);
  const query = `${selectWateringRecordsQuery} ${whereSQL}`;

  const [rows] = await pool.query(query, params);
  return rows;
};

// Select a specific watering record by recordId
const selectWateringRecord = (recordId) =>
  selectWateringRecords({ record_id: recordId });

// Select all watering records for a specific plant by plantId
const selectWateringRecordsForPlant = (plantId) =>
  selectWateringRecords({ plant_id: plantId });

const selectFertilizerTypes = async () => {
  const query = `
    SELECT id, name 
    FROM fertilizer_types
  `;
  const [rows] = await pool.query(query);
  return rows.map((row) => ({
    fertilizer_id: row.id,
    fertilizer_name: row.name,
  }));
};

// Insert a new watering record
const insertWateringRecord = async (
  plantId,
  date,
  usedFertilizer,
  fertilizerTypeId, // Now we expect a fertilizer_type_id
) => {
  const query = `
    INSERT INTO watering_records (plant_id, date, used_fertilizer, fertilizer_type_id)
    VALUES (?, ?, ?, ?)
  `;

  const [result] = await pool.query(query, [
    plantId,
    date,
    usedFertilizer,
    fertilizerTypeId,
  ]);

  return result;
};

// Update an existing watering record
const updateWateringRecord = async (recordId, userId, fields) => {
  const updates = [];
  const params = [];

  // Dynamically build the update query based on provided fields
  if (fields.date) {
    updates.push("date = ?");
    params.push(fields.date);
  }
  if (fields.usedFertilizer !== undefined) {
    updates.push("used_fertilizer = ?");
    params.push(fields.usedFertilizer);
  }
  if (fields.fertilizerTypeId) {
    updates.push("fertilizer_type_id = ?");
    params.push(fields.fertilizerTypeId);
  }

  // If no fields to update, throw an error
  if (updates.length === 0) {
    throw new Error("No fields provided for update.");
  }

  params.push(recordId);

  const query = `
    UPDATE watering_records 
    SET ${updates.join(", ")}
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
  selectWateringRecord,
  selectWateringRecordsForPlant,
  selectFertilizerTypes,
  insertWateringRecord,
  updateWateringRecord,
  deleteWateringRecord,
};
