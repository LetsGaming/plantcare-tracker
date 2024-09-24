const fs = require("fs");
const express = require("express");
const imageProxy = express.Router();

const loadEnv = require("../utils/envUtils");
loadEnv();

const NAS_PATH = process.env.NAS_PATH || null;
imageProxy.get("/uploads/:imageName", (req, res) => {
  const imageName = req.params.imageName;
  const nasImagePath = path.join(NAS_PATH, imageName); // Path to the image on NAS

  // Check if the image exists on the NAS
  fs.access(nasImagePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ message: "Image not found on NAS" });
    }

    // If exists, serve the image
    res.sendFile(nasImagePath);
  });
});

module.exports = imageProxy;
