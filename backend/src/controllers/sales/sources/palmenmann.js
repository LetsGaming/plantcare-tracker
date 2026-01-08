const createScraper = require("../../../utils/scrape/scraperFactory");

module.exports = createScraper({
  key: "palmenmann",
  seller: "Palmenmann",
  baseUrl: "https://www.palmenmann.de/angebote/",
  pagePattern: "?p={{page}}",
  maxPages: 1,
  selectors: {
    container: ".product--box",
    oldPrice: ".price--discount",
    newPrice: ".price--default.is--discount",
    link: "a.product--title",
    name: "a.product--title",
    img: ".product--image img"
  }
});