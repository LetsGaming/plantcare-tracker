const path = require("path");
const fs = require("fs").promises;
const sharp = require("sharp");
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
  validationErrorResponse,
} = require("../utils/responseUtils.js");
const { formatToDBDate } = require("../utils/generalUtils.js");
const { getPublicImagePath } = require("../utils/imageUtils.js");

const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg"];
const NAS_PATH =
  process.env.NAS_PATH || path.resolve(__dirname, "../../uploads");

const uploadImage = async (req, res) => {
  try {
    const imageFile = req.file;
    const { entityType, entityId } = req.params;

    if (!imageFile) {
      return errorResponse(res, "No file uploaded.", 400);
    }

    const { date = Date.now() } = req.body;
    const parsedDate = formatToDBDate(date);
    const filePath = getPublicImagePath(req, entityType, imageFile.filename);

    await insertImage(entityType, entityId, filePath, parsedDate);

    successResponse(
      res,
      { path: filePath, date: parsedDate },
      "Image uploaded.",
      201,
    );
  } catch (err) {
    errorResponse(res, "Upload failed.", 500, err);
  }
};

const updateSpecificImage = async (req, res) => {
  try {
    const imageFile = req.file;
    const { id, entityType } = req.params;
    const { date } = req.body;

    let parsedDate = date ? formatToDBDate(date) : undefined;
    let filePath = imageFile
      ? getPublicImagePath(req, entityType, imageFile.filename)
      : undefined;

    await updateImage(id, { date: parsedDate, filePath });
    successResponse(res, { path: filePath }, "Image updated.");
  } catch (err) {
    errorResponse(res, "Update failed.", 500, err);
  }
};

const getImages = async (req, res) => {
  try {
    const { entityType } = req.params;
    const { entityId } = req.query;
    const [images] = await selectImages({
      entity_type: entityType,
      entity_id: entityId,
    });
    successResponse(res, images);
  } catch (err) {
    errorResponse(res, "Error fetching images", 500, err);
  }
};

/**
 * Handles fetching the physical image file with optional resizing via ?size=
 */
const getImage = async (req, res) => {
  const { entityType, entityId } = req.params;
  const { size } = req.query;

  try {
    const [results] = await selectImages({
      entity_type: entityType,
      entity_id: entityId,
    });

    const image = results[0];
    if (!image) return notFoundResponse(res, "Image not found");

    // Convert URL/DB path to local filesystem path
    const filename = path.basename(image.image_url);
    const localPath = path.join(NAS_PATH, entityType, filename);

    // Check if file exists
    await fs.access(localPath);

    let transform = sharp(localPath);

    // Apply resizing if size param is provided
    if (size) {
      const width = parseInt(size);
      if (!isNaN(width) && width > 0) {
        transform = transform.resize({ width, withoutEnlargement: true });
      }
    }

    const buffer = await transform.toFormat("webp").toBuffer();

    res.set("Content-Type", "image/webp");
    res.set("Cache-Control", "public, max-age=86400"); // Cache for 24 hours
    return res.send(buffer);
  } catch (err) {
    logger.error("getImage Error:", err);
    if (err.code === "ENOENT") return notFoundResponse(res, "File not on disk");
    errorResponse(res, "Internal Server Error");
  }
};

const deleteSpecificImage = async (req, res, deleteFromDb = true) => {
  const { entityType, id } = req.params;
  try {
    const [imageResults] = await selectImages({ id });
    if (!imageResults.length)
      return deleteFromDb ? notFoundResponse(res, "Not found") : false;

    let imagePath = imageResults[0].image_url;
    const filename = path.basename(imagePath);
    const fullPath = path.join(NAS_PATH, entityType, filename);

    await deleteImageOnSystem(fullPath);

    if (deleteFromDb) {
      await deleteImage(id);
      successResponse(res, { deleted: true }, "Deleted.");
    } else {
      return true;
    }
  } catch (err) {
    logger.error("Delete Error:", err);
    return deleteFromDb ? errorResponse(res, "Delete failed") : false;
  }
};

const deleteImagesByEntityHandler = async (req, res) => {
  const { entityType, entityId } = req.params;
  const [imageResults] = await selectImages({
    entity_type: entityType,
    entity_id: entityId,
  });

  for (const image of imageResults) {
    const filename = path.basename(image.image_url);
    const fullPath = path.join(NAS_PATH, entityType, filename);
    await deleteImageOnSystem(fullPath);
    await deleteImage(image.image_id);
  }
  successResponse(res, { deleted: true }, "Entity images cleared.");
};

const deleteImageOnSystem = async (imagePath) => {
  try {
    await fs.unlink(imagePath);
    logger.info(`Deleted: ${imagePath}`);
  } catch (e) {
    logger.warn(`Unlink failed: ${imagePath}`);
  }
};

module.exports = {
  uploadImage,
  getImages,
  getImage,
  updateSpecificImage,
  deleteSpecificImage,
  deleteImagesByEntityHandler,
};
