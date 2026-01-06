const {
  parsePrice,
  getText,
  resolveLink,
} = require("../../../utils/scrapeUtils");

module.exports = {
  key: "whiteleafplants",
  seller: "White Leaf Plants",
  baseUrl: "https://whiteleafplants.com/collections/alle-sort?filter.v.availability=1&filter.v.price.gte=&filter.v.price.lte=&sort_by=manual",
  pagePattern: "&page={{page}}",
  maxPages: 5,
  priority: 2,
  options: { useChromium: true },
  parseFn: (root) => {
    return root
      .querySelectorAll(".product-item")
      .map((item) => {
        const newPriceElem = item.querySelector(".price__sale .price-item--sale");
        
        const oldPriceElem = item.querySelector(".price__sale s.price-item--regular");

        const newPrice = parsePrice(newPriceElem);
        const oldPrice = parsePrice(oldPriceElem);

        // Filter for valid sales only
        if (!newPrice || !oldPrice || newPrice >= oldPrice) return null;

        const linkElem = item.querySelector(".card-title");
        const name = getText(linkElem);
        const link = resolveLink(
          linkElem?.getAttribute("href"),
          "https://whiteleafplants.com"
        );

        const imgElem = item.querySelector(".card-media img");
        let img = imgElem?.getAttribute("src") || imgElem?.getAttribute("data-src");

        if (img?.startsWith("//")) {
          img = `https:${img}`;
        }

        return {
          name,
          link,
          img,
          oldPrice,
          newPrice,
        };
      })
      .filter(Boolean);
  },
};