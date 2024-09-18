const pool = require('../config/db');

const selectPlants = () => pool.query('SELECT * FROM plants');
const selectPlant = (id) => pool.query('SELECT * FROM plants WHERE id = ?', [id]);

const insertPlant = (name, species, substrateId) =>
  pool.query('INSERT INTO plants (name, species, substrate_id) VALUES (?, ?, ?)', [name, species, substrateId]);

module.exports = { selectPlants, selectPlant, insertPlant };
