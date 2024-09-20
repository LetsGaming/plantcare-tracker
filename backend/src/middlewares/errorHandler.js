const logger = require('../utils/logger');

// Global Error Handler Middleware
function errorHandler(err, req, res, next) {
  const statusCode = err.status || 500;

  // Log the error with additional context
  logger.error(`${statusCode} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  
  res.status(statusCode).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
  });
}

module.exports = errorHandler;
