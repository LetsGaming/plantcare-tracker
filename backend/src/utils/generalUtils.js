const removeEmptyFields = (obj) => {
  if (typeof obj !== "object" || obj === null) return obj; // Ensure obj is an object

  return Object.entries(obj)
    .filter(([_, value]) => {
      if (value === null || value === undefined || value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      if (typeof value === "object" && Object.keys(value).length === 0)
        return false;
      return true;
    })
    .reduce((acc, [key, value]) => {
      acc[key] = typeof value === "object" ? removeEmptyFields(value) : value;
      return acc;
    }, {});
};

// Custom timestamp function
const customTimestamp = (date = new Date()) => {
  const formatNumber = (num) => String(num).padStart(2, "0");

  const day = formatNumber(date.getDate());
  const month = formatNumber(date.getMonth() + 1); // Months are 0-based
  const year = date.getFullYear();
  const hours = formatNumber(date.getHours());
  const minutes = formatNumber(date.getMinutes());
  const seconds = formatNumber(date.getSeconds());

  return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
};

const formatToDBDate = (dateString) => {
  // Create a Date object with the given date and time zone
  const date = new Date(dateString);

  // Convert to UTC string, then extract relevant parts
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0"); // Months are 0-based
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  // Format as YYYY-MM-DD HH:MM:SS (database-friendly)
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

module.exports = { removeEmptyFields, customTimestamp, formatToDBDate };
