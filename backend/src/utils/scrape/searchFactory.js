const { parse } = require("node-html-parser");
const { fetchData, resolveLink } = require("./scrapeUtils");

const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim().split(/\s+/);

const calculateRelevanceScore = (query, url) => {
  const queryWords = normalize(query);
  const urlWords = normalize(decodeURIComponent(url));
  const matchCount = queryWords.filter((word) => urlWords.includes(word)).length;
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

/**
 * Factory for creating search-based plant link generators
 */
const createSearcher = (config) => {
  return async (plantName) => {
    const url = config.searchUrl(encodeURIComponent(plantName));
    
    // Check if options is a function (to generate dynamic payloads like RHS)
    const dynamicOptions = typeof config.options === 'function' 
      ? config.options(plantName) 
      : (config.options || {});

    return fetchData(
      url,
      (data) => {
        if (config.isApi) return config.handleApi(data, plantName, findBestMatch);

        const root = parse(data);
        const links = [...new Set(
          root.querySelectorAll(config.selector)
            .map(a => a.getAttribute("href"))
            .filter(href => href && (!config.filter || config.filter(href)))
        )];

        const best = findBestMatch(plantName, links);
        return best ? resolveLink(best, config.baseUrl) : null;
      },
      { 
        ...dynamicOptions, 
        cacheKey: `${config.key}_${plantName.replace(/\s+/g, '_').toLowerCase()}` 
      }
    );
  };
};

module.exports = { createSearcher, findBestMatch };