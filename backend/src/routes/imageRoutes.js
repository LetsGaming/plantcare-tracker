const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const { authenticateToken } = require("../middlewares/authMiddleware");
const {
  uploadImage,
  getImages,
  getImage,
  deleteSpecificImage,
  deleteImagesByEntityHandler,
} = require("../controllers/imageController");
const { imageGetLimiter } = require("../middlewares/rateLimiter");

const dotenv = require("dotenv"); // Import dotenv to load environment variables

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

router.post(
  "/:entityType/:entityId",
  authenticateToken,
  upload.single("image"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
      }

      // Move image processing to memory, delay saving it
      req.processedImage = await sharp(req.file.buffer)
        .resize({ width: 1024 })
        .toFormat("webp")
        .webp({ quality: 70 })
        .toBuffer(); // Keep in memory

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

// Delete a specific image by its ID
router.delete("/image/:id", authenticateToken, deleteSpecificImage);

// Delete all images associated with a specific entity
router.delete(
  "/:entityType/:entityId",
  authenticateToken,
  deleteImagesByEntityHandler
);

module.exports = router;
