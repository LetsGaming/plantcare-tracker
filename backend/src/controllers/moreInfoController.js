const axios = require("axios");
const { parse } = require("node-html-parser");
const { escape: encodeURIComponent } = require("querystring");
const NodeCache = require("node-cache");
const { successResponse, errorResponse } = require("../utils/responseUtils");

const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 }); // Cache for 1 hour

const normalize = (str) =>
  str
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/);

const calculateRelevanceScore = (query, url) => {
  const queryWords = normalize(query);
  const urlWords = normalize(decodeURIComponent(url));
  const matchCount = queryWords.filter((word) =>
    urlWords.includes(word)
  ).length;
  return (
    Math.round((matchCount / queryWords.length) * 100) +
    (decodeURIComponent(url).includes(query.toLowerCase()) ? 20 : 0) +
    (urlWords.indexOf(queryWords[0]) === 0 ? 10 : 0) +
    Math.max(0, 10 - urlWords.length)
  );
};

const fetchData = async (url) => {
  const cachedData = cache.get(url);
  if (cachedData) return cachedData;

  try {
    const response = await axios.get(url);
    cache.set(url, response.data);
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error.message);
    return null;
  }
};

const findBestMatch = (query, links) =>
  links.reduce(
    (best, link) => {
      const score = calculateRelevanceScore(query, link);
      return score > best.score ? { link, score } : best;
    },
    { link: null, score: 0 }
  ).link;

const generateBestLink = (plantName, links) =>
  findBestMatch(plantName, [...new Set(links)]);

const getJungleLeavesLink = async (plantName) => {
  const url = `https://www.jungle-leaves.de/?s=${encodeURIComponent(
    plantName
  )}`;
  const data = await fetchData(url);
  if (!data) return null;

  const plantLinks = [
    ...new Set(
      parse(data)
        .querySelectorAll("article a")
        .map((a) => a.getAttribute("href"))
        .filter((href) => href && !href.includes("author"))
    ),
  ];

  return generateBestLink(plantName, plantLinks);
};

const getPlntsLink = async (plantName) => {
  const url = `https://plnts.com/en/search?q=${encodeURIComponent(plantName)}`;
  const data = await fetchData(url);
  if (!data) return null;

  const plantLinks = parse(data)
    .querySelectorAll("a")
    .map((a) => a.getAttribute("href"))
    .filter((href) => href && href.includes("product"));

  return `https://plnts.com${generateBestLink(plantName, plantLinks)}`;
};

const getBestWikipediaLink = async (plantName) => {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    plantName
  )}&format=json`;
  const data = await fetchData(url);
  if (!data || !data.query?.search.length) return null;

  return generateBestLink(
    plantName,
    data.query.search.map(
      (r) => `https://en.wikipedia.org/wiki/${r.title.replace(/ /g, "_")}`
    )
  );
};

const getBestGbifLink = async (plantName) => {
  const url = `https://api.gbif.org/v1/species/search?q=${encodeURIComponent(
    plantName
  )}&limit=5`;
  const data = await fetchData(url);
  if (!data || !data.results?.length) return null;

  const bestMatch = generateBestLink(
    plantName,
    data.results.map((r) => r.species)
  );
  const speciesKey = data.results.find((r) => r.species === bestMatch)?.nubKey;

  return speciesKey ? `https://www.gbif.org/species/${speciesKey}` : null;
};

const generateLinks = async (plantName) => {
  const cacheKey = `links_${plantName}`;
  const cachedResult = cache.get(cacheKey);
  if (cachedResult) return cachedResult;

  const results = await Promise.all([
    getJungleLeavesLink(plantName),
    getPlntsLink(plantName),
    getBestWikipediaLink(plantName),
    getBestGbifLink(plantName),
  ]);

  // Create an array of the non-null links
  const links = [
    results[0], // Jungle Leaves
    results[1], // Plnts Link
    results[2], // Wikipedia Link
    results[3], // GBIF Link
  ];

  // Filter out null values from the array
  const filteredLinks = links.filter((link) => link !== null);

  cache.set(cacheKey, filteredLinks);
  return filteredLinks;
};

const getMoreInfo = async (req, res) => {
  const { plantName } = req.body;
  if (!plantName)
    return res.status(400).json({ message: "plantName is required." });
  let cleanedName = plantName.replace(/[^a-zA-Z0-9 ]/g, ""); // Remove special characters
  cleanedName = plantName.replace(/\s*\([^)]*\)/g, ""); // Remove anything in parentheses

  try {
    successResponse(res, { links: await generateLinks(cleanedName) });
  } catch (error) {
    console.error("Error generating links:", error);
    errorResponse(res, "An error occurred while generating links.", 500, error);
  }
};

module.exports = { getMoreInfo };
