const pool = require("../config/db");

// Base query for selecting components
const selectComponentsQuery = `
  SELECT 
    components.id as component_id,
    components.name as component_name,
    components.fineness as component_fineness
  FROM components
`;

// Function to select components with dynamic conditions
const selectComponents = (conditions = {}, params = []) => {
  let whereClauses = [];

  // Add dynamic filtering if conditions are provided
  if (conditions.id) {
    whereClauses.push("components.id = ?");
    params.push(conditions.id);
  }

  const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const query = `${selectComponentsQuery} ${whereSQL}`;

  return pool.query(query, params).then(([rows]) => {
    return rows.map((row) => {
      const { component_id, component_name, component_fineness } = row;

      return {
        component_id,
        component_name,
        component_fineness,
      };
    });
  });
};

// Wrapper for selecting a single component by ID
const selectComponent = (id) => selectComponents({ id }).then((rows) => rows[0] || null);

// Insert a new component
const insertComponent = (name, fineness) =>
  pool.query("INSERT INTO components (name, fineness) VALUES (?, ?)", [name, fineness]);

// Update a component by ID
const updateComponent = (id, name, fineness) =>
  pool.query("UPDATE components SET name = ?, fineness = ? WHERE id = ?", [name, fineness, id]);

// Delete a component by ID
const deleteComponent = (id) =>
  pool.query("DELETE FROM components WHERE id = ?", [id]);

module.exports = {
  selectComponents,
  selectComponent,
  insertComponent,
  updateComponent,
  deleteComponent,
};
