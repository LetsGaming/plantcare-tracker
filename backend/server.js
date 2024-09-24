const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const authRoutes = require("./src/routes/authRoutes");
const plantRoutes = require("./src/routes/plantRoutes");
const substrateRoutes = require("./src/routes/substrateRoutes");
const componentRouter = require("./src/routes/componentRoutes");
const imageRoutes = require("./src/routes/imageRoutes");
const logger = require("./src/utils/logger");
const loadEnv = require("./src/utils/envUtils");
const path = require("path"); // Import path for path manipulation

const { versionPath } = require("./package.json");
const imageProxy = require("./src/routes/proxyRoutes");

const allowedOrigins = [
  "http://localhost:8100",
  // Add more origins as needed
];

loadEnv();

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
  app.use(cors(corsOptions));
  app.use(bodyParser.json());
  app.use(cookieParser());
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
  app.use(`${baseRoute}/images`, imageRoutes);
};

registerRoutes();

// Start the server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
