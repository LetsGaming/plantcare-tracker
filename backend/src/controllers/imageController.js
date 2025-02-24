const path = require("path");
const logger = require("../utils/logger");
const loadEnv = require("../utils/envUtils.js");
const {
  insertImage,
  selectImages,
  deleteImage,
} = require("../models/imageModel");
const {
  successResponse,
  errorResponse,
  notFoundResponse,
} = require("../utils/responseUtils.js");

loadEnv();

const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg"];
const NAS_PATH = process.env.NAS_PATH || null;
const uploadDir = NAS_PATH || "/uploads";

const uploadImage = async (req, res) => {
  try {
    const imageFile = req.file;
    // Expecting generic entity details in the URL parameters
    const { entityType, entityId } = req.params;
    const { date = Date.now() } = req.body;
    const parsedDate = new Date(date).toISOString();

    if (!imageFile) {
      return res
        .status(400)
        .json({ message: "No file was uploaded or 'image' field is missing." });
    }

    if (!entityType || !entityId) {
      return res
        .status(400)
        .json({ message: "Both entityType and entityId are required." });
    }

    if (!allowedMimeTypes.includes(imageFile.mimetype)) {
      return res.status(400).json({
        message: "Uploaded file is not a valid image format (png, jpeg, jpg).",
      });
    }

    // Construct base URL/path for the file
    let baseUrl = uploadDir;
    if (!NAS_PATH) {
      baseUrl = `${req.protocol}://${req.get("host")}${uploadDir}`;
    }
    const filePath = path.join(baseUrl, imageFile.filename);

    await insertImage(entityType, entityId, filePath, parsedDate);
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
    // Optional query parameters for filtering images
    const { entityType, entityId } = req.query;
    const [images] = await selectImages({
      entity_type: entityType,
      entity_id: entityId,
    });
    successResponse(res, images);
  } catch (err) {
    logger.error(err);
    errorResponse(res, "Internal Server Error while getting images");
  }
};

const getImage = async (req, res) => {
  const { entityType, entityId } = req.query;
  try {
    // Retrieve a single image based on the provided entity details
    const [results] = await selectImages({
      entity_type: entityType,
      entity_id: entityId,
    });
    const image = results[0];
    if (!image) {
      return notFoundResponse(res, "Image not found");
    }
    successResponse(res, image);
  } catch (err) {
    logger.error(err);
    errorResponse(res, "Internal Server Error while getting image");
  }
};

const deleteSpecificImage = async (req, res) => {
  const { id } = req.params;
  try {
    // Delete an image based on its ID
    const res = await deleteImage(id);
    if (res.affectedRows === 0) {
      return notFoundResponse(
        res,
        "Image not found or not authorized to delete"
      );
    }
    successResponse(res, { message: "Image deleted successfully" });
  } catch (err) {
    logger.error(err);
    errorResponse(res, "Internal Server Error while deleting image");
  }
};

module.exports = { uploadImage, getImages, getImage, deleteSpecificImage };
