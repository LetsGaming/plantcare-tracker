const logger = require("./logger");

const successResponse = (res, data, statusCode = 200) => {
  res.status(statusCode).json({ success: true, data: data });
};

const errorResponse = (res, error, statusCode = 500) => {
  logger.error(error);
  res.status(statusCode).json({ success: false, error: error });
};

module.exports = { successResponse, errorResponse };
