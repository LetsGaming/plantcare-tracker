const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const authenticateToken = require("../middlewares/authMiddleware.js");
const {
  uploadImage,
  getImages,
  getImage,
} = require("../controllers/imageController");

const loadEnv = require("../utils/envUtils.js");
loadEnv();

const router = express.Router();
// Configure Multer for file upload handling
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Set upload directory; can be NAS_PATH or local uploads folder
    const NAS_PATH = process.env.NAS_PATH || null; // Set NAS path if available
    const uploadDir = NAS_PATH || path.resolve(__dirname, "../../uploads");

    // Ensure the directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true }); // Create the directory if it doesn't exist
    }

    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate a unique filename based on date and original filename
    const uniqueSuffix = Date.now() + "-" + file.originalname;
    cb(null, uniqueSuffix);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only png, jpeg, and jpg are allowed."));
    }
  },
});

router.post(
  "/:plantId",
  authenticateToken,
  upload.single("image"),
  uploadImage
);
router.get("/", authenticateToken, getImages);
router.get("/:plantId", authenticateToken, getImage);

module.exports = router;
