const pool = require('../config/db');

const getPlants = () => pool.query('SELECT * FROM plants');
const addPlant = (name, species, substrateId) =>
  pool.query('INSERT INTO plants (name, species, substrate_id) VALUES (?, ?, ?)', [name, species, substrateId]);

module.exports = { getPlants, addPlant };
