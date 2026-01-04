const {
  parsePrice,
  getText,
  resolveLink,
} = require("../../../utils/scrapeUtils");

module.exports = {
  key: "plnts",
  seller: "PLNTS",
  baseUrl: "https://plnts.com/de/shop/sale",
  pagePattern: "?page={{page}}",
  maxPages: 3,
  options: { useChromium: true },
  parseFn: (root) => {
    return root.querySelectorAll(".group\\/product-card").map((item) => {
      const linkElem = item.querySelector('a[href^="/de/product"]');
      return {
        link: resolveLink(linkElem?.getAttribute("href"), "https://plnts.com"),
        name:
          item.querySelector("a[title]")?.getAttribute("title") ||
          getText(item, "a[title]"),
        img:
          item.querySelector("img")?.getAttribute("src") ||
          item.querySelector("img")?.getAttribute("data-src"),
        oldPrice: parsePrice(item.querySelector("span.line-through")),
        newPrice: parsePrice(item.querySelector("span.text-accent")),
      };
    });
  },
};
