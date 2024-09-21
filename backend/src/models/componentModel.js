const pool = require("../config/db");

// Insert a component
const insertComponent = (name, fineness) =>
  pool.query("INSERT INTO components (name, fineness) VALUES (?, ?)", [
    name,
    fineness,
  ]);

// Update a component by ID
const updateComponentById = (id, name, fineness) =>
  pool.query("UPDATE components SET name = ?, fineness = ? WHERE id = ?", [
    name,
    fineness,
    id,
  ]);

module.exports = {
  insertComponent,
  updateComponentById,
};
