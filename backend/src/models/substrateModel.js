const pool = require("../config/db");
const { selectEntityImages } = require("../utils/imageUtils");

// Base query for selecting substrates with related components
const selectSubstratesQuery = `
  SELECT 
    substrates.id AS substrate_id,
    substrates.name AS substrate_name,
    substrates.image_url AS substrate_image_url,
    substrates.user_id AS substrate_user_id,
    substrates.is_public AS substrate_is_public,
    substrates.created_at AS substrate_created_at,

    substrate_components.id AS substrate_component_id,
    substrate_components.substrate_id AS substrate_component_substrate_id,
    substrate_components.component_id AS substrate_component_component_id,
    substrate_components.parts AS substrate_component_parts,

    components.id AS component_id,
    components.name AS component_name,
    components.fineness AS component_fineness
  FROM substrates
  LEFT JOIN substrate_components 
    ON substrates.id = substrate_components.substrate_id
  LEFT JOIN components 
    ON substrate_components.component_id = components.id
`;

// Function to select substrates with dynamic conditions
const selectSubstrates = async (conditions = {}, params = []) => {
  const whereClauses = [];

  if (conditions.user_id) {
    whereClauses.push("substrates.user_id = ?");
    params.push(conditions.user_id);
  }
  if (conditions.is_public !== undefined) {
    whereClauses.push("substrates.is_public = ?");
    params.push(conditions.is_public);
  }
  if (conditions.id) {
    whereClauses.push("substrates.id = ?");
    params.push(conditions.id);
  }

  const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const query = `${selectSubstratesQuery} ${whereSQL}`;

  // Fetch rows from the database
  const [rows] = await pool.query(query, params);

  // Group substrates by substrate_id
  const substratesMap = new Map();
  for (const row of rows) {
    const {
      substrate_id,
      substrate_name,
      substrate_image_url,
      substrate_user_id,
      substrate_is_public,
      substrate_created_at,
      component_id,
      component_name,
      component_fineness,
      substrate_component_parts,
    } = row;

    if (!substratesMap.has(substrate_id)) {
      substratesMap.set(substrate_id, {
        substrate_id,
        substrate_name,
        substrate_image_url,
        user_id: substrate_user_id,
        is_public: substrate_is_public,
        created_at: substrate_created_at,
        components: [],
        images: [],
      });
    }
    const substrate = substratesMap.get(substrate_id);

    if (component_id) {
      substrate.components.push({
        component_id,
        component_name,
        component_fineness,
        parts: substrate_component_parts,
      });
    }
  }

  const substrates = Array.from(substratesMap.values());

  // For each substrate, fetch images concurrently
  await Promise.all(
    substrates.map(async (substrate) => {
      const { latestImage, images } = await selectEntityImages("substrate", substrate.substrate_id);
      substrate.image_url = latestImage;
      substrate.images = images;
    })
  );

  return substrates;
};

// Wrapper for selecting a single substrate by ID
const selectSubstrate = (id) => selectSubstrates({ id });

// Wrapper for selecting public substrates
const selectPublicSubstrates = () => selectSubstrates({ is_public: true });

// Wrapper for selecting private substrates (by user_id)
const selectPrivateSubstrates = (user_id) => selectSubstrates({ user_id });

// Insert a substrate
const insertSubstrate = (name, user_id, image_url = null, is_public = false) =>
  pool.query(
    "INSERT INTO substrates (name, user_id, image_url, is_public) VALUES (?, ?, ?, ?)",
    [name, user_id, image_url, is_public]
  );

// Insert a substrate component
const insertSubstrateComponent = (substrate_id, component_id, parts) =>
  pool.query(
    "INSERT INTO substrate_components (substrate_id, component_id, parts) VALUES (?, ?, ?)",
    [substrate_id, component_id, parts]
  );

// Update a substrate
const updateSubstrate = (id, name, user_id, image_url = null, is_public = false) =>
  pool.query(
    "UPDATE substrates SET name = ?, image_url = ?, is_public = ? WHERE id = ? AND user_id = ?",
    [name, image_url, is_public, id, user_id]
  );

// Update a substrate component
const updateSubstrateComponent = (substrate_id, component_id, parts) =>
  pool.query(
    `
      INSERT INTO substrate_components (substrate_id, component_id, parts)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE parts = ?
    `,
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

const deleteSubstrate = async (id, user_id) => {
  const query = "DELETE FROM substrates WHERE id = ? AND user_id = ?";
  return pool.query(query, [id, user_id]);
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
  deleteSubstrate
};
