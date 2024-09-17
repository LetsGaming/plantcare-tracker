const pool = require('../config/db');

const getSubstrates = async (req, res) => {
  try {
    const [substrates] = await pool.query('SELECT * FROM substrates');
    res.json(substrates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const addSubstrate = async (req, res) => {
  const { name } = req.body;
  try {
    const [result] = await pool.query('INSERT INTO substrates (name) VALUES (?)', [name]);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getSubstrates, addSubstrate };
