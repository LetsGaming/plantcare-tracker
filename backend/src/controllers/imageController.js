const path = require("path");
const fs = require("fs");
const logger = require("../utils/logger");
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
const { formatToDBDate } = require("../utils/generalUtils.js");

const dotenv = require("dotenv"); // Import dotenv to load environment variables
// Load environment variables from .env file
dotenv.config();

const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg"];
const NAS_PATH = process.env.NAS_PATH || path.resolve(__dirname, "../../uploads");
const uploadDir = NAS_PATH || "/uploads";
const uploadPath = NAS_PATH || path.resolve(__dirname, "../../uploads");

const uploadImage = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { date = Date.now() } = req.body;
    const parsedDate = formatToDBDate(date);

    if (!req.file || !req.processedImage) {
      return res.status(400).json({ message: "No valid image uploaded." });
    }

    if (!entityType || !entityId) {
      return res
        .status(400)
        .json({ message: "Both entityType and entityId are required." });
    }

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        message: "Uploaded file is not a valid image format (png, jpeg, jpg).",
      });
    }
    if (!fs.existsSync(NAS_PATH)) {
      fs.mkdirSync(NAS_PATH, { recursive: true });
    }

    const uniqueFilename = `${Date.now()}-${path.parse(req.file.originalname).name}.webp`;
    const outputPath = path.join(NAS_PATH, uniqueFilename);
    // Construct base URL/path for the file
    let baseUrl = uploadDir;
    if (!NAS_PATH) {
      baseUrl = `${req.protocol}://${req.get("host")}${uploadDir}`;
    }
    const filePath = path.join(baseUrl, uniqueFilename);

    // First, insert the database entry
    await insertImage(entityType, entityId, filePath, parsedDate);

    // If DB insert is successful, then save the file
    await fs.promises.writeFile(outputPath, req.processedImage);

    successResponse(res, {
      message: "Image uploaded successfully.",
      path: filePath,
    });
  } catch (err) {
    logger.error("Error during image upload", err.message);
    errorResponse(res, "An error occurred while uploading the image.", 500, err);
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
    // Retrieve the image details before deleting
    const [imageResults] = await selectImages({ id });

    if (!imageResults.length) {
      return notFoundResponse(res, "Image not found or already deleted");
    }

    const imagePath = imageResults[0].image_url;

    if (imagePath.startsWith("http")) {
      const filename = path.basename(imagePath); // Extract just the filename
      imagePath = path.join(uploadPath, filename); // Construct the local file path
    }
    
    // Check if file exists before trying to delete
    await deleteImageOnSystem(imagePath);

    // Delete the image record from the database
    const result = await deleteImage(id);

    if (result.affectedRows === 0) {
      return notFoundResponse(
        res,
        "Image not found or not authorized to delete"
      );
    }

    successResponse(res, { message: "Image deleted successfully" });
  } catch (err) {
    logger.error("Error deleting image:", err.message);
    errorResponse(res, "Internal Server Error while deleting image");
  }
};

const deleteImagesByEntityHandler = async (req, res) => {
  const { entityType, entityId } = req.params;

  const result = await deleteImagesByEntity(entityType, entityId);

  if (!result.success) {
    return errorResponse(res, result.message);
  }

  successResponse(res, { message: result.message });
};

/**
 * Deletes all images for a given entityType and entityId.
 * @param {string} entityType - The type of entity (e.g., "plant", "substrate", "component").
 * @param {number} entityId - The ID of the entity.
 * @returns {Promise<{ success: boolean, message: string }>} - Operation result.
 */
const deleteImagesByEntity = async (entityType, entityId) => {
  try {
    const [imageResults] = await selectImages({ entity_type: entityType, entity_id: entityId });

    if (!imageResults.length) {
      return { success: false, message: "No images found for the given entity." };
    }

    for (const image of imageResults) {
      let imagePath = image.image_url;

      // If the image URL is a full URL, convert it to an absolute file path
      if (imagePath.startsWith("http")) {
        const filename = path.basename(imagePath); // Extract just the filename
        imagePath = path.join(uploadPath, filename); // Construct the local file path
      }

      // Try deleting the image file from disk/NAS
      await deleteImageOnSystem(imagePath);

      // Delete the image record from the database
      await deleteImage(image.image_id);
    }

    return { success: true, message: "Images deleted successfully." };
  } catch (err) {
    logger.error("Error deleting images:", err.message);
    return { success: false, message: "Internal Server Error while deleting images." };
  }
};

const deleteImageOnSystem = async (imagePath) => {
  try {
    await fs.access(imagePath); // Verify file existence
    await fs.unlink(imagePath); // Delete the file
    logger.info(`Deleted image file: ${imagePath}`);
  } catch (fileError) {
    logger.warn(`File not found or could not be deleted: ${imagePath} \n`, fileError);
  }
}

module.exports = { uploadImage, getImages, getImage, deleteSpecificImage, deleteImagesByEntityHandler, deleteImagesByEntity };
