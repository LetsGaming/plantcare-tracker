const fs = require("fs");
const path = require("path");
const express = require("express");
const imageProxy = express.Router();
const { errorResponse } = require("../utils/responseUtils");

const NAS_PATH = process.env.NAS_PATH;

if (!NAS_PATH) {
  console.warn("NAS_PATH not set, proxy routes will not serve images.");
}

imageProxy.get("/:imageName", (req, res) => {
  const imageName = req.params.imageName;
  if (!NAS_PATH) return errorResponse(res, "NAS_PATH not configured", 500);

  const nasImagePath = path.join(NAS_PATH, imageName);

  fs.access(nasImagePath, fs.constants.F_OK, (err) => {
    if (err) {
      return errorResponse(res, "Image not found", 404);
    }

    res.sendFile(nasImagePath);
  });
});

module.exports = imageProxy;
