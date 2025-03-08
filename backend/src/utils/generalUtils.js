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
  const formattedDate = new Date(date)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  console.log("formatted date", formattedDate);
  return formattedDate;
};

const parseCustomDate = (dateString) => {
  // Define possible date formats
  const formats = [
    /^(\d{2})\.(\d{2})\.(\d{4}), (\d{2}):(\d{2}):(\d{2})$/, // DD.MM.YYYY, HH:MM:SS
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/, // YYYY-MM-DDTHH:MM (ISO 8601 without seconds)
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/, // YYYY-MM-DDTHH:MM:SS (ISO 8601)
    /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/, // MM/DD/YYYY HH:MM:SS
    /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/, // YYYY/MM/DD HH:MM:SS
    /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/, // DD.MM.YYYY HH:MM:SS (without comma)
  ];

  for (const format of formats) {
    const match = dateString.match(format);
    if (match) {
      let year,
        month,
        day,
        hours,
        minutes,
        seconds = 0;
      if (format === formats[0]) {
        [day, month, year, hours, minutes, seconds] = match
          .slice(1)
          .map(Number);
      } else if (format === formats[1]) {
        [year, month, day, hours, minutes] = match.slice(1).map(Number);
      } else if (format === formats[2] || format === formats[4]) {
        [year, month, day, hours, minutes, seconds] = match
          .slice(1)
          .map(Number);
      } else if (format === formats[3]) {
        [month, day, year, hours, minutes, seconds] = match
          .slice(1)
          .map(Number);
      } else if (format === formats[5]) {
        [day, month, year, hours, minutes, seconds] = match
          .slice(1)
          .map(Number);
      }
      const isInvalidDate = isNaN(
        new Date(year, month - 1, day, hours, minutes, seconds).getTime()
      );
      if (isInvalidDate) {
        throw new Error("Invalid date");
      }
      const date = new Date(year, month - 1, day, hours, minutes, seconds);
      console.log("parsed date", date);
      return date;
    }
  }

  throw new Error("Unsupported date format");
};

module.exports = { customTimestamp, formatToDBDate, parseCustomDate };
