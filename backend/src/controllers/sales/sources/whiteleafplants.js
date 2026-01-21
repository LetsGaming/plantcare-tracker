const createScraper = require("../../../utils/scrape/scraperFactory");

module.exports = createScraper({
  key: "whiteleafplants",
  seller: "White Leaf Plants",
  baseUrl: "https://whiteleafplants.com/collections/alle-sort?filter.v.availability=1&filter.v.price.gte=&filter.v.price.lte=&sort_by=manual",
  pagePattern: "&page={{page}}",
  maxPages: 5,
  priority: 2,
  selectors: {
    container: ".product-item",
    oldPrice: ".price__sale s.price-item--regular",
    newPrice: ".price__sale .price-item--sale",
    link: ".card-title",
    name: ".card-title",
    img: ".card-media img"
  }
});