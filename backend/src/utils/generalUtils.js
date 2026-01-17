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

const ensureArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  } else if (value === null || value === undefined) {
    return [];
  } else if (typeof value === "object") {
    return Object.values(value);
  } else if (value instanceof Set || value instanceof Map) {
    return Array.from(value);
  } else {
    return [value];
  }
};

/**
 * Create a stable, opaque, frontend-safe user identifier
 */
const opaqueUserId = (id) => {
  return crypto
    .createHmac("sha256", USER_ID_SECRET)
    .update(id.toString())
    .digest("hex")
    .slice(0, 16);
};

// Custom timestamp function
const customTimestamp = (date = new Date()) => {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
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

const filterDuplicatesById = (items) => {
  const seenIds = new Set();
  return items.filter((item) => {
    if (seenIds.has(item.id)) {
      return false;
    } else {
      seenIds.add(item.id);
      return true;
    }
  });
}

module.exports = {
  removeEmptyFields,
  ensureArray,
  opaqueUserId,
  customTimestamp,
  formatToDBDate,
  filterDuplicatesById,
};
