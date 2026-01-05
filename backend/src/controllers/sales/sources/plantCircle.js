const {
  parsePrice,
  getText,
  resolveLink,
} = require("../../../utils/scrapeUtils");

module.exports = {
  key: "plantcircle",
  seller: "Plant Circle",
  baseUrl: "https://plantcircle.com/de/collections/houseplant-sale",
  pagePattern: "?page={{page}}",
  maxPages: 2,
  options: {
    useChromium: false,
  },
  parseFn: (root) => {
    return root
      .querySelectorAll(".card--product")
      .map((item) => {
        const newPriceElem = item.querySelector(".price-item--sale span");
        const oldPriceElem = item.querySelector(".price-item--regular span");

        const newPrice = parsePrice(newPriceElem);
        const oldPrice = parsePrice(oldPriceElem);

        if (!newPrice || newPrice >= oldPrice) return null;

        const imgElem = item.querySelector(".card__image img");
        const img =
          imgElem?.getAttribute("src") || imgElem?.getAttribute("data-src");

        return {
          link: resolveLink(
            item.querySelector('a[href*="/products/"]')?.getAttribute("href"),
            "https://plantcircle.com"
          ),
          name: getText(item, ".card__title")?.trim(),
          img: img?.startsWith("//") ? `https:${img}` : img,
          oldPrice,
          newPrice,
        };
      })
      .filter(Boolean);
  },
};
