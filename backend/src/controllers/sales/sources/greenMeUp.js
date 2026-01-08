const createScraper = require("../utils/scrape/scraperFactory");

module.exports = createScraper({
  key: "greenMeUp",
  seller: "Green Me Up",
  baseUrl: "https://greenmeup.de/collections/sale",
  pagePattern: "?page={{page}}",
  maxPages: 2,
  options: { useChromium: true },
  selectors: {
    container: ".ed-card-product",
    oldPrice: "s.price-item--regular",
    newPrice: ".price-item--sale",
    link: "h3.card__heading.h5 a",
    name: "h3.card__heading.h5 a",
    img: ".card__media img"
  }
});