const loadEnv = () => {
  const dotenv = require("dotenv");

  // Set the current working directory to the directory containing server.js
  const path = require("path");
  process.chdir(path.dirname(process.argv[1]));

  dotenv.config();
};

module.exports = loadEnv;
