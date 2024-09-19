const path = require('path');
const fs = require('fs');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf } = format;

// Determine the base directory (root of the project where the script is executed)
const logDir = path.resolve(__dirname, '../../logs');

// Ensure logs directory exists at the root of the project
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Custom format for logging
const logFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});

// Create a Winston logger instance
const logger = createLogger({
  format: combine(
    timestamp(),
    logFormat
  ),
  transports: [
    new transports.Console(),  // Log to console
    new transports.File({ filename: path.join(logDir, 'info.log'), level: 'info' }),  // Log info and above to info.log
    new transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' })  // Log errors to error.log
  ],
});

// Export the logger instance
module.exports = logger;