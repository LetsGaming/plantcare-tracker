const pool = require("../config/db");
const { selectEntityImages } = require("../utils/imageUtils");

// Helper function to build the WHERE clause dynamically
const buildWhereClause = (conditions, params) => {
  const whereClauses = [];

  if (conditions.id !== undefined) {
    whereClauses.push("components.id = ?");
    params.push(Number(conditions.id));
  }

  if (conditions.fineness_id !== undefined) {
    whereClauses.push("components.fineness_id = ?");
    params.push(Number(conditions.fineness_id));
  }

  return whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
};

// Base query to select components with fineness level
const selectComponentsQuery = `
  SELECT
    components.id AS component_id,
    components.name AS component_name,
    components.fineness_id AS fineness_id,
    fineness_levels.name AS fineness_name
  FROM components
  JOIN fineness_levels ON components.fineness_id = fineness_levels.id
`;

// Select components (list or filtered)
const selectComponents = async (conditions = {}) => {
  const params = [];
  const selectImages =
    conditions.selectImages !== undefined ? conditions.selectImages : true;

  const whereSQL = buildWhereClause(conditions, params);
  const query = `${selectComponentsQuery} ${whereSQL}`;

  const [rows] = await pool.query(query, params);

  const components = await Promise.all(
    rows.map(async (row) => {
      let image_url = null;
      let images = [];

      if (selectImages) {
        const imageData = await selectEntityImages(
          "component",
          row.component_id
        );
        image_url = imageData.latestImage;
        images = imageData.images;
      }

      return {
        component_id: row.component_id,
        component_name: row.component_name,
        fineness_id: row.fineness_id,
        component_fineness: row.fineness_name,
        image_url,
        images,
      };
    })
  );

  return components;
};

// Wrapper for selecting a single component by ID
const selectComponent = (id, selectImages = true) =>
  selectComponents({ id, selectImages });

// Select all fineness levels
const selectFinenessLevels = async () => {
  const [rows] = await pool.query("SELECT id, name FROM fineness_levels");

  return rows.map((row) => ({
    fineness_id: row.id,
    fineness_name: row.name,
  }));
};

// Insert a new component
const insertComponent = async (name, fineness_id) => {
  return pool.query(
    "INSERT INTO components (name, fineness_id) VALUES (?, ?)",
    [name, fineness_id]
  );
};

// Dynamically update a component
const updateComponent = async (id, fields) => {
  const updates = [];
  const params = [];

  if (fields.name !== undefined) {
    updates.push("name = ?");
    params.push(fields.name);
  }

  if (fields.fineness_id !== undefined) {
    updates.push("fineness_id = ?");
    params.push(fields.fineness_id);
  }

  if (updates.length === 0) {
    throw new Error("No fields provided for update.");
  }

  params.push(id);

  const query = `
    UPDATE components
    SET ${updates.join(", ")}
    WHERE id = ?
  `;

  return pool.query(query, params);
};

// Delete a component by ID
const deleteComponent = async (id) => {
  return pool.query("DELETE FROM components WHERE id = ?", [id]);
};

module.exports = {
  selectComponents,
  selectComponent,
  selectFinenessLevels,
  insertComponent,
  updateComponent,
  deleteComponent,
};
