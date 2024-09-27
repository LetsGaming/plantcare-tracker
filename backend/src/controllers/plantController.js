const {
  selectPrivatePlants,
  selectPublicPlants,
  selectPlant,
  insertPlant,
  updatePlant,
} = require("../models/plantModel");

const { errorResponse, successResponse } = require("../utils/responseUtils");

// Centralized validation logic for plant data
const validatePlantData = (name, species, substrateId) => {
  if (!name || !species || !substrateId) {
    throw new Error("Name, species, and substrateId are required.");
  }
};

// Centralized fetch logic for private and public plant retrieval
const getPlant = async (res, selectPlantFn, id, userId = null) => {
  try {
    const [plant] = await selectPlantFn(id, userId);
    if (!plant) {
      return res.status(404).json({ message: "Plant not found" });
    }
    successResponse(res, plant);
  } catch (err) {
    errorResponse(res, err, 500, "Error fetching plant");
  }
};

// Get all plants (Private or Public based on selectPlantFn)
const getPlants = async (res, selectPlantsFn, userId = null) => {
  try {
    const plants = await selectPlantsFn(userId);

    successResponse(res, plants);
  } catch (err) {
    errorResponse(res, err);
  }
};

// Controller for fetching private plants
const getPrivatePlants = async (req, res) => {
  const userId = req.user.id;
  await getPlants(res, selectPrivatePlants, userId);
};

// Controller for fetching a single plant
const getSpecificPlant = async (req, res) => {
  const { id } = req.params;
  await getPlant(res, selectPlant, id);
};

// Controller for fetching public plants
const getPublicPlants = async (req, res) => {
  await getPlants(res, selectPublicPlants);
};

// Controller for adding a new plant
const addPlant = async (req, res) => {
  const { name, species, substrateId, isPublic } = req.body;
  const userId = req.user ? req.user.id : null;

  try {
    validatePlantData(name, species, substrateId);
    const [plant] = await insertPlant(
      name,
      species,
      substrateId,
      isPublic || false,
      userId
    );
    const plantId = plant.insertId;

    successResponse(res, { plantId }, 201);
  } catch (err) {
    const status =
      err.message === "Name, species, and substrateId are required."
        ? 400
        : 500;
    errorResponse(res, err, status);
  }
};

// Controller for updating a plant (partially)
const editPlant = async (req, res) => {
  const { id } = req.params;
  const userId = req.user ? req.user.id : null;
  const { name, species, substrateId, isPublic } = req.body;

  try {
    // If no fields are provided to update, throw an error
    if (!name && !species && !substrateId && isPublic === undefined) {
      errorResponse(res, "At least one field must be provided for update", 400);
    }

    // Partially update the plant in the database
    const result = await updatePlant(id, userId, {
      name,
      species,
      substrateId,
      isPublic,
    });

    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        "Plant not found or not authorized to update",
        404
      );
    }

    successResponse(res, { message: "Plant updated successfully" });
  } catch (err) {
    errorResponse(res, err, 500, "Error updating plant");
  }
};

module.exports = {
  getPrivatePlants,
  getPublicPlants,
  getSpecificPlant,
  addPlant,
  editPlant,
};
