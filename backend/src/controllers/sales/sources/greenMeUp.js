const {
  parsePrice,
  resolveLink,
  getText,
} = require("../../../utils/scrapeUtils");

// TODO : Fix scraper timeout and enable again
module.exports = {
  key: "greenMeUp",
  devOnly: true,
  seller: "Green Me Up",
  baseUrl: "https://greenmeup.de/collections/sale",
  pagePattern: "?page={{page}}",
  maxPages: 2,
  priority: 1,
  options: { useChromium: true },

  parseFn: (root) => {
    return root
      .querySelectorAll(".ed-card-product")
      .map((item) => {
        const priceElem = item.querySelector(".price.price--on-sale");
        if (!priceElem) return null;

        const linkElem = item.querySelector(
          "h3.card__heading.h5 a"
        );
        if (!linkElem) return null;

        const imgs = item.querySelectorAll(".card__media img");
        let imgSrc =
          imgs[1]?.getAttribute("src") ||
          imgs[1]?.getAttribute("data-src");

        if (imgSrc?.startsWith("//")) {
          imgSrc = `https:${imgSrc}`;
        }

        return {
          link: resolveLink(
            linkElem.getAttribute("href"),
            "https://greenmeup.de"
          ),
          name: getText(linkElem),
          img: imgSrc,
          oldPrice: parsePrice(
            priceElem.querySelector("s.price-item--regular")
          ),
          newPrice: parsePrice(
            priceElem.querySelector(".price-item--sale")
          ),
        };
      })
      .filter(Boolean);
  },
};
