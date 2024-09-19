const { selectPlants, selectPlant, insertPlant } = require("../models/plantModel");
const logger = require("../utils/logger");

const getPlants = async (req, res) => {
  try {
    const [plants] = await selectPlants();
    res.status(201).json(plants);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
};

const getPlant = async (req, res) => {
  try {
    const { id } = req.params;
    const [plant] = await selectPlant(id);
    if (!plant) {
      return res.status(404).json({ message: "Plant not found" });
    }
    res.status(201).json(plant);
  } catch (err)  {
    logger.error(err);
    res.status(500).json({ error: "Error fetching plant" });
  }
}

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

module.exports = { getPlants, getPlant, addPlant };
