const path = require("path");
const logger = require('../utils/logger');
const loadEnv = require("../utils/envUtils.js");
const { insertImage, selectImage, selectImages } = require("../models/imageModel");

loadEnv();

const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg'];
const NAS_PATH = process.env.NAS_PATH || null;
const uploadDir = NAS_PATH || path.resolve(__dirname, '../../uploads');

const uploadImage = async (req, res) => {
  try {
    const imageFile = req.file;
    const { plantId } = req.params;
    const { date = Date.now() } = req.body;
    const parsedDate = new Date(date).toISOString();

    if (!imageFile) {
      return res.status(400).json({ message: "No file was uploaded or 'image' field is missing." });
    }

    if (!plantId) {
      return res.status(400).json({ message: "Plant ID (plantId) is required." });
    }

    if (!allowedMimeTypes.includes(imageFile.mimetype)) {
      return res.status(400).json({ message: "Uploaded file is not a valid image format (png, jpeg, jpg)." });
    }

    const filePath = path.join(uploadDir, imageFile.filename);
    await insertImage(plantId, filePath, parsedDate);

    res.status(200).json({ message: "Image uploaded successfully", filePath });
  } catch (err) {
    logger.error("Error during image upload", err.message);
    res.status(500).json({ message: "An error occurred while uploading the image.", error: err.message });
  }
};

const getImages = async (req, res) => {
  try {
    const [images] = await selectImages();
    res.status(200).json(images);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
};

const getImage = async (req, res) => {
  const { plantId } = req.params;
  try {
    const [result] = await selectImage(plantId);
    if (!result) {
      return res.status(404).json({ message: "Image not found" });
    }
    res.status(200).json(result);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { uploadImage, getImages, getImage };
