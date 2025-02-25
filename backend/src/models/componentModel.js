const pool = require("../config/db");
const { selectEntityImages } = require("../utils/imageUtils");

// Base query for selecting components
const selectComponentsQuery = `
  SELECT 
    components.id as component_id,
    components.name as component_name,
    components.fineness as component_fineness
  FROM components
`;

// Function to select components with dynamic conditions
const selectComponents = async (conditions = {}, params = []) => {
  let whereClauses = [];

  // Add dynamic filtering if conditions are provided
  if (conditions.id) {
    whereClauses.push("components.id = ?");
    params.push(conditions.id);
  }

  const whereSQL = whereClauses.length
    ? `WHERE ${whereClauses.join(" AND ")}`
    : "";
  const query = `${selectComponentsQuery} ${whereSQL}`;

  const [componentRows] = await pool.query(query, params);

  const componentsWithDetails = await Promise.all(
    componentRows.map(async (component) => {
      const { latestImage, images } = await selectEntityImages(
        "component",
        component.component_id
      );
      return {
        component_id: component.component_id,
        component_name: component.component_name,
        component_fineness: component.component_fineness,
        image_url: latestImage,
        images,
      };
    })
  );

  return componentsWithDetails;
};

// Wrapper for selecting a single component by ID
const selectComponent = (id) =>
  selectComponents({ id }).then((rows) => rows[0] || null);

// Insert a new component
const insertComponent = (name, fineness) => {
  return pool.query("INSERT INTO components (name, fineness) VALUES (?, ?)", [
    name,
    fineness,
  ]);
};

// Update a component by ID
const updateComponent = (id, name, fineness) => {
  return pool.query(
    "UPDATE components SET name = ?, fineness = ? WHERE id = ?",
    [name, fineness, id]
  );
};

// Delete a component by ID
const deleteComponent = (id) => {
  return pool.query("DELETE FROM components WHERE id = ?", [id]);
};

module.exports = {
  selectComponents,
  selectComponent,
  insertComponent,
  updateComponent,
  deleteComponent,
};
