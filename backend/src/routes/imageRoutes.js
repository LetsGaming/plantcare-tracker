const express = require("express");
const multer = require("multer");
const fs = require("fs").promises;
const path = require("path");
const ExifParser = require("exif-parser");
const sharp = require("sharp");
const { authenticateToken } = require("../middlewares/authMiddleware");
const {
  uploadImage,
  updateSpecificImage,
  getImages,
  getImage,
  deleteSpecificImage,
  deleteImagesByEntityHandler,
} = require("../controllers/imageController");
const { imageGetLimiter } = require("../middlewares/rateLimiter");

const { validationErrorResponse } = require("../utils/responseUtils");
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

/**
 * Anonymizes an image filename, removes PII, and ensures the length 
 * stays within safe limits.
 * * @param {string} fileName - The original filename.
 * @param {Object} options - Configuration for anonymization.
 * @param {string[]} options.contextKeywords - Words to prioritize.
 * @param {number} options.maxLength - Maximum length of the final string (default 50).
 * @returns {string} The anonymized, length-controlled filename.
 */
function anonymizeImageName(fileName, { contextKeywords = [], maxLength = 50 } = {}) {
  if (!fileName || typeof fileName !== 'string') return 'img.jpg';

  // 1. Separate extension and name
  const lastDotIndex = fileName.lastIndexOf('.');
  const extension = lastDotIndex !== -1 ? fileName.slice(lastDotIndex).toLowerCase() : '.jpg';
  const extensionLength = extension.length;
  
  // 2. Clean the name part
  let namePart = lastDotIndex !== -1 ? fileName.slice(0, lastDotIndex) : fileName;
  let cleanName = namePart
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase
    .replace(/[_-]/g, ' ')               // Replace separators with spaces
    .replace(/[^a-zA-Z0-9 ]/g, '')       // Remove special chars
    .toLowerCase();

  const tokens = cleanName.split(/\s+/);

  // 3. Filter tokens (Remove PII and meaningless numbers)
  const piiRedlist = ['admin', 'user', 'owner', 'desktop', 'download', 'iphone', 'android', 'tmp'];
  const filteredTokens = tokens.filter(token => {
    const isKeyword = contextKeywords.includes(token);
    const isTooShort = token.length < 2;
    const isPii = piiRedlist.includes(token.toLowerCase());
    const isNumeric = /^\d+$/.test(token);
    return isKeyword || (!isPii && !isTooShort && !isNumeric);
  });

  // 4. Build base string
  let baseName = filteredTokens.length > 0 ? filteredTokens.join('-') : 'image';

  // 5. Short Hash (to prevent collisions)
  const hash = Math.random().toString(36).substring(2, 6); // 4 chars
  const suffix = `-${hash}${extension}`; // e.g., "-a2b3.jpg" (9 chars approx)

  // 6. Enforce Max Length
  // We need to truncate the baseName so that: baseName + suffix <= maxLength
  const maxBaseLength = maxLength - suffix.length;

  if (baseName.length > maxBaseLength) {
    // Truncate at the last whole word if possible
    let truncated = baseName.substring(0, maxBaseLength);
    const lastDash = truncated.lastIndexOf('-');
    
    // If there's a dash within the last 10 chars, cut there for cleaner look
    if (lastDash > maxBaseLength - 10) {
      baseName = truncated.substring(0, lastDash);
    } else {
      baseName = truncated;
    }
  }

  return `${baseName}${suffix}`;
}

const NAS_PATH =
  process.env.NAS_PATH || path.resolve(__dirname, "../../uploads");

const processAndStoreImage = (options = { requireEntityType: false }) => {
  return async (req, res, next) => {
    try {
      if (!req.file) {
        return validationErrorResponse(res, "No image file provided.");
      }

      const entityType = req.params.entityType || "generic";
      const uploadPath = options.requireEntityType
        ? path.join(NAS_PATH, entityType)
        : NAS_PATH;

      // 1. Create directory (Async/Non-blocking)
      await fs.mkdir(uploadPath, { recursive: true });

      // 2. Anonymize the name
      // Note: Passing maxLength 30 because we are adding a timestamp prefix later
      const baseAnonymizedName = anonymizeImageName(req.file.originalname, {
        contextKeywords: [entityType],
        maxLength: 30 
      }).replace(/\.[^/.]+$/, ""); // Strip whatever extension the function gave back

      // 3. Construct final name (Date + Anonymized Part + WebP)
      const uniqueFilename = `${Date.now()}-${baseAnonymizedName}.webp`;
      const outputPath = path.join(uploadPath, uniqueFilename);

      // 4. Extract EXIF data
      const imageBuffer = req.file.buffer;
      const extractedDate = await extractImageDate(imageBuffer);
      if (extractedDate) {
        // Storing as ISO string or timestamp is usually better for DBs
        req.body.date = extractedDate.getTime();
      }

      // 5. Process Image
      await sharp(imageBuffer)
        .resize({ 
          width: 1024, 
          withoutEnlargement: true // Prevents blurring small images by stretching them
        })
        .toFormat("webp")
        .webp({ quality: 70, nearLossless: true })
        .toFile(outputPath);

      // 6. Update req object for the next controller
      req.file.path = outputPath;
      req.file.filename = uniqueFilename;

      next();
    } catch (err) {
      console.error("Image Processing Error:", err);
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
