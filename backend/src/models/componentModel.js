const pool = require("../config/db");

// Base query string for selecting all components
const selectComponentsQuery = "SELECT id, name, fineness FROM components";

// Function to execute a query with error handling
const executeQuery = (query, params = []) => {
  return pool.query(query, params).then(([rows]) => rows);
};

// Function to select all components
const selectComponents = () => executeQuery(selectComponentsQuery);

// Wrapper for selecting a single component by ID
const selectComponent = (id) => 
  executeQuery(`${selectComponentsQuery} WHERE id = ?`, [id]).then((rows) => {
    return rows.length ? rows[0] : null; // Return null if no component found
  });

// Insert a new component
const insertComponent = (name, fineness) => 
  pool.query("INSERT INTO components (name, fineness) VALUES (?, ?)", [name, fineness]);

// Update a component by ID
const updateComponentById = (id, name, fineness) => 
  pool.query("UPDATE components SET name = ?, fineness = ? WHERE id = ?", [name, fineness, id]);

// Delete a component by ID
const deleteComponentById = (id) => 
  pool.query("DELETE FROM components WHERE id = ?", [id]);

module.exports = {
  selectComponents,
  selectComponent,
  insertComponent,
  updateComponentById,
  deleteComponentById,
};
