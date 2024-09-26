const pool = require("../config/db");

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
const selectSubstrates = (conditions = {}, params = []) => {
  let whereClauses = [];

  if (conditions.id) {
    whereClauses.push("substrates.id = ?");
    params.push(conditions.id);
  }

  const whereSQL = whereClauses.length
    ? `WHERE ${whereClauses.join(" AND ")}`
    : "";
  const query = `${selectSubstratesQuery} ${whereSQL}`;

  return pool.query(query, params).then(([rows]) => {
    const substrates = rows.reduce((acc, row) => {
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

      let substrate = acc.find((s) => s.substrate_id === substrate_id);
      if (!substrate) {
        substrate = {
          substrate_id,
          substrate_name,
          substrate_image_url,
          user_id: substrate_user_id,
          is_public: substrate_is_public,
          created_at: substrate_created_at,
          components: [],
        };
        acc.push(substrate);
      }

      if (component_id) {
        // Ensuring there's a component to push
        const component = {
          component_id,
          component_name,
          component_fineness,
          parts: substrate_component_parts,
        };
        substrate.components.push(component);
      }

      return acc;
    }, []);

    return substrates;
  });
};

// Wrapper for selecting a single substrate by ID
const selectSubstrate = (id) => selectSubstrates({ id });

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
const updateSubstrate = (
  id,
  name,
  user_id,
  image_url = null,
  is_public = false
) =>
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

module.exports = {
  selectSubstrates,
  selectSubstrate,
  insertSubstrate,
  insertSubstrateComponent,
  updateSubstrate,
  updateSubstrateComponent,
  deleteSubstrateComponents,
};
