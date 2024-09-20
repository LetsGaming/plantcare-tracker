const pool = require('../config/db');

const selectPrivatePlants = (user_id) => pool.query('SELECT * FROM plants WHERE user_id = ?' [user_id]);
const selectPublicPlants = () => pool.query('SELECT * FROM plants WHERE is_public = true');
const selectPrivatePlant = (id, user_id) => pool.query('SELECT * FROM plants WHERE id = ? AND user_id = ?', [id, user_id]);
const selectPublicPlant = (id) => pool.query('SELECT * FROM plants WHERE id = ? AND is_public = true', [id])

const insertPlant = (name, species, substrateId) =>
  pool.query('INSERT INTO plants (name, species, substrate_id) VALUES (?, ?, ?)', [name, species, substrateId]);

module.exports = { selectPrivatePlants, selectPublicPlants, selectPrivatePlant, selectPublicPlant, insertPlant };
