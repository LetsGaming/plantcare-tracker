const createScraper = require("../../../utils/scrape/scraperFactory");

module.exports = createScraper({
  key: "potflourri",
  seller: "Potflourri",
  baseUrl: "https://potflourri.de/collections/sale-zimmerpflanzen?filter.v.availability=1&sort_by=best-selling",
  pagePattern: "&page={{page}}",
  maxPages: 1,
  selectors: {
    container: ".product-card-wrapper",
    oldPrice: ".price__sale s.price-item--regular",
    newPrice: ".price__sale .price-item--sale",
    link: ".card__heading a",
    name: ".card__heading a",
    img: ".card__media img"
  }
});