const {
  selectPrivatePlants,
  selectPublicPlants,
  selectPrivatePlant,
  selectPublicPlant,
  insertPlant,
} = require("../models/plantModel");
const logger = require("../utils/logger");

const getPrivatePlants = async (req, res) => {
  try {
    const userId = req.body.userId;

    const [plants] = await selectPrivatePlants(userId);
    res.status(200).json(plants);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
}

// Get a specific private plant for the authenticated user
const getPrivatePlant = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId || null;

    const [plant] = await selectPrivatePlant(id, userId);

    if (!plant) {
      return res.status(404).json({ message: "Plant not found" });
    }

    res.status(200).json(plant);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Error fetching plant" });
  }
};

// Get all public plants
const getPublicPlants = async (req, res) => {
  try {
    const [plants] = await selectPublicPlants();
    res.status(200).json(plants);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Get a specific public plant
const getPublicPlant = async (req, res) => {
  try {
    const { id } = req.params;

    const [plant] = await selectPublicPlant(id);

    if (!plant) {
      return res.status(404).json({ message: "Plant not found" });
    }

    res.status(200).json(plant);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Error fetching plant" });
  }
};

// Insert a plant (remains unchanged)
const addPlant = async (req, res) => {
  const { name, species, substrateId } = req.body;
  try {
    const [result] = await insertPlant(name, species, substrateId);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getPrivatePlants,
  getPrivatePlant,
  getPublicPlants,
  getPublicPlant,
  addPlant,
};
