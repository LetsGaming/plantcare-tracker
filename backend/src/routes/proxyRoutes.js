const fs = require("fs");
const express = require("express");
const imageProxy = express.Router();
const { errorResponse } = require("../utils/responseUtils");

const dotenv = require("dotenv"); // Import dotenv to load environment variables
// Load environment variables from .env file
dotenv.config();

const NAS_PATH = process.env.NAS_PATH || null;
imageProxy.get("/uploads/:imageName", (req, res) => {
  const imageName = req.params.imageName;
  const nasImagePath = path.join(NAS_PATH, imageName); // Path to the image on NAS

  // Check if the image exists on the NAS
  fs.access(nasImagePath, fs.constants.F_OK, (err) => {
    if (err) {
      return errorResponse(res, "Image not found", 404);
    }

    // If exists, serve the image
    res.sendFile(nasImagePath);
  });
});

module.exports = imageProxy;
