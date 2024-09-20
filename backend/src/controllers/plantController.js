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
    logger.error(err);
    res.status(500).json({ error: "Error fetching plant" });
  }
};

const getPublicPlants = async (req, res) => {
  try {
    const [plants] = await selectPublicPlants();
    res.status(200).json(plants);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
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
    logger.error(err);
    res.status(500).json({ error: "Error fetching plant" });
  }
};

const addPlant = async (req, res) => {
  const { name, species, substrateId } = req.body;
  if (!name || !species || !substrateId) {
    return res.status(400).json({ error: "Name, species, and substrateId are required." });
  }

  try {
    const user = req.user;
    const [plant] = await insertPlant(name, species, substrateId, user.id);
    res.status(201).json({ id: plant.insertId });
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
