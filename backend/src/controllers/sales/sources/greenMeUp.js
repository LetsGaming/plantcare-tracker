const {
  parsePrice,
  resolveLink,
  getText,
} = require("../../../utils/scrapeUtils");

module.exports = {
  key: "greenMeUp",
  seller: "Green Me Up",
  baseUrl: "https://greenmeup.de/collections/sale",
  pagePattern: "?page={{page}}",
  maxPages: 2,
  options: { useChromium: false },

  parseFn: (root) => {
    return root
      .querySelectorAll(".ed-card-product")
      .map((item) => {
        const priceElem = item.querySelector(".price--on-sale");
        if (!priceElem) return null;

        const linkElem = item.querySelector(
          'a.full-unstyled-link[href^="/products/"]'
        );

        return {
          link: resolveLink(
            linkElem?.getAttribute("href"),
            "https://greenmeup.de"
          ),
          name: getText(linkElem),
          img:
            item.querySelector(".card__media img")?.getAttribute("src") ||
            item.querySelector(".card__media img")?.getAttribute("data-src"),
          oldPrice: parsePrice(
            priceElem.querySelector("s.price-item--regular")
          ),
          newPrice: parsePrice(priceElem.querySelector(".price-item--sale")),
        };
      })
      .filter(Boolean);
  },
};
