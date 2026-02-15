const { createSearcher } = require("../../utils/scrape/searchFactory");
const { getCache } = require("../../utils/scrape/scrapeUtils");

const PLANT_SOURCES = {
  jungleLeaves: createSearcher({
    key: "jungleLeaves",
    baseUrl: "https://www.jungle-leaves.de",
    searchUrl: (q) => `https://www.jungle-leaves.de/?s=${q}`,
    selector: "article a",
    filter: (href) => !href.includes("author"),
    options: { useChromium: true },
  }),
  harmonyPlants: createSearcher({
    key: "harmonyPlants",
    baseUrl: "https://www.harmony-plants.com",
    searchUrl: (q) =>
      `https://www.harmony-plants.com/search?type=product&q=${q}`,
    selector: ".card-information__text",
  }),
  foliageDreams: createSearcher({
    key: "foliageDreams",
    baseUrl: "https://www.foliagedreams.com",
    searchUrl: (q) => `https://www.foliagedreams.com/search?q=${q}`,
    selector: ".grid-product__link",
  }),
  whiteLeafPlants: createSearcher({
    key: "whiteLeafPlants",
    baseUrl: "https://www.whiteleafplants.com",
    searchUrl: (q) => `https://www.whiteleafplants.com/search?q=${q}`,
    selector: ".card-title",
    filter: (href) => !href.includes("author"),
  }),
  wikipedia: createSearcher({
    key: "wikipedia",
    isApi: true,
    searchUrl: (q) =>
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&format=json`,
    handleApi: (data, query, matchFn) => {
      if (!data?.query?.search?.length) return null;
      const links = data.query.search.map(
        (r) => `https://en.wikipedia.org/wiki/${r.title.replace(/ /g, "_")}`,
      );
      return matchFn(query, links);
    },
  }),
  gbif: createSearcher({
    key: "gbif",
    isApi: true,
    searchUrl: (q) => `https://api.gbif.org/v1/species/search?q=${q}&limit=5`,
    handleApi: (data, query, matchFn) => {
      if (!data?.results?.length) return null;
      const bestName = matchFn(
        query,
        data.results.map((r) => r.species),
      );
      const result = data.results.find((r) => r.species === bestName);
      return result?.nubKey
        ? `https://www.gbif.org/species/${result.nubKey}`
        : null;
    },
  }),
  rhs: createSearcher({
    key: "rhs",
    isApi: true,
    searchUrl: () =>
      "https://lwapp-uks-prod-psearch-01.azurewebsites.net/api/v1/plants/search/advanced",
    options: (plantName) => ({
      method: "POST",
      payload: {
        startFrom: 0,
        pageSize: 20,
        keywords: plantName,
        includeAggregation: true,
      },
    }),
    handleApi: (data, query, matchFn) => {
      if (!data?.hits?.length) return null;
      const plantLinks = data.hits.map((hit) => ({
        id: hit.id,
        name: hit.botanicalName.replace(/<[^>]+>/g, "").trim(),
      }));
      const bestName = matchFn(
        query,
        plantLinks.map((p) => p.name),
      );
      const bestPlant = plantLinks.find((p) => p.name === bestName);
      return bestPlant
        ? `https://www.rhs.org.uk/plants/${bestPlant.id}/${bestPlant.name.replace(/ /g, "-").toLowerCase()}/details`
        : null;
    },
  }),
};

/**
 * Executes searchers and emits links via callback as they arrive.
 */
const generateLinksStream = async (plantName, onLinkFound) => {
  if (!plantName) return [];

  const cache = getCache();
  const cacheKey = `links_${plantName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    cached.forEach((link) => onLinkFound(link));
    return cached;
  }

  const allLinks = [];
  // Run all in parallel, but handle each result as it finishes
  await Promise.all(
    Object.values(PLANT_SOURCES).map(async (searcher) => {
      const result = await searcher(plantName);
      if (result) {
        allLinks.push(result);
        onLinkFound(result);
      }
    }),
  );

  cache.set(cacheKey, allLinks);
  return allLinks;
};

module.exports = { generateLinksStream };
