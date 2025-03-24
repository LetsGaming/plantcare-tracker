const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const ExifParser = require("exif-parser");
const sharp = require("sharp");
const { authenticateToken } = require("../middlewares/authMiddleware");
const { cleanRequestBody } = require("../middlewares/generalMiddleware");
const {
  uploadImage,
  updateSpecificImage,
  getImages,
  getImage,
  deleteSpecificImage,
  deleteImagesByEntityHandler,
} = require("../controllers/imageController");
const { imageGetLimiter } = require("../middlewares/rateLimiter");

const dotenv = require("dotenv"); // Import dotenv to load environment variables
const { errorResponse } = require("../utils/responseUtils");
const logger = require("../utils/logger");

// Load environment variables from .env file
dotenv.config();

const router = express.Router();

// Configure Multer for file upload handling
const storage = multer.memoryStorage(); // Store file in memory for processing

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only png, jpeg, and jpg are allowed."));
    }
  },
});

// Helper function to extract the image's creation date
async function extractImageDate(fileBuffer) {
  const defaultDate = new Date();

  try {
    const parser = ExifParser.create(fileBuffer);
    const exifData = parser.parse();
    if (!exifData || !exifData.tags) return defaultDate;

    let extractedDate = exifData.tags.DateTimeOriginal || exifData.tags.CreateDate;
    if (!extractedDate) return defaultDate;

    // Handle Unix timestamp (seconds) case
    if (typeof extractedDate === "number" && String(extractedDate).length === 10) {
      extractedDate = new Date(extractedDate * 1000);
      const offset = extractedDate.getTimezoneOffset() * 60000;
      extractedDate = new Date(extractedDate.getTime() + offset);
    } else {
      extractedDate = new Date(extractedDate);
    }

    if (isNaN(extractedDate.getTime())) return defaultDate;

    return extractedDate;
  } catch (err) {
    logger.error("Error extracting EXIF data", err);
    return defaultDate;
  }
}

router.post(
  "/:entityType/:entityId",
  authenticateToken,
  upload.single("image"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
      }

      const NAS_PATH =
        process.env.NAS_PATH || path.resolve(__dirname, "../../uploads");
      if (!fs.existsSync(NAS_PATH)) {
        fs.mkdirSync(NAS_PATH, { recursive: true });
      }

      const uniqueFilename = `${Date.now()}-${
        path.parse(req.file.originalname).name
      }.webp`;
      const outputPath = path.join(NAS_PATH, uniqueFilename);

      const imageBuffer = req.file.buffer;
      const extractedDate = await extractImageDate(imageBuffer);
      if (extractedDate) {
        req.body.date = extractedDate.getTime();
      }
      await sharp(imageBuffer)
        .resize({ width: 1024 })
        .toFormat("webp")
        .webp({ quality: 70, nearLossless: true })
        .toFile(outputPath);

      req.file.path = outputPath;
      req.file.filename = uniqueFilename;
      req.body.date = extractedDate;
      next();
    } catch (error) {
      next(error);
    }
  },
  uploadImage
);

// Get all images (authenticated)
router.get("/:entityType", imageGetLimiter, authenticateToken, getImages);

// Get a specific image for a specific entity
router.get(
  "/:entityType/:entityId",
  imageGetLimiter,
  authenticateToken,
  getImage
);

router.patch(
  "/image/:id",
  authenticateToken,
  cleanRequestBody,
  upload.single("image"), // Multer processes "image" field from FormData
  async (req, res, next) => {
    try {
      // Ensure at least one valid update field is provided
      if (!req.file && !req.body.date) {
        return errorResponse(res, "No file or date provided for update.", 400);
      }

      // Only delete the old image if a new one is provided
      if (req.file) {
        await deleteSpecificImage(req, res, false);

        if (req.file.mimetype.includes("image")) {
          const NAS_PATH =
            process.env.NAS_PATH || path.resolve(__dirname, "../../uploads");

          // Ensure upload directory exists
          if (!fs.existsSync(NAS_PATH)) {
            fs.mkdirSync(NAS_PATH, { recursive: true });
          }

          const uniqueFilename = `${Date.now()}-${
            path.parse(req.file.originalname).name
          }.webp`;
          const outputPath = path.join(NAS_PATH, uniqueFilename);

          const imageBuffer = req.file.buffer;
          const extractedDate = await extractImageDate(imageBuffer);
          if (extractedDate) {
            req.body.date = extractedDate.getTime();
          }
          // Convert and save image using Sharp
          await sharp(imageBuffer)
            .resize({ width: 1024 })
            .toFormat("webp")
            .webp({ quality: 70, nearLossless: true })
            .toFile(outputPath);

          // Attach processed file path to request
          req.file.path = outputPath;
          req.file.filename = uniqueFilename;
        }
      }

      next(); // Pass control to updateSpecificImage
    } catch (error) {
      next(error);
    }
  },
  updateSpecificImage
);

// Delete a specific image by its ID
router.delete("/image/:id", authenticateToken, deleteSpecificImage);

// Delete all images associated with a specific entity
router.delete(
  "/:entityType/:entityId",
  authenticateToken,
  deleteImagesByEntityHandler
);

module.exports = router;
