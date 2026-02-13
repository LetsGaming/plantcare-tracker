const path = require("path");
const fs = require("fs").promises;
const sharp = require("sharp");
const logger = require("../utils/logger");

/**
 * Middleware to handle on-the-fly resizing via ?size=
 * for files in the uploads directory.
 */
const imageResizer = (baseUploadPath) => async (req, res, next) => {
  const { size } = req.query;
  console.log(
    "Image Resizer Middleware Invoked with size:",
    size,
    "for path:",
    req.path,
  );
  // If no size is requested, let express.static or the next handler take over
  if (!size) {
    return next();
  }

  try {
    // Construct the absolute path to the file
    // req.path is the part after "/uploads"
    const localPath = path.join(baseUploadPath, req.path);

    // Verify file exists
    await fs.access(localPath);

    const width = parseInt(size);
    if (isNaN(width) || width <= 0) {
      return next(); // Fallback to original if size is invalid
    }

    // Process image
    const transform = sharp(localPath)
      .resize({ width, withoutEnlargement: true })
      .toFormat("webp");

    const buffer = await transform.toBuffer();

    res.set("Content-Type", "image/webp");
    res.set("Cache-Control", "public, max-age=86400"); // 24h cache
    console.log(`Resized image served for ${req.path} at width ${width}px`);
    return res.send(buffer);
  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(404).json({ message: "Image not found on disk" });
    }
    logger.error("Resizer Error:", err);
    return next(err); // Pass to error handler
  }
};

module.exports = imageResizer;
