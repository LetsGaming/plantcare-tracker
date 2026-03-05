const mysql = require('mysql2');
const logger = require('../utils/logger.js');

// Validate required environment variables
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    logger.error(`Database environment variable ${key} is missing.`);
    process.exit(1);
  }
});

// Configure pool settings with defaults and environment overrides
const poolConfig = {
  connectionLimit: process.env.DB_CONNECTION_LIMIT ? parseInt(process.env.DB_CONNECTION_LIMIT, 10) : 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  queueLimit: process.env.DB_QUEUE_LIMIT ? parseInt(process.env.DB_QUEUE_LIMIT, 10) : 0,
};

// Create a promise-based connection pool
const pool = mysql.createPool(poolConfig).promise();

// Centralized error handler for database connection errors
const handleConnectionError = (err) => {
  logger.error(`Database connection error: ${err.message}`);
  switch (err.code) {
    case 'PROTOCOL_CONNECTION_LOST':
      logger.error('Database connection was closed.');
      break;
    case 'ER_CON_COUNT_ERROR':
      logger.error('Too many connections to the database.');
      break;
    case 'ECONNREFUSED':
      logger.error('Database connection was refused.');
      break;
    default:
      logger.error('Unexpected database error:', err);
  }
  process.exit(1);
};

// Test the connection asynchronously when the pool is created
(async () => {
  try {
    const connection = await pool.getConnection();
    logger.info('Database connection established successfully.');
    connection.release();
  } catch (err) {
    handleConnectionError(err);
  }
})();

module.exports = pool;
