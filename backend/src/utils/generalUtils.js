// Helper function to format image URLs
const formatImageUrl = (url) => {
  // Replace single backslashes with forward slashes
  const correctedUrl = url.replace(/\\/g, "/");

  // Ensure the protocol is followed by double slashes
  return correctedUrl.replace(/^([^:]+):\//, "$1://"); // Ensure correct format
};

// Custom timestamp function
const customTimestamp = (date = new Date()) => {
  const formatNumber = (num) => String(num).padStart(2, '0');

  const day = formatNumber(date.getDate());
  const month = formatNumber(date.getMonth() + 1); // Months are 0-based
  const year = date.getFullYear();
  const hours = formatNumber(date.getHours());
  const minutes = formatNumber(date.getMinutes());
  const seconds = formatNumber(date.getSeconds());

  return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
};

module.exports = { formatImageUrl, customTimestamp };
