// src/middlewares/errorHandler.js
const logger = require("../utils/logger");

/**
 * Middleware for handling 404 (Not Found) errors.
 */
const notFoundHandler = (req, res, next) => {
  res.status(404).json({ error: { message: "Not Found" } });
};

/**
 * Global error-handling middleware.
 * Logs the error and responds with a JSON error message.
 */
const globalErrorHandler = (err, req, res, next) => {
  logger.error(err);

  // If headers are already sent, delegate to the default Express error handler.
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;
  res.status(status).json({
    error: {
      message: err.message || "Internal Server Error",
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
};

module.exports = {
  notFoundHandler,
  globalErrorHandler,
};
