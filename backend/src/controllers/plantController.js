const {
  selectPrivatePlants,
  selectPublicPlants,
  selectPrivatePlant,
  selectPublicPlant,
  insertPlant,
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

// Controller for fetching a single private plant
const getPrivatePlant = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id || null;
  await getPlant(res, selectPrivatePlant, id, userId);
};

// Controller for fetching public plants
const getPublicPlants = async (req, res) => {
  await getPlants(res, selectPublicPlants);
};

// Controller for fetching a single public plant
const getPublicPlant = async (req, res) => {
  const { id } = req.params;
  await getPlant(res, selectPublicPlant, id);
};

// Controller for adding a new plant
const addPlant = async (req, res) => {
  const { name, species, substrateId } = req.body;
  const userId = req.user ? req.user.id : null;

  try {
    validatePlantData(name, species, substrateId);
    const [plant] = await insertPlant(name, species, substrateId, userId);
    const plantId = plant.insertId;

    successResponse(res, { plantId }, 201);
  } catch (err) {
    const status = err.message === "Name, species, and substrateId are required." ? 400 : 500;
    errorResponse(res, err, status);
  }
};

module.exports = {
  getPrivatePlants,
  getPrivatePlant,
  getPublicPlants,
  getPublicPlant,
  addPlant,
};
