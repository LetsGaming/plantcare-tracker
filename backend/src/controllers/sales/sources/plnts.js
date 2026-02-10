const createScraper = require("../../../utils/scrape/scraperFactory");

module.exports = createScraper({
  key: "plnts",
  seller: "PLNTS",
  baseUrl: "https://plnts.com/de/shop/sale",
  pagePattern: "?page={{page}}",
  maxPages: 4,
  options: { useChromium: true },
  selectors: {
    container: ".group\\/product-card",
    oldPrice: "span.line-through",
    newPrice: "span.text-accent",
    outOfStock: ".w-auto.text-sm.leading-none.px-2.py-1\\.5.\\32 xl\\:px-3.\\32 xl\\:text-base.bg-sage.text-porcelain.\\33 xl\\:bottom-5.absolute.bottom-2\\.5.left-0.z-10.lg\\:bottom-4",
    link: 'a[href^="/de/product"]',
    name: "a[title]",
    nameAttr: "title", // Special case: name is in title attribute
    img: "img"
  }
});