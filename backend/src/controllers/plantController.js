const {
  selectPrivatePlants,
  selectPublicPlants,
  selectPrivatePlant,
  selectPublicPlant,
  insertPlant,
} = require("../models/plantModel");

const { errorResponse, successResponse } = require("../utils/responseUtils");

const validatePlantData = (name, species, substrateId) => {
  if (!name || !species || !substrateId) {
    throw new Error("Name, species, and substrateId are required.");
  }
};

const getPrivatePlants = async (req, res) => {
  try {
    const userId = req.body.userId;
    const [plants] = await selectPrivatePlants(userId);
    successResponse(res, plants);
  } catch (err) {
    errorResponse(res, err);
  }
};

const getPrivatePlant = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId || null;

  try {
    const [plant] = await selectPrivatePlant(id, userId);
    if (!plant) {
      return res.status(404).json({ message: "Plant not found" });
    }
    successResponse(res, plant);
  } catch (err) {
    errorResponse(res, err, 500, "Error fetching plant");
  }
};

const getPublicPlants = async (req, res) => {
  try {
    const [plants] = await selectPublicPlants();
    successResponse(res, plants);
  } catch (err) {
    errorResponse(res, err);
  }
};

const getPublicPlant = async (req, res) => {
  const { id } = req.params;

  try {
    const [plant] = await selectPublicPlant(id);
    if (!plant) {
      return res.status(404).json({ message: "Plant not found" });
    }
    successResponse(res, plant);
  } catch (err) {
    errorResponse(res, err, 500, "Error fetching plant");
  }
};

const addPlant = async (req, res) => {
  const { name, species, substrateId } = req.body;

  try {
    validatePlantData(name, species, substrateId);
    const user = req.user;
    const [plant] = await insertPlant(name, species, substrateId, user.id);
    const plantId = plant.insertId;
    const data = {
      data: {
        plantId,
      },
    };
    res.status(201).json(data);
  } catch (err) {
    errorResponse(
      res,
      err,
      err.message === "Name, species, and substrateId are required." ? 400 : 500
    );
  }
};

module.exports = {
  getPrivatePlants,
  getPrivatePlant,
  getPublicPlants,
  getPublicPlant,
  addPlant,
};
