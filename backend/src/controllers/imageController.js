const path = require("path");
const logger = require("../utils/logger");
const loadEnv = require("../utils/envUtils.js");
const {
  insertImage,
  selectImage,
  selectImages,
} = require("../models/imageModel");
const { successResponse, errorResponse } = require("../utils/responseUtils.js");

loadEnv();

const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg"];
const NAS_PATH = process.env.NAS_PATH || null;
const uploadDir = NAS_PATH || "/uploads";

const uploadImage = async (req, res) => {
  try {
    const imageFile = req.file;
    const { plantId } = req.params;
    const { date = Date.now() } = req.body;
    const parsedDate = new Date(date).toISOString();

    if (!imageFile) {
      return res
        .status(400)
        .json({ message: "No file was uploaded or 'image' field is missing." });
    }

    if (!plantId) {
      return res
        .status(400)
        .json({ message: "Plant ID (plantId) is required." });
    }

    if (!allowedMimeTypes.includes(imageFile.mimetype)) {
      return res
        .status(400)
        .json({
          message:
            "Uploaded file is not a valid image format (png, jpeg, jpg).",
        });
    }
    let baseUrl = uploadDir;
    if (!NAS_PATH) {
      baseUrl = `${req.protocol}://${req.get("host")}${uploadDir}`;
    }
    const filePath = path.join(baseUrl, imageFile.filename);
    await insertImage(plantId, filePath, parsedDate);
    successResponse(res, {
      message: "Image uploaded successfully.",
      path: filePath,
    });
  } catch (err) {
    logger.error("Error during image upload", err.message);
    errorResponse(res, "An error occurred while uploading the image.");
  }
};

const getImages = async (req, res) => {
  try {
    const [images] = await selectImages();
    successResponse(res, images);
  } catch (err) {
    logger.error(err);
    errorResponse(res, `Internal Server Error while getting images`);
  }
};

const getImage = async (req, res) => {
  const { plantId } = req.params;
  try {
    const [result] = await selectImage(plantId);
    if (!result) {
      return res.status(404).json({ message: "Image not found" });
    }
    successResponse(res, result);
  } catch (err) {
    logger.error(err);
    errorResponse(res, `Internal Server Error while getting image`);
  }
};

module.exports = { uploadImage, getImages, getImage };
