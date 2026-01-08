const createScraper = require("../utils/scrape/scraperFactory");

module.exports = createScraper({
  key: "plnts",
  seller: "PLNTS",
  baseUrl: "https://plnts.com/de/shop/sale",
  pagePattern: "?page={{page}}",
  maxPages: 2,
  options: { useChromium: true },
  selectors: {
    container: ".group\\/product-card",
    oldPrice: "span.line-through",
    newPrice: "span.text-accent",
    link: 'a[href^="/de/product"]',
    name: "a[title]",
    nameAttr: "title", // Special case: name is in title attribute
    img: "img"
  }
});