const { parsePrice, getText } = require("../../../utils/scrapeUtils");

module.exports = {
  key: "palmenmann",
  seller: "Palmenmann",
  baseUrl: "https://www.palmenmann.de/angebote/",
  pagePattern: "?p={{page}}",
  maxPages: 1,
  options: { useChromium: true },

  parseFn: (root) => {
    return root
      .querySelectorAll(".product--box")
      .map((item) => {
        const priceBox = item.querySelector(".product--price");
        if (!priceBox) return null;

        const newPriceElem = priceBox.querySelector(
          ".price--default.is--discount"
        );
        const oldPriceElem = priceBox.querySelector(".price--discount");

        // We only want products that are actually on sale (have both prices)
        if (!newPriceElem || !oldPriceElem) return null;

        const linkElem = item.querySelector("a.product--title");
        const imgElem = item.querySelector(".product--image img");

        return {
          link: linkElem?.getAttribute("href"),
          name: getText(linkElem),
          // Fallback to srcset if src is not present (common in their shop system)
          img:
            imgElem?.getAttribute("src") ||
            imgElem?.getAttribute("srcset")?.split(" ")[0],
          oldPrice: parsePrice(oldPriceElem),
          newPrice: parsePrice(newPriceElem),
        };
      })
      .filter(Boolean);
  },
};
