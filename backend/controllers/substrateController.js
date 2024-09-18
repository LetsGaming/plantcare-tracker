const { selectSubstrates, selectSubstrate, insertSubstrate } = require('../models/substrateModel');

const getSubstrates = async (req, res) => {
  try {
    const [substrates] = await selectSubstrates();
    res.json(substrates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getSubstrate = async (req, res) => {
  try {
    const { id } = req.params;
    const [substrate] = await selectSubstrate(id);
    if (!substrate) {
      return res.status(404).json({ error: "Substrate not found" });
    }
    res.status(201).json(substrate);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const addSubstrate = async (req, res) => {
  const { name } = req.body;
  try {
    const [result] = await insertSubstrate(name);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getSubstrates, getSubstrate, addSubstrate };
