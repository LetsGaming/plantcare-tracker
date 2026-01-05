const { parsePrice, getText } = require("../../../utils/scrapeUtils");

module.exports = {
  key: "palmenmann",
  seller: "Palmenmann",
  baseUrl: "https://www.palmenmann.de/angebote",
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

        if (!newPriceElem || !oldPriceElem) return null;

        const linkElem = item.querySelector("a.product--title");

        return {
          link: linkElem?.getAttribute("href"),
          name: getText(linkElem),
          img: item.querySelector(".product--image img")?.getAttribute("src"),
          oldPrice: parsePrice(oldPriceElem),
          newPrice: parsePrice(newPriceElem),
        };
      })
      .filter(Boolean);
  },
};
