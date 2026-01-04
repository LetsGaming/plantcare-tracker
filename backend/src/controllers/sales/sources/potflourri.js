const { parsePrice, resolveLink } = require("../../../utils/scrapeUtils");

module.exports = {
  key: "potflourri",
  seller: "Potflourri",
  baseUrl: "https://potflourri.de/collections/sale-zimmerpflanzen",
  pagePattern: "?page={{page}}",
  maxPages: 1,
  options: {
    useChromium: false,
  },
  parseFn: (root) => {
    return root
      .querySelectorAll(".product-card-wrapper")
      .map((item) => {
        // SALE price
        const newPriceElem = item.querySelector(
          ".price__sale .price-item--sale"
        );

        // ORIGINAL price (inside <s>)
        const oldPriceElem = item.querySelector(
          ".price__sale s.price-item--regular"
        );

        const newPrice = parsePrice(newPriceElem);
        const oldPrice = parsePrice(oldPriceElem);

        if (!newPrice || !oldPrice || newPrice >= oldPrice) return null;

        const imgElem = item.querySelector(".card__media img");
        const img =
          imgElem?.getAttribute("src") || imgElem?.getAttribute("data-src");

        const linkElem = item.querySelector(".card__heading a");

        return {
          link: resolveLink(
            linkElem?.getAttribute("href"),
            "https://potflourri.de"
          ),
          name: linkElem?.textContent?.trim(),
          img: img?.startsWith("//") ? `https:${img}` : img,
          oldPrice,
          newPrice,
        };
      })
      .filter(Boolean);
  },
};
