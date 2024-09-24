// Helper function to format image URLs
const formatImageUrl = (url) => {
  // Replace single backslashes with forward slashes
  const correctedUrl = url.replace(/\\/g, "/");

  // Ensure the protocol is followed by double slashes
  return correctedUrl.replace(/^([^:]+):\//, "$1://"); // Ensure correct format
};

module.exports = { formatImageUrl };
