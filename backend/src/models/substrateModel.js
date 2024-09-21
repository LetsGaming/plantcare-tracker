const pool = require("../config/db");

// Base query for selecting substrates with related components
const selectSubstratesQuery = `
  SELECT 
    substrates.id as substrate_id,
    substrates.name as substrate_name,
    components.id as component_id,
    components.name as component_name,
    components.fineness as component_fineness,
    substrate_components.parts as parts,
    substrates.user_id as user_id
  FROM substrates
  LEFT JOIN substrate_components ON substrates.id = substrate_components.substrate_id
  LEFT JOIN components ON substrate_components.component_id = components.id
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
        component_id,
        component_name,
        component_fineness,
        parts,
      } = row;

      let substrate = acc.find((s) => s.substrate_id === substrate_id);
      if (!substrate) {
        substrate = {
          substrate_id,
          substrate_name,
          components: [],
        };
        acc.push(substrate);
      }

      const component = {
        component_id,
        component_name,
        component_fineness,
        parts,
      };

      substrate.components.push(component);
      return acc;
    }, []);

    return substrates;
  });
};

// Wrapper for selecting a single substrate by ID
const selectSubstrate = (id) => selectSubstrates({ id });

// Insert a substrate
const insertSubstrate = (name, user_id) =>
  pool.query("INSERT INTO substrates (name, user_id) VALUES (?, ?)", [
    name,
    user_id,
  ]);

// Insert a substrate component
const insertSubstrateComponent = (substrate_id, component_id, parts) =>
  pool.query(
    "INSERT INTO substrate_components (substrate_id, component_id, parts) VALUES (?, ?, ?)",
    [substrate_id, component_id, parts]
  );

// Update a substrate
const updateSubstrate = (id, name, user_id) => 
  pool.query("UPDATE substrates SET name = ? WHERE id = ? AND user_id = ?", [
    name,
    id,
    user_id,
  ]);

// Update a substrate component
const updateSubstrateComponent = (substrate_id, component_id, parts) =>
  pool.query(
    "UPDATE substrate_components SET parts = ? WHERE substrate_id = ? AND component_id = ?",
    [parts, substrate_id, component_id]
  );

module.exports = {
  selectSubstrates,
  selectSubstrate,
  insertSubstrate,
  insertSubstrateComponent,
  updateSubstrate,
  updateSubstrateComponent,
};
