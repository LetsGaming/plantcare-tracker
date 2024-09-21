const {
  selectPrivatePlants,
  selectPublicPlants,
  selectPrivatePlant,
  selectPublicPlant,
  insertPlant,
} = require("../models/plantModel");

const { errorResponse } = require("../utils/responseUtils");

const validatePlantData = (name, species, substrateId) => {
  if (!name || !species || !substrateId) {
    throw new Error("Name, species, and substrateId are required.");
  }
};

const getPrivatePlants = async (req, res) => {
  try {
    const userId = req.body.userId;
    const [plants] = await selectPrivatePlants(userId);
    res.status(200).json(plants);
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
    res.status(200).json(plant);
  } catch (err) {
    errorResponse(res, err, 500, "Error fetching plant");
  }
};

const getPublicPlants = async (req, res) => {
  try {
    const [plants] = await selectPublicPlants();
    res.status(200).json(plants);
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
    res.status(200).json(plant);
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
    res.status(201).json({ id: plant.insertId });
  } catch (err) {
    errorResponse(res, err, err.message === "Name, species, and substrateId are required." ? 400 : 500);
  }
};

module.exports = {
  getPrivatePlants,
  getPrivatePlant,
  getPublicPlants,
  getPublicPlant,
  addPlant,
};
