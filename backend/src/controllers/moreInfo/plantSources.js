const { parse } = require("node-html-parser");
const { escape: encodeURIComponent } = require("querystring");
const { fetchData, getCache } = require("../../utils/scrapeUtils");

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
      {
        useChromium: true,
        cacheKey: `jungleLeaves_${plantName}`,
      }
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
      { cacheKey: `harmonyPlants_${plantName}` }
    );
  },

  foliageDreams: async (plantName) => {
    const url = `https://www.foliagedreams.com/search?q=${encodeURIComponent(
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
      {
        cacheKey: `foliageDreams_${plantName}`,
      }
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
      {
        cacheKey: `whiteLeafPlants_${plantName}`,
      }
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
      {
        method: "POST",
        payload,
        cacheKey: `rhs_${plantName}`,
      }
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
      { cacheKey: `wikipedia_${plantName}` }
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
      { cacheKey: `gbif_${plantName}` }
    );
  },
};

const generateLinks = async (plantName) => {
  const cache_name = plantName
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .trim()
    .replace(/\s+/g, "_");

  const cache = getCache();

  const cacheKey = `links_${cache_name}`;
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
