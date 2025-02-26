const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const authRoutes = require("./src/routes/authRoutes");
const plantRoutes = require("./src/routes/plantRoutes");
const substrateRoutes = require("./src/routes/substrateRoutes");
const componentRouter = require("./src/routes/componentRoutes");
const wateringRoutes = require("./src/routes/wateringRoutes");
const imageRoutes = require("./src/routes/imageRoutes");
const logger = require("./src/utils/logger");
const path = require("path"); // Import path for path manipulation
const dotenv = require("dotenv"); // Import dotenv to load environment variables

// Load environment variables from .env file
dotenv.config();

const { versionPath } = require("./package.json");
const imageProxy = require("./src/routes/proxyRoutes");
const { limiter } = require("./src/middlewares/rateLimiter");
const { checkGuestPermission } = require("./src/middlewares/authMiddleware");

// Parse ALLOWED_ORIGINS from environment variable
const allowedOrigins = [
  "http://localhost:8100",
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",").map(origin => origin.trim()) : [])
];

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware setup
const middlewareSetup = () => {
  const corsOptions = {
    origin: (origin, callback) => {
      if (allowedOrigins.includes(origin) || !origin) {
        callback(null, true); // Allow the request
      } else {
        callback(new Error("Not allowed by CORS")); // Reject the request
      }
    },
    credentials: true, // Allows credentials
  };
  app.use(limiter);
  app.use(cors(corsOptions));
  app.use(bodyParser.json());
  app.use(cookieParser());
  app.use(checkGuestPermission);
};

middlewareSetup();

const baseRoute = `/api/${versionPath}`;

// Serve images from NAS if available
const NAS_PATH = process.env.NAS_PATH || null;
const uploadDir = NAS_PATH
  ? path.resolve(NAS_PATH)
  : path.resolve(__dirname, "./uploads"); // Use NAS path if defined
if (NAS_PATH) {
  app.use(`/uploads`, imageProxy);
} else {
  app.use("/uploads", express.static(uploadDir)); // Make uploaded images accessible via '/uploads'
}

// Route registration
const registerRoutes = () => {
  app.use(`${baseRoute}/auth`, authRoutes);
  app.use(`${baseRoute}/plants`, plantRoutes);
  app.use(`${baseRoute}/substrates`, substrateRoutes);
  app.use(`${baseRoute}/components`, componentRouter);
  app.use(`${baseRoute}/watering`, wateringRoutes);
  app.use(`${baseRoute}/images`, imageRoutes);
};

registerRoutes();

// Start the server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
