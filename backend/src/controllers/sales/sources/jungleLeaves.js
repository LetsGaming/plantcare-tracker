const createScraper = require("../../../utils/scrape/scraperFactory");

module.exports = createScraper({
  key: "jungleLeaves",
  seller: "Jungle Leaves",
  baseUrl: "https://www.jungle-leaves.de/produkt-kategorie/sale",
  pagePattern: "page/{{page}}/",
  maxPages: 2,
  options: { useChromium: true },
  selectors: {
    container: ".product",
    oldPrice: "span.price del bdi",
    newPrice: "span.price ins bdi",
    link: ".product-loop-title",
    name: ".woocommerce-loop-product__title",
    img: "img"
  }
});