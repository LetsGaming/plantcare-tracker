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

const { errorResponse } = require("../utils/responseUtils");
const logger = require("../utils/logger");

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

    let extractedDate =
      exifData.tags.DateTimeOriginal || exifData.tags.CreateDate;
    if (!extractedDate) return defaultDate;

    // Handle Unix timestamp (seconds) case
    if (
      typeof extractedDate === "number" &&
      String(extractedDate).length === 10
    ) {
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

const NAS_PATH =
  process.env.NAS_PATH || path.resolve(__dirname, "../../uploads");

const processAndStoreImage = (options = { requireEntityType: false }) => {
  return async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
      }

      const entityType = req.params.entityType || "generic";
      const uploadPath = options.requireEntityType
        ? path.join(NAS_PATH, entityType)
        : NAS_PATH;

      // Create directory if it doesn't exist
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }

      const originalName = path.parse(req.file.originalname).name;
      const uniqueFilename = `${Date.now()}-${originalName}.webp`;
      const outputPath = path.join(uploadPath, uniqueFilename);

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

      next();
    } catch (err) {
      next(err);
    }
  };
};

router.post(
  "/:entityType/:entityId",
  authenticateToken,
  upload.single("image"),
  processAndStoreImage({ requireEntityType: true }),
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
  "/image/:entityType/:id",
  authenticateToken,
  upload.single("image"),
  async (req, res, next) => {
    try {
      if (!req.file && !req.body.date) {
        return res
          .status(400)
          .json({ error: "No file or date provided for update." });
      }

      if (req.file) {
        await deleteSpecificImage(req, res, false);
      }

      next();
    } catch (err) {
      next(err);
    }
  },
  processAndStoreImage({ requireEntityType: true }),
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
