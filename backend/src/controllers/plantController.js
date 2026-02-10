const {
  selectPrivatePlants,
  selectPublicPlants,
  selectPlant,
  insertPlant,
  updatePlant,
  deletePlant,
} = require("../models/plantModel");
const { deleteImagesByEntityHandler } = require("../controllers/imageController");
const {
  errorResponse,
  successResponse,
  notFoundResponse,
} = require("../utils/responseUtils");
const { filterDuplicatesById } = require("../utils/generalUtils");

// Centralized validation logic for plant data
const validatePlantData = (name, species, substrateId) => {
  if (!name || !species || !substrateId) {
    throw new Error("Name, species, and substrateId are required.");
  }
};

// Get all plants (Private or Public based on selectPlantFn)
const getPlants = async (res, selectPlantsFn, userId = null) => {
  try {
    const plants = await selectPlantsFn(userId);

    successResponse(res, plants);
  } catch (err) {
    errorResponse(res, "Error fetching plants", 500, err);
  }
};

// Controller for fetching all plants (both public and private)
const getAllPlants = async (req, res) => {
  try {
    const userId = req.user?.id ?? null;

    // Fetch public plants
    const publicPlants = await selectPublicPlants();

    // Fetch private plants only if user is logged in
    const privatePlants = userId ? await selectPrivatePlants(userId) : [];

    // Combine and filter duplicates
    const allPlants = filterDuplicatesById([...publicPlants, ...privatePlants], "plant_id");

    successResponse(res, allPlants);
  } catch (err) {
    errorResponse(res, "Error fetching plants", 500, err);
  }
};

// Controller for fetching private plants
const getPrivatePlants = async (req, res) => {
  const userId = req.user.id;

  await getPlants(res, selectPrivatePlants, userId);
};

// Controller for fetching public plants
const getPublicPlants = async (req, res) => {
  await getPlants(res, selectPublicPlants);
};

// Controller for fetching a single plant
const getSpecificPlant = async (req, res) => {
  const { id } = req.params;
  const [plant] = await selectPlant(id);
  if (!plant) {
    return notFoundResponse(res, "Plant not found");
  }
  successResponse(res, plant);
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

    successResponse(res, { plantId }, "Plant added successfully", 201);
  } catch (err) {
    const status =
      err.message === "Name, species, and substrateId are required."
        ? 400
        : 500;
    errorResponse(res, err.message, status, err);
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
      return notFoundResponse(
        res,
        "Plant not found or not authorized to update"
      );
    }

    successResponse(res, { updated: true }, "Plant updated successfully");
  } catch (err) {
    errorResponse(res, "Error updating plant", 500, err);
  }
};

const deleteSpecificPlant = async (req, res) => {
  const { id } = req.params;
  const userId = req.user ? req.user.id : null;

  try {
    const result = await deletePlant(id, userId);

    if (result.affectedRows === 0) {
      return notFoundResponse(
        res,
        "Plant not found or not authorized to delete"
      );
    }

    await deleteImagesByEntityHandler("plant", id);

    successResponse(res, { deleted: true }, "Plant deleted successfully");
  } catch (err) {
    errorResponse(res, "Error deleting plant", 500, err);
  }
};

module.exports = {
  getAllPlants,
  getPrivatePlants,
  getPublicPlants,
  getSpecificPlant,
  addPlant,
  editPlant,
  deleteSpecificPlant,
};
