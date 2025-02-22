// imageUtils.js
const { selectImages } = require("../models/imageModel");

// Helper function to format image URLs
const formatImageUrl = (url) => {
  // Replace single backslashes with forward slashes
  const correctedUrl = url.replace(/\\/g, "/");

  // Ensure the protocol is followed by double slashes
  return correctedUrl.replace(/^([^:]+):\//, "$1://"); // Ensure correct format
};

/**
 * Fetches and formats images for any given entity.
 *
 * @param {string} entityType - The type of the entity (e.g., "substrate", "plant").
 * @param {number} entityId - The ID of the entity.
 * @returns {Promise<{ latestImage: string | null, images: Array }>}
 */
async function selectEntityImages(entityType, entityId) {
  const [rows] = await selectImages({ entity_type: entityType, entity_id: entityId });
  
  // Format images using the provided formatting function.
  const images = rows.map((image) => ({
    id: image.image_id,
    url: formatImageUrl(image.image_url),
    date: image.upload_date,
  }));
  
  // Assume the first image is the primary one (or adjust logic as needed).
  const latestImage = images.length > 0 ? formatImageUrl(images[images.length -1].url) : null;
  
  return { latestImage, images };
}

// Export the functions
module.exports = { selectEntityImages };