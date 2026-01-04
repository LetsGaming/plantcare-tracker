const { parsePrice, getText } = require("../../../utils/scrapeUtils");

module.exports = {
  key: "jungleLeaves",
  seller: "Jungle Leaves",
  baseUrl: "https://www.jungle-leaves.de/produkt-kategorie/sale",
  pagePattern: "page/{{page}}/", // Jungle leaves specific path
  maxPages: 2,
  options: { useChromium: true },
  parseFn: (root) => {
    return root.querySelectorAll(".product").map((item) => {
      const linkElem = item.querySelector(".product-loop-title");
      return {
        link: linkElem?.getAttribute("href"),
        name: getText(linkElem, ".woocommerce-loop-product__title"),
        img: item.querySelector("img")?.getAttribute("src"),
        oldPrice: parsePrice(item.querySelector("span.price del bdi")),
        newPrice: parsePrice(item.querySelector("span.price ins bdi")),
      };
    });
  },
};
