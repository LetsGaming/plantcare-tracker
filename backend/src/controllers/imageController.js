const path = require("path");
const fs = require("fs").promises;
const logger = require("../utils/logger");
const {
  insertImage,
  selectImages,
  updateImage,
  deleteImage,
} = require("../models/imageModel");
const {
  successResponse,
  errorResponse,
  notFoundResponse,
} = require("../utils/responseUtils.js");
const { formatToDBDate } = require("../utils/generalUtils.js");
const { getPublicImagePath } = require("../utils/imageUtils.js");

const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg"];
const NAS_PATH = process.env.NAS_PATH || null;
const uploadDir = NAS_PATH || "/uploads";
const uploadPath = NAS_PATH || path.resolve(__dirname, "../../uploads");

const uploadImage = async (req, res) => {
  try {
    const imageFile = req.file;
    const { entityType, entityId } = req.params;

    if (!imageFile) {
      return errorResponse(res, "No file was uploaded or 'image' field is missing.", 400);
    }

    if (!entityType || !entityId) {
      return errorResponse(res, "Both entityType and entityId are required.", 400);
    }

    if (!allowedMimeTypes.includes(imageFile.mimetype)) {
      return errorResponse(res, "Invalid image format. Only PNG, JPEG, and JPG files are allowed.", 400);
    }

    const { date = Date.now() } = req.body;
    const parsedDate = formatToDBDate(date);

    const filePath = getPublicImagePath(req, entityType, imageFile.filename);

    await insertImage(entityType, entityId, filePath, parsedDate);

    successResponse(
      res,
      { path: filePath, date: parsedDate },
      "Image uploaded successfully.",
      201
    );
  } catch (err) {
    logger.error("Error during image upload", err.message);
    errorResponse(res, "An error occurred while uploading the image.", 500, err);
  }
};

const updateSpecificImage = async (req, res) => {
  try {
    const imageFile = req.file;
    const { id, entityType } = req.params;
    const { date } = req.body;

    if (!id) {
      return errorResponse(res, "Image ID is required to update the image.");
    }

    if (!date && !imageFile) {
      return errorResponse(res, "At least one of 'date' or 'image' fields is required to update the image.");
    }

    if (imageFile && !allowedMimeTypes.includes(imageFile.mimetype)) {
      return res.status(400).json({
        message: "Uploaded file is not a valid image format (png, jpeg, jpg).",
      });
    }

    let parsedDate = date ? formatToDBDate(date) : undefined;
    let filePath = imageFile ? getPublicImagePath(req, entityType, imageFile.filename) : undefined;

    await updateImage(id, { date: parsedDate, filePath });

    successResponse(
      res,
      { path: filePath },
      "Image updated successfully."
    );
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

const deleteSpecificImage = async (req, res, deleteFromDb = true) => {
  const {entityType, id } = req.params;
  try {
    // Retrieve the image details before deleting
    const [imageResults] = await selectImages({ id });
    if (!imageResults.length) {
      if (deleteFromDb)
        return notFoundResponse(res, "Image not found or already deleted");
      return false;
    }

    let imagePath = imageResults[0].image_url;
    if (imagePath.startsWith("http")) {
      const filename = path.basename(imagePath); // Extract just the filename
      const basePath = path.join(uploadPath, entityType);
      imagePath = path.join(basePath, filename); // Construct the local file path
    }
    // Check if file exists before trying to delete
    await deleteImageOnSystem(imagePath);

    // Delete the image record from the database
    if (deleteFromDb) {
      const result = await deleteImage(id);

      if (result.affectedRows === 0) {
        return notFoundResponse(
          res,
          "Image not found or not authorized to delete"
        );
      }
      successResponse(res, { deleted: true }, "Image deleted successfully");
    } else {
      return true;
    }
  } catch (err) {
    logger.error("Error deleting image:", err);
    if (deleteFromDb)
      return errorResponse(res, "Internal Server Error while deleting image");
    return false;
  }
};

const deleteImagesByEntityHandler = async (req, res) => {
  const { entityType, entityId } = req.params;

  const result = await deleteImagesByEntity(entityType, entityId);

  if (!result.success) {
    return errorResponse(res, result.message);
  }

  successResponse(res, { deleted: true }, result.message);
};

/**
 * Deletes all images for a given entityType and entityId.
 * @param {string} entityType - The type of entity (e.g., "plant", "substrate", "component").
 * @param {number} entityId - The ID of the entity.
 * @returns {Promise<{ success: boolean, message: string }>} - Operation result.
 */
const deleteImagesByEntity = async (entityType, entityId) => {
  try {
    const [imageResults] = await selectImages({
      entity_type: entityType,
      entity_id: entityId,
    });

    if (!imageResults.length) {
      return {
        success: false,
        message: "No images found for the given entity.",
      };
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
    return {
      success: false,
      message: "Internal Server Error while deleting images.",
    };
  }
};

const deleteImageOnSystem = async (imagePath) => {
  try {
    await fs.access(imagePath); // Verify file existence
    await fs.unlink(imagePath); // Delete the file
    logger.info(`Deleted image file: ${imagePath}`);
  } catch (fileError) {
    logger.warn(
      `File not found or could not be deleted: ${imagePath} \n`,
      fileError
    );
  }
};

module.exports = {
  uploadImage,
  getImages,
  getImage,
  updateSpecificImage,
  deleteSpecificImage,
  deleteImagesByEntityHandler,
  deleteImagesByEntity,
};
