const {
  selectSubstrates,
  selectSubstrate,
  insertSubstrate,
  insertSubstrateComponent,
  insertComponent,
  updateComponentById,
} = require("../models/substrateModel");
const logger = require("../utils/logger");

const getSubstrates = async (req, res) => {
  try {
    const [substrates] = await selectSubstrates();
    res.status(200).json(substrates);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
};

const getSubstrate = async (req, res) => {
  const { id } = req.params;

  try {
    const [substrate] = await selectSubstrate(id);
    if (!substrate) {
      return res.status(404).json({ error: "Substrate not found" });
    }
    res.status(200).json(substrate);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
};

const addSubstrate = async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Name is required." });
  }

  try {
    const user = req.user;
    const [result] = await insertSubstrate(name, user.id);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
};

const addSubstrateComponents = async (req, res) => {
  const { substrateId, components } = req.body;

  if (!substrateId || !Array.isArray(components) || components.length === 0) {
    return res
      .status(400)
      .json({
        error: "Invalid input: substrateId and components array are required.",
      });
  }

  try {
    const insertPromises = components.map(({ componentId, parts }) => {
      const decimalParts = parseFloat(parts).toFixed(2);
      console.log("parts: ", parts);
      console.log("decimalParts: ", decimalParts);
      return insertSubstrateComponent(substrateId, componentId, decimalParts);
    });

    const [results] = await Promise.all(insertPromises);
    res.status(201).json(results);
  } catch (error) {
    logger.error(error);
    res
      .status(500)
      .json({
        error: "Failed to add substrate components. Please try again later.",
      });
  }
};

const addComponent = async (req, res) => {
  const { name, fineness } = req.body;
  if (!name || !["Grob", "Mittel", "Fein"].includes(fineness)) {
    return res.status(400).json({ error: "Invalid component data" });
  }

  try {
    const [result] = await insertComponent(name, fineness);
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ error: "Failed to add component." });
  }
};

const updateComponent = async (req, res) => {
  const { id } = req.params;
  const { name, fineness } = req.body;

  if (!name || !["Grob", "Mittel", "Fein"].includes(fineness)) {
    return res.status(400).json({ error: "Invalid component data" });
  }

  try {
    const [result] = await updateComponentById(id, name, fineness);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Component not found" });
    }
    res.status(200).json({ message: "Component updated successfully" });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ error: "Failed to update component." });
  }
};

module.exports = {
  getSubstrates,
  getSubstrate,
  addSubstrate,
  addSubstrateComponents,
  addComponent,
  updateComponent,
};
