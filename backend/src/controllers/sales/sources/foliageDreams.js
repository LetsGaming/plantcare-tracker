const createScraper = require("../utils/scrape/scraperFactory");
const { parsePrice, resolveLink, getText } = require("../utils/scrape/scrapeUtils");

module.exports = createScraper({
  key: "foliageDreams",
  seller: "Foliage Dreams",
  baseUrl: "https://foliagedreams.com/collections/alle-pflanzen?filter.v.availability=1",
  pagePattern: "&page={{page}}",
  maxPages: 3,
  priority: 1,
  parseFn: (root) => {
    return root.querySelectorAll(".grid-product__content").map((item) => {
      const originalPriceElem = item.querySelector(".grid-product__price--original");
      if (!originalPriceElem) return null;

      const oldPrice = parsePrice(originalPriceElem);
      const fullPriceText = item.querySelector(".grid-product__price")?.text || "";
      
      // Remove old price text to find the new price remaining in the container
      const remainingText = fullPriceText.replace(originalPriceElem.text, "").trim();
      const priceMatch = remainingText.match(/[\d.,]+/);
      const newPrice = priceMatch ? parsePrice(priceMatch[0]) : null;

      if (!newPrice || !oldPrice || newPrice >= oldPrice) return null;

      const imgElem = item.querySelector(".grid-product__image-mask img");
      const linkElem = item.querySelector(".grid-product__link");

      // We still benefit from common logic for Image and Link cleaning
      let img = imgElem?.getAttribute("srcset") || imgElem?.getAttribute("src");
      img = img?.split(" ")[0].split(",")[0];
      if (img?.startsWith("//")) img = `https:${img}`;

      return {
        name: getText(item, ".grid-product__title"),
        link: resolveLink(linkElem?.getAttribute("href"), "https://foliagedreams.com"),
        img,
        oldPrice,
        newPrice,
      };
    }).filter(Boolean);
  }
});