const pool = require("../config/db");
const { selectEntityImages } = require("../utils/imageUtils");

// Base query for selecting components with a join to the fineness_levels table
const selectComponentsQuery = `
  SELECT 
    components.id as component_id,
    components.name as component_name,
    components.fineness_id,
    fineness_levels.name as component_fineness
  FROM components
  JOIN fineness_levels ON components.fineness_id = fineness_levels.id
`;

// Function to select components with dynamic conditions
const selectComponents = async (conditions = {}, params = []) => {
  // Default selectImages to true if it's not provided
  if (conditions.selectImages === undefined) {
    conditions.selectImages = true;
  }

  const whereClauses = [];

  // Add dynamic filtering if conditions are provided
  if (conditions.id) {
    whereClauses.push("components.id = ?");
    params.push(conditions.id);
  }

  if (conditions.fineness_id) {
    whereClauses.push("components.fineness_id = ?");
    params.push(conditions.fineness_id);
  }

  const whereSQL = whereClauses.length
    ? `WHERE ${whereClauses.join(" AND ")}`
    : "";
  const query = `${selectComponentsQuery} ${whereSQL}`;

  const [rows] = await pool.query(query, params);

  // Group rows by component_id, in case there are duplicate rows due to joins
  const componentsMap = new Map();
  for (const row of rows) {
    const {
      component_id,
      component_name,
      component_fineness,
    } = row;

    if (!componentsMap.has(component_id)) {
      // initialize the grouped object with base properties and empty arrays for join data
      componentsMap.set(component_id, {
        component_id,
        component_name,
        component_fineness,
        images: [],
      });
    }
  }

  const components = Array.from(componentsMap.values());

  // If image details should be selected, fetch them concurrently for each component.
  if (conditions.selectImages) {
    await Promise.all(
      components.map(async (component) => {
        const { latestImage, images } = await selectEntityImages(
          "component",
          component.component_id
        );
        component.image_url = latestImage;
        component.images = images;
      })
    );
  }

  return components;
};

// Wrapper for selecting a single component by ID
const selectComponent = (id, selectImages = true) =>
  selectComponents({ id, selectImages }).then((rows) => rows[0] || null);

// Insert a new component
const insertComponent = (name, fineness_id) => {
  return pool.query("INSERT INTO components (name, fineness_id) VALUES (?, ?)", [
    name,
    fineness_id,
  ]);
};

// Update a component by ID
const updateComponent = (id, name, fineness_id) => {
  return pool.query(
    "UPDATE components SET name = ?, fineness_id = ? WHERE id = ?",
    [name, fineness_id, id]
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
