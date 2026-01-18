const pool = require("../config/db");
const { selectSubstrate } = require("./substrateModel");
const { selectEntityImages } = require("../utils/imageUtils");

// Helper function to build the WHERE clause dynamically
const buildWhereClause = (conditions, params) => {
  const whereClauses = [];

  // Handle conditions for filtering by plant ID, user ID, and is_public
  if (conditions.id) {
    whereClauses.push("plants.id = ?");
    params.push(Number(conditions.id));
  }
  if (conditions.user_id) {
    whereClauses.push("plants.user_id = ?");
    params.push(Number(conditions.user_id));
  }
  if (conditions.is_public !== undefined) {
    whereClauses.push("plants.is_public = ?");
    params.push(Number(conditions.is_public));
  }

  return whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
};

// Base query to select plants with related substrate
const selectPlantsQuery = `
  SELECT 
    plants.id as plant_id,
    plants.user_id as user_id,
    plants.name as plant_name,
    plants.species as plant_species,
    plants.is_public as is_public,
    plants.created_at as plant_created_at,
    substrates.id as substrate_id,
    substrates.name as substrate_name
  FROM plants
  LEFT JOIN substrates ON plants.substrate_id = substrates.id
`;

const selectPlants = async (conditions = {}, params = []) => {
  const whereSQL = buildWhereClause(conditions, params);
  const query = `${selectPlantsQuery} ${whereSQL}`;

  // Fetch plant data
  const [plantsRows] = await pool.query(query, params);

  // Fetch related details for each plant concurrently
  const plantsWithDetails = await Promise.all(
    plantsRows.map(async (plant) => {
      const [substrate] = await selectSubstrate(plant.substrate_id, false);

      // Fetch images for the plant
      const { latestImage, images } = await selectEntityImages(
        "plant",
        plant.plant_id
      );

      return {
        plant_id: plant.plant_id,
        plant_user_id: plant.user_id,
        plant_name: plant.plant_name,
        plant_species: plant.plant_species,
        image_url: latestImage, // Main image
        is_public: plant.is_public,
        plant_created_at: plant.plant_created_at,
        substrate, // Substrate info
        images, // All images
      };
    })
  );

  return plantsWithDetails;
};

// Wrapper for selecting private plants by user_id
const selectPrivatePlants = (user_id) => selectPlants({ user_id });

// Wrapper for selecting public plants
const selectPublicPlants = () => selectPlants({ is_public: true });

// Wrapper for selecting a single plant by ID
const selectPlant = (id) => selectPlants({ id });

// Insert a new plant
const insertPlant = async (name, species, substrate_id, is_public, user_id) => {
  return await pool.query(
    "INSERT INTO plants (name, species, substrate_id, is_public, user_id) VALUES (?, ?, ?, ?, ?)",
    [name, species, substrate_id, is_public, user_id]
  );
};

// Dynamically update an existing plant
const updatePlant = async (id, user_id, fields) => {
  const updates = [];
  const params = [];

  // Build the update query based on provided fields
  if (fields.name) {
    updates.push("name = ?");
    params.push(fields.name);
  }
  if (fields.species) {
    updates.push("species = ?");
    params.push(fields.species);
  }
  if (fields.substrateId) {
    updates.push("substrate_id = ?");
    params.push(fields.substrateId);
  }
  if (fields.isPublic !== undefined) {
    updates.push("is_public = ?");
    params.push(fields.isPublic);
  }

  // If no fields to update, throw an error
  if (updates.length === 0) {
    throw new Error("No fields provided for update.");
  }

  // Add ID and user_id for WHERE clause
  params.push(id, user_id);

  const query = `
    UPDATE plants 
    SET ${updates.join(", ")}
    WHERE id = ? AND user_id = ?
  `;

  return await pool.query(query, params);
};

// Delete a plant by ID and user ID
const deletePlant = async (id, user_id) => {
  const query = "DELETE FROM plants WHERE id = ? AND user_id = ?";
  return await pool.query(query, [id, user_id]);
};

module.exports = {
  selectPrivatePlants,
  selectPublicPlants,
  selectPlant,
  insertPlant,
  updatePlant,
  deletePlant,
};
