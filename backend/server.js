// server.js
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables
dotenv.config();

// Import routes and utilities
const authRoutes = require("./src/routes/authRoutes");
const plantRoutes = require("./src/routes/plantRoutes");
const substrateRoutes = require("./src/routes/substrateRoutes");
const componentRouter = require("./src/routes/componentRoutes");
const wateringRoutes = require("./src/routes/wateringRoutes");
const imageRoutes = require("./src/routes/imageRoutes");
const moreInfoRoutes = require("./src/routes/moreInfoRoutes");
const imageProxy = require("./src/routes/proxyRoutes");
const logger = require("./src/utils/logger");

// Import middlewares
const { limiter } = require("./src/middlewares/rateLimiter");
const { notFoundHandler, globalErrorHandler } = require("./src/middlewares/errorHandler");
const { checkGuestPermission } = require("./src/middlewares/authMiddleware");

// Get API version from package.json
const { versionPath } = require("./package.json");

// Create the Express application
const app = express();
const PORT = process.env.PORT || 5000;

/**
 * Configure allowed origins.
 * Includes localhost and any additional origins from the ALLOWED_ORIGINS env variable.
 */
const allowedOrigins = [
  "http://localhost:8100",
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
    : []),
];

/**
 * CORS configuration options.
 * It allows requests if the origin is in allowedOrigins or if no origin is provided.
 */
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., mobile apps or curl requests)
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

/**
 * Set up global middleware.
 */
function setupMiddleware(app) {
  // Enable CORS for all routes
  app.use(cors(corsOptions));
  // Preflight requests for all routes
  app.options("*", cors(corsOptions));

  // Parse JSON bodies and cookies
  app.use(express.json());
  app.use(cookieParser());

  // Apply rate limiting and guest permission checks
  app.use(limiter);
  app.use(checkGuestPermission);
}

/**
 * Set up static file serving or proxy for uploads.
 */
function setupUploads(app) {
  const NAS_PATH = process.env.NAS_PATH || null;
  const uploadDir = NAS_PATH ? path.resolve(NAS_PATH) : path.resolve(__dirname, "./uploads");

  if (NAS_PATH) {
    // Use proxy route for uploads if NAS path is defined
    app.use(`/uploads`, imageProxy);
  } else {
    // Serve static files from the uploads directory
    app.use("/uploads", express.static(uploadDir));
  }
}

/**
 * Register API routes.
 */
function setupRoutes(app) {
  const baseRoute = `/api/${versionPath}`;
  app.use(`${baseRoute}/auth`, authRoutes);
  app.use(`${baseRoute}/plants`, plantRoutes);
  app.use(`${baseRoute}/substrates`, substrateRoutes);
  app.use(`${baseRoute}/components`, componentRouter);
  app.use(`${baseRoute}/watering`, wateringRoutes);
  app.use(`${baseRoute}/images`, imageRoutes);
  app.use(`${baseRoute}/more-info`, moreInfoRoutes);
}

/**
 * Set up error handling middleware.
 */
function setupErrorHandlers(app) {
  app.use(notFoundHandler);
  app.use(globalErrorHandler);
}

/**
 * Initialize the server with all configuration.
 */
function initializeServer(app) {
  setupMiddleware(app);
  setupUploads(app);
  setupRoutes(app);
  setupErrorHandlers(app);
}

initializeServer(app);

// Start the server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
