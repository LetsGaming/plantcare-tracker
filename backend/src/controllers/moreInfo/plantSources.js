const axios = require("axios");
const { parse } = require("node-html-parser");
const { escape: encodeURIComponent } = require("querystring");
const NodeCache = require("node-cache");

const cache = new NodeCache({ stdTTL: 24 * 60 * 60, checkperiod: 3600 });

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

// Optimized fetchData: caches only relevant result, not full HTML/JSON
const fetchData = async (
  url,
  extractFn,
  method = "GET",
  payload = null,
  cacheKey = null
) => {
  if (cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  }

  try {
    const options = { method, url };
    if (payload) options.data = payload;
    if (method === "POST")
      options.headers = { "Content-Type": "application/json" };

    const response = await axios(options);
    const relevantData = extractFn(response.data);
    if (cacheKey && relevantData) cache.set(cacheKey, relevantData);
    return relevantData;
  } catch (err) {
    console.error(`Error fetching ${url}:`, err.message);
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
    return fetchData(
      url,
      (data) =>
        findBestMatch(plantName, [
          ...new Set(
            parse(data)
              .querySelectorAll("article a")
              .map((a) => a.getAttribute("href"))
              .filter((href) => href && !href.includes("author"))
          ),
        ]),
      "GET",
      null,
      `jungleLeaves_${plantName}`
    );
  },

  harmonyPlants: async (plantName) => {
    const url = `https://www.harmony-plants.com/search?type=product&q=${encodeURIComponent(
      plantName
    )}`;
    return fetchData(
      url,
      (data) => {
        const links = [
          ...new Set(
            parse(data)
              .querySelectorAll(".card-information__text")
              .map((a) => a.getAttribute("href"))
              .filter(Boolean)
          ),
        ];
        const best = findBestMatch(plantName, links);
        return best ? `https://www.harmony-plants.com${best}` : null;
      },
      "GET",
      null,
      `harmonyPlants_${plantName}`
    );
  },

  foliageDreams: async (plantName) => {
    const url = `https://www.foliagedreams.de/search?q=${encodeURIComponent(
      plantName
    )}`;
    return fetchData(
      url,
      (data) => {
        const links = [
          ...new Set(
            parse(data)
              .querySelectorAll(".grid-product__link")
              .map((a) => a.getAttribute("href"))
              .filter(Boolean)
          ),
        ];
        const best = findBestMatch(plantName, links);
        return best ? `https://www.foliagedreams.de${best}` : null;
      },
      "GET",
      null,
      `foliageDreams_${plantName}`
    );
  },

  whiteLeafPlants: async (plantName) => {
    const url = `https://www.whiteleafplants.com/search?q=${encodeURIComponent(
      plantName
    )}`;
    return fetchData(
      url,
      (data) => {
        const links = [
          ...new Set(
            parse(data)
              .querySelectorAll(".card-title")
              .map((a) => a.getAttribute("href"))
              .filter((href) => href && !href.includes("author"))
          ),
        ];
        const best = findBestMatch(plantName, links);
        return best ? `https://www.whiteleafplants.com${best}` : null;
      },
      "GET",
      null,
      `whiteLeafPlants_${plantName}`
    );
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
    return fetchData(
      url,
      (data) => {
        if (!data?.hits?.length) return null;
        const plantLinks = data.hits.map((hit) => ({
          id: hit.id,
          name: hit.botanicalName.replace(/<[^>]+>/g, "").trim(),
        }));
        const bestName = findBestMatch(
          plantName,
          plantLinks.map((p) => p.name)
        );
        const bestPlant = plantLinks.find((p) => p.name === bestName);
        return bestPlant
          ? `https://www.rhs.org.uk/plants/${bestPlant.id}/${bestPlant.name
              .replace(/ /g, "-")
              .toLowerCase()}/details`
          : null;
      },
      "POST",
      payload,
      `rhs_${plantName}`
    );
  },

  wikipedia: async (plantName) => {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      plantName
    )}&format=json`;
    return fetchData(
      url,
      (data) => {
        if (!data?.query?.search?.length) return null;
        return findBestMatch(
          plantName,
          data.query.search.map(
            (r) => `https://en.wikipedia.org/wiki/${r.title.replace(/ /g, "_")}`
          )
        );
      },
      "GET",
      null,
      `wikipedia_${plantName}`
    );
  },

  gbif: async (plantName) => {
    const url = `https://api.gbif.org/v1/species/search?q=${encodeURIComponent(
      plantName
    )}&limit=5`;
    return fetchData(
      url,
      (data) => {
        if (!data?.results?.length) return null;
        const bestName = findBestMatch(
          plantName,
          data.results.map((r) => r.species)
        );
        const speciesKey = data.results.find(
          (r) => r.species === bestName
        )?.nubKey;
        return speciesKey ? `https://www.gbif.org/species/${speciesKey}` : null;
      },
      "GET",
      null,
      `gbif_${plantName}`
    );
  },
};

const generateLinks = async (plantName) => {
  const cache_name = plantName
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .trim()
    .replace(/\s+/g, "_");

  const cacheKey = `links_${cache_name}`;
  console.time(cacheKey);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const results = await Promise.all(
    Object.values(PLANT_SOURCES).map((fn) => fn(plantName))
  );
  const filtered = results.filter(Boolean);
  cache.set(cacheKey, filtered);
  return filtered;
};

module.exports = { generateLinks };
