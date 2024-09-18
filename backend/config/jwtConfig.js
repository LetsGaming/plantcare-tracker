const loadEnv = require("../utils/envUtils");

loadEnv();

module.exports = {
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRATION: '1h'
};
