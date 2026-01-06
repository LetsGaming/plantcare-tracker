const {
  parsePrice,
  resolveLink,
  getText,
} = require("../../../utils/scrapeUtils");

module.exports = {
  key: "foliageDreams",
  seller: "Foliage Dreams",
  baseUrl: "https://foliagedreams.com/collections/alle-pflanzen?filter.v.availability=1",
  pagePattern: "&page={{page}}",
  maxPages: 3,
  priority: 1,
  options: { useChromium: false },
  parseFn: (root) => {
    return root
      .querySelectorAll(".grid-product__content")
      .map((item) => {
        const originalPriceElem = item.querySelector(".grid-product__price--original");
        if (!originalPriceElem) return null;

        const priceContainer = item.querySelector(".grid-product__price");
        const oldPrice = parsePrice(originalPriceElem);

        // 1. Get the full text and remove the old price
        const fullPriceText = priceContainer.text; 
        const oldPriceText = originalPriceElem.text;
        let remainingText = fullPriceText.replace(oldPriceText, "").trim();
        
        // 2. Extract the new price from the remaining text
        const priceMatch = remainingText.match(/[\d.,]+/);
        const newPrice = priceMatch ? parsePrice(priceMatch[0]) : null;

        if (!newPrice || !oldPrice || newPrice >= oldPrice) return null;

        const titleElem = item.querySelector(".grid-product__title");
        const linkElem = item.querySelector(".grid-product__link");
        const imgElem = item.querySelector(".grid-product__image-mask img");

        const name = getText(titleElem);
        const link = resolveLink(
          linkElem?.getAttribute("href"),
          "https://foliagedreams.com"
        );

        let imgRaw = imgElem?.getAttribute("srcset") || imgElem?.getAttribute("src");
        let img = imgRaw?.split(" ")[0].split(",")[0];
        if (img?.startsWith("//")) img = `https:${img}`;

        return {
          name,
          link,
          img,
          oldPrice,
          newPrice,
        };
      })
      .filter(Boolean);
  },
};