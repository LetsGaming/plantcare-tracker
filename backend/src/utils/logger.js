const path = require('path');
const fs = require('fs');
const { createLogger, format, transports } = require('winston');
const { combine, printf } = format;

// Determine the base directory for logs
const logDir = path.resolve(__dirname, '../../logs');

// Ensure logs directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for logging
const logFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});

// Custom timestamp function
const customTimestamp = () => {
  const now = new Date();
  const formatNumber = (num) => String(num).padStart(2, '0');

  const day = formatNumber(now.getDate());
  const month = formatNumber(now.getMonth() + 1); // Months are 0-based
  const year = now.getFullYear();
  const hours = formatNumber(now.getHours());
  const minutes = formatNumber(now.getMinutes());
  const seconds = formatNumber(now.getSeconds());

  return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
};

// Create a Winston logger instance
const logger = createLogger({
  format: combine(
    format.timestamp({ format: customTimestamp }),
    logFormat
  ),
  transports: [
    new transports.Console(),  // Log to console
    new transports.File({ filename: path.join(logDir, 'info.log'), level: 'info' }),
    new transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
  ],
});

// Export the logger instance
module.exports = logger;
