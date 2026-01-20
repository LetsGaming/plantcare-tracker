const createScraper = require("../../../utils/scrape/scraperFactory");

module.exports = createScraper({
  key: "plantcircle",
  seller: "Plant Circle",
  baseUrl: "https://plantcircle.com/de/collections/houseplant-sale",
  pagePattern: "?page={{page}}",
  maxPages: 2,
  selectors: {
    container: ".card--product",
    oldPrice: ".price-item--regular span",
    newPrice: ".price-item--sale span",
    outOfStock: ".card__badge--out-of-stock",
    link: 'a[href*="/products/"]',
    name: ".card__title",
    img: ".card__image img"
  }
});