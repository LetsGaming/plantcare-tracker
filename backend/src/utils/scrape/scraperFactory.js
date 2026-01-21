const { parsePrice, commercialRound, getText, resolveLink } = require("./scrapeUtils");

/**
 * Creates a standardized scraper object with default parsing logic.
 * @param {Object} config - The site-specific configuration
 */
module.exports = (config) => {
  const { selectors, baseUrl, ...rest } = config;

  // If a source provides its own parseFn, use it. Otherwise, use the standard one.
  const parseFn =
    config.parseFn ||
    ((root) => {
      return root
        .querySelectorAll(selectors.container)
        .map((item) => {
          const outOfStockElem = selectors.outOfStock
            ? item.querySelector(selectors.outOfStock)
            : null;
          if (outOfStockElem) return null;

          // 1. Price Extraction & Validation
          const oldPrice = commercialRound(parsePrice(item.querySelector(selectors.oldPrice)));
          const newPrice = commercialRound(parsePrice(item.querySelector(selectors.newPrice)));

          if (!newPrice || !oldPrice || newPrice >= oldPrice) return null;

          // 2. Metadata Extraction
          const linkElem = item.querySelector(selectors.link);
          const name = selectors.nameAttr
            ? item
                .querySelector(selectors.name)
                ?.getAttribute(selectors.nameAttr)
            : getText(item, selectors.name);

          // 3. Image Logic (Handles src, srcset, data-src, and // protocol)
          const imgElem = item.querySelector(selectors.img);
          let imgRaw =
            imgElem?.getAttribute("src") ||
            imgElem?.getAttribute("srcset") ||
            imgElem?.getAttribute("data-src") ||
            imgElem?.getAttribute("data-srcset");
          let img = imgRaw?.split(" ")[0].split(",")[0];
          if (img?.startsWith("//")) img = `https:${img}`;

          return {
            name: name?.trim() || "Unnamed Plant",
            link: resolveLink(linkElem?.getAttribute("href"), baseUrl),
            img,
            oldPrice,
            newPrice,
          };
        })
        .filter(Boolean);
    });

  return { ...rest, baseUrl, parseFn };
};
