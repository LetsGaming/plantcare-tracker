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
const selectPrivatePlant = (id, user_id) =>
  selectPlants({ id: id, user_id: user_id });

// Wrapper for selecting a specific public plant by ID
const selectPublicPlant = (id) => selectPlants({ id: id, is_public: true });

// Insert a new plant
const insertPlant = (name, species, substrate_id, is_public, user_id) =>
  pool.query(
    "INSERT INTO plants (name, species, substrate_id, is_public, user_id) VALUES (?, ?, ?, ?, ?)",
    [name, species, substrate_id, is_public, user_id]
  );

module.exports = {
  selectPrivatePlants,
  selectPublicPlants,
  selectPrivatePlant,
  selectPublicPlant,
  insertPlant,
};
