const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { authenticateToken } = require("../middlewares/authMiddleware");
const {
  uploadImage,
  getImages,
  getImage,
  deleteSpecificImage,
  deleteImagesByEntityHandler,
} = require("../controllers/imageController");
const { imageGetLimiter } = require("../middlewares/rateLimiter");

const loadEnv = require("../utils/envUtils");
loadEnv();

const router = express.Router();

// Configure Multer for file upload handling
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const NAS_PATH = process.env.NAS_PATH || null;
    const uploadDir = NAS_PATH || path.resolve(__dirname, "../../uploads");

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + file.originalname;
    cb(null, uniqueSuffix);
  },
});

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

// Upload image for a specific entity
router.post(
  "/:entityType/:entityId",
  authenticateToken,
  upload.single("image"),
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
