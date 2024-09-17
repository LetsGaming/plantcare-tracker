const pool = require('../config/db');

const getPlants = async (req, res) => {
  try {
    const [plants] = await pool.query('SELECT * FROM plants');
    res.json(plants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const addPlant = async (req, res) => {
  const { name, species, substrateId } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO plants (name, species, substrate_id) VALUES (?, ?, ?)',
      [name, species, substrateId]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getPlants, addPlant };
