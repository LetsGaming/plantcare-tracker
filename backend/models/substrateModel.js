const pool = require('../config/db');

const getSubstrates = () => pool.query('SELECT * FROM substrates');
const addSubstrate = (name) => pool.query('INSERT INTO substrates (name) VALUES (?)', [name]);

module.exports = { getSubstrates, addSubstrate };
