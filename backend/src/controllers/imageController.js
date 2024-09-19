const path = require("path");
const logger = require('../utils/logger');
const loadEnv = require("../utils/envUtils.js");
const { insertImage, selectImage, selectImages } = require("../models/imageModel");

loadEnv();

const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg'];
const NAS_PATH = process.env.NAS_PATH || null; // Set NAS path if available
const uploadDir = NAS_PATH || path.resolve(__dirname, '../../uploads'); // Use NAS_PATH or local 'uploads' folder

const uploadImage = async (req, res) => {
  try {
    const imageFile = req.file; // Multer provides req.file
    const { plantId } = req.params;
    const { date = Date.now() } = req.body;
    const parsedDate = new Date(date).toISOString(); // Ensure ISO 8601 format

    // Validate file existence
    if (!imageFile) {
      return res.status(400).json({
        message: "No file was uploaded or 'image' field is missing.",
      });
    }

    // Validate plantId
    if (!plantId) {
      return res.status(400).json({ message: "Plant ID (plantId) is required." });
    }

    // Validate image MIME type
    if (!allowedMimeTypes.includes(imageFile.mimetype)) {
      return res.status(400).json({
        message: "Uploaded file is not a valid image format (png, jpeg, jpg).",
      });
    }

    // Generate file path (Mulder has already saved the file)
    const filePath = path.join(uploadDir, imageFile.filename);

    // Insert image data into the database
    await insertImage(plantId, filePath, parsedDate);

    // Respond with success message
    res.status(200).json({ message: "Image uploaded successfully", filePath });
  } catch (err) {
    logger.error("Error during image upload", err.message);
    res.status(500).json({
      message: "An error occurred while uploading the image.",
      error: err.message,
    });
  }
};

const getImages = async (req, res) => {
  try {
    const [images] = await selectImages();
    res.status(201).json(images);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: err.message });
  }
};

const getImage = async (req, res) => {
  const { plantId } = req.params;
  try {
    const [result] = await selectImage(plantId);
    res.status(201).json(result);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { uploadImage, getImages, getImage };
