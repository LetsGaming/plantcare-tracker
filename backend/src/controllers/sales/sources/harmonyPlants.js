const createScraper = require("../../../utils/scrape/scraperFactory");
const { parsePrice, resolveLink, getText } = require("../../../utils/scrape/scrapeUtils");

module.exports = createScraper({
  key: "harmonyPlants",
  seller: "Harmony Plants",
  baseUrl: "https://www.harmony-plants.com/collections/sale?filter.v.availability=1&sort_by=manual",
  pagePattern: "&page={{page}}",
  maxPages: 2,
  options: { useChromium: false },
  parseFn: (root) => {
    return root.querySelectorAll(".grid__item").map((item) => {
      const priceElem = item.querySelector(".price--on-sale");
      if (!priceElem) return null;
      
      const extract = (sel) => {
        const bdi = priceElem.querySelector(sel);
        const text = bdi?.childNodes.find(n => n.nodeType === 3)?.text.trim() || "";
        const sup = bdi?.querySelector("sup")?.text.trim() || "";
        return parsePrice(`${text}${sup}`);
      };

      const linkElem = item.querySelector("a");
      return {
        link: resolveLink(linkElem?.getAttribute("href"), "https://www.harmony-plants.com"),
        name: getText(linkElem, "span") ?? "Unnamed Plant",
        img: item.querySelector("img")?.getAttribute("src"),
        oldPrice: extract(".price__sale s.price-item--regular bdi"),
        newPrice: extract(".price-item--sale bdi"),
      };
    });
  }
});