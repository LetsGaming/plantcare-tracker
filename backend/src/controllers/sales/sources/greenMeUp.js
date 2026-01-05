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
  options: { useChromium: true },

  parseFn: (root) => {
    return root
      .querySelectorAll(".ed-card-product")
      .map((item) => {
        // The HTML uses .price--on-sale for the container
        const priceElem = item.querySelector(".price--on-sale");
        if (!priceElem) return null;

        // TARGET SPECIFICITY: Use the H3 to get the actual visible title
        const linkElem = item.querySelector("h3.card__heading a");

        // IMAGE PROTOCOL FIX: Handle //greenmeup.de URLs
        const imgElem = item.querySelector(".card__media img");
        let imgSrc =
          imgElem?.getAttribute("src") || imgElem?.getAttribute("data-src");

        if (imgSrc && imgSrc.startsWith("//")) {
          imgSrc = `https:${imgSrc}`;
        }

        return {
          link: resolveLink(
            linkElem?.getAttribute("href"),
            "https://greenmeup.de"
          ),
          name: getText(linkElem),
          img: imgSrc,
          oldPrice: parsePrice(
            priceElem.querySelector("s.price-item--regular")
          ),
          newPrice: parsePrice(priceElem.querySelector(".price-item--sale")),
        };
      })
      .filter(Boolean);
  },
};
