const pool = require("../config/db");
const { selectEntityImages } = require("../utils/imageUtils");

// Helper function to build the WHERE clause dynamically
const buildWhereClause = (conditions, params) => {
  const whereClauses = [];
  if (conditions.user_id) {
    whereClauses.push("substrates.user_id = ?");
    params.push(conditions.user_id);
  }
  if (conditions.id) {
    whereClauses.push("substrates.id = ?");
    params.push(conditions.id);
  }
  if (conditions.is_public !== undefined) {
    whereClauses.push("substrates.is_public = ?");
    params.push(conditions.is_public);
  }
  return whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
};

// Main query to fetch substrates and their components
const selectSubstratesQuery = `
  SELECT 
    substrates.id AS substrate_id,
    substrates.name AS substrate_name,
    substrates.user_id AS substrate_user_id,
    substrates.is_public AS substrate_is_public,
    substrates.created_at AS substrate_created_at,

    substrate_components.substrate_id AS substrate_component_substrate_id,
    substrate_components.component_id AS substrate_component_component_id,
    substrate_components.parts AS substrate_component_parts,

    components.id AS component_id,
    components.name AS component_name,
    fineness_levels.name AS component_fineness_name

  FROM substrates
  LEFT JOIN substrate_components 
    ON substrates.id = substrate_components.substrate_id
  LEFT JOIN components 
    ON substrate_components.component_id = components.id
  LEFT JOIN fineness_levels
    ON components.fineness_id = fineness_levels.id
`;

const selectSubstrates = async (conditions = {}, params = []) => {
  // Default selectImages to true if it's not provided
  conditions.selectImages =
    conditions.selectImages !== undefined ? conditions.selectImages : true;

  const whereSQL = buildWhereClause(conditions, params);
  const query = `${selectSubstratesQuery} ${whereSQL}`;

  // Fetch rows from the database
  const [rows] = await pool.query(query, params);

  // Group substrates by substrate_id
  const substrateMap = new Map();
  for (const row of rows) {
    const substrate = substrateMap.get(row.substrate_id) || {
      substrate_id: row.substrate_id,
      substrate_name: row.substrate_name,
      user_id: row.substrate_user_id,
      is_public: row.substrate_is_public,
      created_at: row.substrate_created_at,
      components: [],
    };
  
    if (row.component_id) {
      substrate.components.push({
        component_id: row.component_id,
        component_name: row.component_name,
        component_fineness: row.component_fineness_name,
        parts: row.substrate_component_parts,
      });
    }
  
    substrateMap.set(row.substrate_id, substrate);
  }
  
  const substrates = Array.from(substrateMap.values());

  // Fetch images concurrently if selectImages is true
  if (conditions.selectImages) {
    await Promise.all(
      substrates.map(async (substrate) => {
        const { latestImage, images } = await selectEntityImages(
          "substrate",
          substrate.substrate_id
        );
        substrate.image_url = latestImage;
        substrate.images = images;
      })
    );
  }

  return substrates;
};

// Helper function to execute insert queries
const insertEntity = async (query, params) => {
  return await pool.query(query, params);
};

// Wrapper for selecting a single substrate by ID
const selectSubstrate = async (id, selectImages = true) => {
  const subs =  await selectSubstrates({ id, selectImages });
  if (subs && subs.length > 0) {
    return subs[0]; // Return the first (and only) substrate
  } 
  return null;
}

// Wrapper for selecting public substrates
const selectPublicSubstrates = () => selectSubstrates({ is_public: true });

// Wrapper for selecting private substrates (by user_id)
const selectPrivateSubstrates = (user_id) => selectSubstrates({ user_id });

// Insert a substrate
const insertSubstrate = (name, user_id, is_public = false) =>
  insertEntity(
    "INSERT INTO substrates (name, user_id, is_public) VALUES (?, ?, ?)",
    [name, user_id, is_public]
  );

// Insert a substrate component
const insertSubstrateComponent = (substrate_id, component_id, parts) =>
  insertEntity(
    "INSERT INTO substrate_components (substrate_id, component_id, parts) VALUES (?, ?, ?)",
    [substrate_id, component_id, parts]
  );

// Helper function to execute update queries
const updateEntity = async (query, params) => {
  return await pool.query(query, params);
};

// Update a substrate
const updateSubstrate = (id, user_id, name, is_public) => {
  const updates = [];
  const params = [];

  // Dynamically add fields to the update statement
  if (name !== undefined) {
    updates.push("name = ?");
    params.push(name);
  }
  if (is_public !== undefined) {
    updates.push("is_public = ?");
    params.push(is_public);
  }

  // Only proceed if there's something to update
  if (updates.length > 0) {
    params.push(id, user_id);

    const query = `UPDATE substrates SET ${updates.join(
      ", "
    )} WHERE id = ? AND user_id = ?`;

    return updateEntity(query, params);
  }

  // If no fields to update, return early or handle as needed
  return Promise.reject("No fields to update");
};

// Update a substrate component
const updateSubstrateComponent = (substrate_id, component_id, parts) =>
  insertEntity(
    `
      INSERT INTO substrate_components (substrate_id, component_id, parts)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE parts = ?`,
    [substrate_id, component_id, parts, parts]
  );

// Delete substrate components
const deleteSubstrateComponents = (substrate_id, componentIds) => {
  const placeholders = componentIds.map(() => "?").join(", ");
  return pool.query(
    `DELETE FROM substrate_components WHERE substrate_id = ? AND component_id IN (${placeholders})`,
    [substrate_id, ...componentIds]
  );
};

// Delete substrate
const deleteSubstrate = async (id, user_id) => {
  const query = "DELETE FROM substrates WHERE id = ? AND user_id = ?";
  return await pool.query(query, [id, user_id]);
};

module.exports = {
  selectPublicSubstrates,
  selectPrivateSubstrates,
  selectSubstrate,
  insertSubstrate,
  insertSubstrateComponent,
  updateSubstrate,
  updateSubstrateComponent,
  deleteSubstrateComponents,
  deleteSubstrate,
};
