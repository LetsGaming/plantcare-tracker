const fs = require("fs");
const path = require("path");

// Ensure sourcesDir is also defined. If it's the current directory, use:
const sourcesDir = __dirname;

const seenKeys = new Set();
module.exports = fs
  .readdirSync(sourcesDir)
  .filter((file) => file.endsWith(".js") && file !== "index.js")
  .map((file) => {
    const source = require(path.join(sourcesDir, file));

    if (!source?.key) {
      throw new Error(`Scraper in ${file} is missing 'key'`);
    }

    if (source.disabled) {
      return null;
    }

    if (seenKeys.has(source.key)) {
      throw new Error(`Duplicate scraper key "${source.key}" in ${file}`);
    }

    seenKeys.add(source.key);
    return source;
  });
