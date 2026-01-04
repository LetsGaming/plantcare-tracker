const {
  parsePrice,
  resolveLink,
  getText,
} = require("../../../utils/scrapeUtils");

module.exports = {
  key: "harmonyPlants",
  seller: "Harmony Plants",
  baseUrl: "https://www.harmony-plants.com/collections/sale",
  pagePattern: "?page={{page}}",
  maxPages: 3,
  options: { useChromium: true },
  parseFn: (root) => {
    return root.querySelectorAll(".grid__item").map((item) => {
      const priceElem = item.querySelector(".price--on-sale");
      if (!priceElem) return null;
      const linkElem = item.querySelector("a");
      const link = resolveLink(
        linkElem?.getAttribute("href"),
        "https://www.harmony-plants.com"
      );

      const extractComplexPrice = (selector) => {
        const bdi = priceElem.querySelector(selector);
        if (!bdi) return null;
        const main =
          bdi.childNodes.find((n) => n.nodeType === 3)?.text.trim() ?? "";
        const suffix = bdi.querySelector("sup")?.text.trim() ?? "";
        return parsePrice(`${main}${suffix}`);
      };

      return {
        link,
        name: getText(linkElem, "span") ?? "Unnamed Plant",
        img: item.querySelector("img")?.getAttribute("src"),
        oldPrice: extractComplexPrice(".price__sale s.price-item--regular bdi"),
        newPrice: extractComplexPrice(".price-item--sale bdi"),
      };
    });
  },
};
