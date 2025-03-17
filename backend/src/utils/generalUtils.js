const removeEmptyFields = (obj) => {
  if (typeof obj !== 'object' || obj === null) return obj; // Ensure obj is an object

  return Object.entries(obj)
    .filter(([_, value]) => {
      if (value === null || value === undefined || value === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      if (typeof value === 'object' && Object.keys(value).length === 0) return false;
      return true;
    })
    .reduce((acc, [key, value]) => {
      acc[key] = typeof value === 'object' ? removeEmptyFields(value) : value;
      return acc;
    }, {});
}

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

const formatToDBDate = (date) => {
  const localDate = new Date(date);  // Parse date string (could include time zone)
  const formattedDate = localDate
    .toISOString()   // Converts to UTC in ISO format (e.g., '2025-03-17T15:30:00.000Z')
    .slice(0, 19)    // Slice the ISO string to get the format: 'YYYY-MM-DDTHH:MM:SS'
    .replace("T", " ");  // Replace the 'T' with a space for SQL format ('YYYY-MM-DD HH:MM:SS')
  return formattedDate;
};


module.exports = { removeEmptyFields, customTimestamp, formatToDBDate };
