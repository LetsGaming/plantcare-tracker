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

function _parseExifDate(value) {
  if (!value) return null;

  let date;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number") {
    const isSeconds = String(value).length === 10;
    date = new Date(isSeconds ? value * 1000 : value);
  } else if (typeof value === "string") {
    // Normalize EXIF format: YYYY:MM:DD HH:mm:ss
    const normalized = value.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
    date = new Date(normalized);
  } else {
    return null;
  }

  if (isNaN(date.getTime())) return null;

  // Reject obviously bogus dates
  if (date.getFullYear() < 1990) return null;
  if (date.getTime() > Date.now() + 60 * 1000) return null;

  return date;
}

// Helper function to extract the image's creation date
async function extractImageDate(fileBuffer) {
  const fallbackDate = new Date();

  try {
    const parser = ExifParser.create(fileBuffer);
    const result = parser.parse();

    if (!result || !result.tags) {
      return fallbackDate;
    }

    const tags = result.tags;

    const candidates = [
      tags.DateTimeOriginal,
      tags.CreateDate,
      tags.ModifyDate,
      tags.GPSDateStamp,
    ];

    for (let value of candidates) {
      const parsed = _parseExifDate(value);
      if (parsed) {
        return parsed;
      }
    }

    return fallbackDate;
  } catch (err) {
    logger.error("EXIF extraction failed", err);
    return fallbackDate;
  }
}

function anonymizeImageName(
  fileName,
  { contextKeywords = [], maxLength = 50 } = {},
) {
  if (!fileName || typeof fileName !== "string") return "img.jpg";

  const lastDotIndex = fileName.lastIndexOf(".");
  const extension =
    lastDotIndex !== -1 ? fileName.slice(lastDotIndex).toLowerCase() : ".jpg";

  let namePart =
    lastDotIndex !== -1 ? fileName.slice(0, lastDotIndex) : fileName;
  let cleanName = namePart
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .toLowerCase();

  const tokens = cleanName.split(/\s+/);

  const piiRedlist = [
    "admin",
    "user",
    "owner",
    "desktop",
    "download",
    "iphone",
    "android",
    "tmp",
  ];
  const filteredTokens = tokens.filter((token) => {
    const isKeyword = contextKeywords.includes(token);
    const isTooShort = token.length < 2;
    const isPii = piiRedlist.includes(token.toLowerCase());
    const isNumeric = /^\d+$/.test(token);
    return isKeyword || (!isPii && !isTooShort && !isNumeric);
  });

  let baseName = filteredTokens.length > 0 ? filteredTokens.join("-") : "image";
  const hash = Math.random().toString(36).substring(2, 6);
  const suffix = `-${hash}${extension}`;

  const maxBaseLength = maxLength - suffix.length;

  if (baseName.length > maxBaseLength) {
    let truncated = baseName.substring(0, maxBaseLength);
    const lastDash = truncated.lastIndexOf("-");
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

      await fs.mkdir(uploadPath, { recursive: true });

      const baseAnonymizedName = anonymizeImageName(req.file.originalname, {
        contextKeywords: [entityType],
        maxLength: 30,
      }).replace(/\.[^/.]+$/, "");

      const uniqueFilename = `${Date.now()}-${baseAnonymizedName}.webp`;
      const outputPath = path.join(uploadPath, uniqueFilename);

      const imageBuffer = req.file.buffer;
      const extractedDate = await extractImageDate(imageBuffer);
      if (extractedDate) {
        req.body.date = extractedDate.getTime();
      }

      await sharp(imageBuffer)
        .resize({
          width: 1024,
          withoutEnlargement: true,
        })
        .toFormat("webp")
        .webp({ quality: 70, nearLossless: true })
        .toFile(outputPath);

      req.file.path = outputPath;
      req.file.filename = uniqueFilename;

      next();
    } catch (err) {
      logger.error("Image Processing Error:", err);
      next(err);
    }
  };
};

router.post(
  "/:entityType/:entityId",
  authenticateToken,
  upload.single("image"),
  processAndStoreImage({ requireEntityType: true }),
  uploadImage,
);

router.get("/:entityType", imageGetLimiter, authenticateToken, getImages);

router.get(
  "/:entityType/:entityId",
  imageGetLimiter,
  authenticateToken,
  getImage,
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
  updateSpecificImage,
);

router.delete("/image/:entityType/:id", authenticateToken, deleteSpecificImage);

router.delete(
  "/:entityType/:entityId",
  authenticateToken,
  deleteImagesByEntityHandler,
);

module.exports = router;
