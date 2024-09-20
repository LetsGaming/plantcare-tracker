const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { authenticateToken } = require("../middlewares/authMiddleware");
const {
  uploadImage,
  getImages,
  getImage,
} = require("../controllers/imageController");

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

// Upload image for a specific plant
router.post("/:plantId", authenticateToken, upload.single("image"), uploadImage);

// Get all images (authenticated)
router.get("/", authenticateToken, getImages);

// Get a specific image for a plant (authenticated)
router.get("/:plantId", authenticateToken, getImage);

module.exports = router;
