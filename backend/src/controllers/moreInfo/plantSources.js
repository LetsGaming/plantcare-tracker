const axios = require("axios");
const { parse } = require("node-html-parser");
const { escape: encodeURIComponent } = require("querystring");
const NodeCache = require("node-cache");

const cache = new NodeCache({ stdTTL: 3600, checkperiod: 24 * 60 * 60 }); // Cache for 1 day

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

const fetchData = async (url, method = "GET", payload = null) => {
  const cachedData = cache.get(url);
  if (cachedData) return cachedData;

  try {
    const options = { method, url };
    if (payload) options.data = payload;
    if (method === "POST")
      options.headers = { "Content-Type": "application/json" };

    const response = await axios(options);
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

const PLANT_SOURCES = {
  jungleLeaves: async (plantName) => {
    const url = `https://www.jungle-leaves.de/?s=${encodeURIComponent(
      plantName
    )}`;
    const data = await fetchData(url);
    if (!data) return null;

    const links = [
      ...new Set(
        parse(data)
          .querySelectorAll("article a")
          .map((a) => a.getAttribute("href"))
          .filter((href) => href && !href.includes("author"))
      ),
    ];

    return findBestMatch(plantName, links);
  },

  plnts: async (plantName) => {
    const url = `https://plnts.com/en/search?q=${encodeURIComponent(
      plantName
    )}`;
    const data = await fetchData(url);
    if (!data) return null;

    const links = parse(data)
      .querySelectorAll("a")
      .map((a) => a.getAttribute("href"))
      .filter((href) => href && href.includes("product"));

    const bestLink = findBestMatch(plantName, links);
    return bestLink ? `https://plnts.com${bestLink}` : null;
  },

  rhs: async (plantName) => {
    const url =
      "https://lwapp-uks-prod-psearch-01.azurewebsites.net/api/v1/plants/search/advanced";
    const payload = {
      startFrom: 0,
      pageSize: 20,
      keywords: plantName,
      includeAggregation: true,
    };
    const data = await fetchData(url, "POST", payload);
    if (!data || !data.hits?.length) return null;

    const plantLinks = data.hits.map((hit) => ({
      id: hit.id,
      name: hit.botanicalName.replace(/<[^>]+>/g, "").trim(), // Remove HTML tags
    }));

    const bestMatch = findBestMatch(
      plantName,
      plantLinks.map((p) => p.name)
    );
    const bestPlant = plantLinks.find((p) => p.name === bestMatch);

    return bestPlant
      ? `https://www.rhs.org.uk/plants/${bestPlant.id}/${bestPlant.name
          .replace(/ /g, "-")
          .toLowerCase()}/details`
      : null;
  },

  wikipedia: async (plantName) => {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      plantName
    )}&format=json`;
    const data = await fetchData(url);
    if (!data || !data.query?.search.length) return null;

    return findBestMatch(
      plantName,
      data.query.search.map(
        (r) => `https://en.wikipedia.org/wiki/${r.title.replace(/ /g, "_")}`
      )
    );
  },

  gbif: async (plantName) => {
    const url = `https://api.gbif.org/v1/species/search?q=${encodeURIComponent(
      plantName
    )}&limit=5`;
    const data = await fetchData(url);
    if (!data || !data.results?.length) return null;

    const bestMatch = findBestMatch(
      plantName,
      data.results.map((r) => r.species)
    );
    const speciesKey = data.results.find(
      (r) => r.species === bestMatch
    )?.nubKey;

    return speciesKey ? `https://www.gbif.org/species/${speciesKey}` : null;
  },
};

const generateLinks = async (plantName) => {
  const cacheKey = `links_${plantName}`;
  const cachedResult = cache.get(cacheKey);
  if (cachedResult) return cachedResult;

  const results = await Promise.all(
    Object.values(PLANT_SOURCES).map((fetchFn) => fetchFn(plantName))
  );

  const filteredLinks = results.filter(Boolean); // Remove null values
  cache.set(cacheKey, filteredLinks);
  return filteredLinks;
};

module.exports = { generateLinks };
