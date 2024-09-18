const pool = require("../config/db");

const selectSubstrates = () => pool.query("SELECT * FROM substrates");
const selectSubstrate = (id) =>
  pool.query("SELECT * FROM substrates WHERE id = ?", [id]);

const insertSubstrate = (name) =>
  pool.query("INSERT INTO substrates (name) VALUES (?)", [name]);

module.exports = { selectSubstrates, selectSubstrate, insertSubstrate };
