const pool = require("../config/db");

// Base query for selecting substrates with related components
const selectSubstratesQuery = `
  SELECT 
    substrates.id as substrate_id,
    substrates.name as substrate_name,
    components.id as component_id,
    components.name as component_name,
    components.fineness as component_fineness,
    substrate_components.parts as parts
  FROM substrates
  LEFT JOIN substrate_components ON substrates.id = substrate_components.substrate_id
  LEFT JOIN components ON substrate_components.component_id = components.id
`;

// Function to select substrates with dynamic conditions
const selectSubstrates = (conditions = {}, params = []) => {
  let whereClauses = [];

  if (conditions.id) {
    whereClauses.push('substrates.id = ?');
    params.push(conditions.id);
  }

  const whereSQL = whereClauses.length ? ` WHERE ${whereClauses.join(' AND ')}` : '';
  const query = `${selectSubstratesQuery} ${whereSQL}`;

  return pool.query(query, params).then(([rows]) => { // Extract only the first element from the result

    const substrates = rows.reduce((acc, row) => {
      const {
        substrate_id,
        substrate_name,
        component_id,
        component_name,
        component_fineness,
        parts
      } = row;

      // Find the substrate or create it if it doesn't exist
      let substrate = acc.find(s => s.substrate_id === substrate_id);
      if (!substrate) {
        substrate = {
          substrate_id,
          substrate_name,
          components: []
        };
        acc.push(substrate);
      }

      // Create the component object
      const component = {
        component_id,
        component_name,
        component_fineness,
        parts
      };

      // Push the component to the substrate's components array
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
  selectSubstrates,
  selectSubstrate,
  insertSubstrate,
  insertSubstrateComponent,
  insertComponent,
  updateComponentById,
};
