const pool = require("../config/db");
const { selectSubstrate } = require("./substrateModel");
const { selectImages } = require("./imageModel");
const { formatImageUrl } = require("../utils/generalUtils");

// Base query for selecting plants with related substrate information
const selectPlantsQuery = `
  SELECT 
    plants.id as plant_id,
    plants.name as plant_name,
    plants.species as plant_species,
    plants.is_public as is_public,
    plants.created_at as plant_created_at,
    substrates.id as substrate_id,
    substrates.name as substrate_name
  FROM plants
  LEFT JOIN substrates ON plants.substrate_id = substrates.id
`;

// Function to select plants with dynamic conditions
const selectPlants = async (conditions = {}, params = [], req) => {
  let whereClauses = [];

  if (conditions.user_id) {
    whereClauses.push("plants.user_id = ?");
    params.push(conditions.user_id);
  }
  if (conditions.is_public !== undefined) {
    whereClauses.push("plants.is_public = ?");
    params.push(conditions.is_public);
  }
  if (conditions.id) {
    whereClauses.push("plants.id = ?");
    params.push(conditions.id);
  }

  const whereSQL = whereClauses.length
    ? `WHERE ${whereClauses.join(" AND ")}`
    : "";
  const query = `${selectPlantsQuery} ${whereSQL}`;

  // First, fetch the plant data
  const [plantsRows] = await pool.query(query, params);

  // Now, for each plant, get its substrate and images
  const plantsWithDetails = await Promise.all(
    plantsRows.map(async (plant) => {
      const [substrate] = await selectSubstrate(plant.substrate_id);

      // Fetch images for the current plant
      const [imagesRows] = await selectImages({ plant_id: plant.plant_id });

      // Correctly format the latest image URL if available
      const latestImage =
        imagesRows.length > 0
          ? formatImageUrl(imagesRows[0].image_url) // Use the formatting function
          : null;

      // Prepare images array with correctly formatted URLs
      const images = imagesRows.map((image) => ({
        id: image.image_id,
        url: formatImageUrl(image.image_url), // Use the formatting function
        date: image.upload_date,
      }));

      return {
        plant_id: plant.plant_id,
        plant_name: plant.plant_name,
        plant_species: plant.plant_species,
        image_url: latestImage, // Main image
        is_public: plant.is_public,
        plant_created_at: plant.plant_created_at,
        substrate,
        images,
      };
    })
  );

  return plantsWithDetails;
};

// Wrapper for selecting private plants
const selectPrivatePlants = (user_id) => selectPlants({ user_id: user_id });

// Wrapper for selecting public plants
const selectPublicPlants = () => selectPlants({ is_public: true });

// Wrapper for selecting a specific private plant by ID and user ID
const selectPlant = (id) =>
  selectPlants({ id: id });

// Insert a new plant
const insertPlant = (name, species, substrate_id, is_public, user_id) =>
  pool.query(
    "INSERT INTO plants (name, species, substrate_id, is_public, user_id) VALUES (?, ?, ?, ?, ?)",
    [name, species, substrate_id, is_public, user_id]
  );

// Dynamically update an existing plant by ID
const updatePlant = async (id, user_id, fields) => {
  const updates = [];
  const params = [];

  // Dynamically build the update query based on provided fields
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

  // If there are no fields to update, return early
  if (updates.length === 0) {
    throw new Error("No fields provided for update.");
  }

  // Add the ID and user_id to the parameters for the WHERE clause
  params.push(id, user_id);

  const query = `
    UPDATE plants 
    SET ${updates.join(", ")}
    WHERE id = ? AND user_id = ?
  `;

  return pool.query(query, params);
};

module.exports = {
  selectPrivatePlants,
  selectPublicPlants,
  selectPlant,
  insertPlant,
  updatePlant,
};
