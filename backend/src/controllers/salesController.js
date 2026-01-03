const crypto = require("crypto");
const { parse } = require("node-html-parser");
const {
  successResponse,
  notFoundResponse,
} = require("../utils/responseUtils.js");
const { fetchData } = require("../utils/scrapeUtils");

// --- Shared Utilities ---

const generateSaleId = (seller, link) => {
  if (!link) return null;
  return crypto.createHash("sha1").update(`${seller}|${link}`).digest("hex");
};

const parsePrice = (input) => {
  if (!input) return null;
  // Handle node-html-parser objects
  const str = typeof input === "object" ? input.text : String(input);
  const cleanStr = str.replace(/[^\d.,]/g, "").replace(",", ".");
  const number = parseFloat(cleanStr);
  return isNaN(number) ? null : number;
};

const getText = (el, selector = null) => {
  const target = selector ? el?.querySelector(selector) : el;
  return target?.text?.trim() ?? null;
};

const resolveLink = (href, baseUrl) => {
  if (!href) return null;
  if (href.startsWith("http")) return href;
  const url = new URL(baseUrl);
  return `${url.protocol}//${url.host}${
    href.startsWith("/") ? "" : "/"
  }${href}`;
};

// --- Scraper Configurations ---

const SCRAPERS = [
  {
    key: "harmonyPlants",
    seller: "Harmony Plants",
    baseUrl: "https://harmonyplants.com/collections/sale25",
    pagePattern: "?page={{page}}",
    maxPages: 3,
    options: { useChromium: true },
    parseFn: (root) => {
      return root.querySelectorAll(".grid__item").map((item) => {
        const priceElem = item.querySelector(".price--on-sale");
        if (!priceElem) return null;
        const linkElem = item.querySelector("a");
        const link = resolveLink(
          linkElem?.getAttribute("href"),
          "https://harmonyplants.com"
        );

        const extractComplexPrice = (selector) => {
          const bdi = priceElem.querySelector(selector);
          if (!bdi) return null;
          const main =
            bdi.childNodes.find((n) => n.nodeType === 3)?.text.trim() ?? "";
          const suffix = bdi.querySelector("sup")?.text.trim() ?? "";
          return parsePrice(`${main}${suffix}`);
        };

        return {
          link,
          name: getText(linkElem, "span") ?? "Unnamed Plant",
          img: item.querySelector("img")?.getAttribute("src"),
          oldPrice: extractComplexPrice(
            ".price__sale s.price-item--regular bdi"
          ),
          newPrice: extractComplexPrice(".price-item--sale bdi"),
        };
      });
    },
  },
  {
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
  },
  {
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
          link: resolveLink(
            linkElem?.getAttribute("href"),
            "https://plnts.com"
          ),
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
  },
  {
    key: "plantcircle",
    seller: "Plant Circle",
    baseUrl: "https://plantcircle.com/de/collections/houseplant-sale",
    pagePattern: "?page={{page}}",
    maxPages: 2,
    options: { useChromium: false },
    parseFn: (root) => {
      return root.querySelectorAll(".card--product").map((item) => {
        const linkElem = item.querySelector('a[href^="/de/products/"]');
        return {
          link: resolveLink(
            linkElem?.getAttribute("href"),
            "https://plantcircle.com"
          ),
          name: getText(item, ".card__title"),
          img:
            item.querySelector(".card__image img")?.getAttribute("src") ||
            item.querySelector(".card__image img")?.getAttribute("data-src"),
          oldPrice: parsePrice(item.querySelector(".price__sale s span")),
          newPrice: parsePrice(item.querySelector(".price-item--sale span")),
        };
      });
    },
  },
];

// --- Main Controller ---

const getSalesData = async (req, res) => {
  const allFetchPromises = [];

  SCRAPERS.forEach((scraper) => {
    for (let p = 1; p <= scraper.maxPages; p++) {
      // Build the URL based on the page number
      let targetUrl = scraper.baseUrl;
      if (p > 1) {
        // Handle path-based (Jungle Leaves) vs query-based (others)
        const suffix = scraper.pagePattern.replace("{{page}}", p);
        targetUrl = scraper.baseUrl.endsWith("/")
          ? `${scraper.baseUrl}${suffix}`
          : `${scraper.baseUrl}/${suffix}`;

        // Clean up any double slashes caused by the join
        targetUrl = targetUrl.replace(/([^:]\/)\/+/g, "$1");
      }

      const pagePromise = fetchData(
        targetUrl,
        (html) => {
          const root = parse(html);
          const rawItems = scraper.parseFn(root);

          return rawItems
            .filter((item) => item && item.link && item.newPrice)
            .map((item) => ({
              sale_id: generateSaleId(scraper.seller, item.link),
              sale_name: (item.name ?? "Unnamed Plant").slice(0, 45),
              sale_seller: scraper.seller,
              sale_link: item.link,
              sale_image_url: item.img ?? null,
              sale_old_price: item.oldPrice,
              sale_new_price: item.newPrice,
            }));
        },
        { ...scraper.options, cacheKey: `${scraper.key}_page_${p}` }
      );

      allFetchPromises.push(pagePromise);
    }
  });

  const results = await Promise.allSettled(allFetchPromises);

  // Flatten all results into a single array
  const allSales = results
    .filter((r) => r.status === "fulfilled" && Array.isArray(r.value))
    .flatMap((r) => r.value);

  if (allSales.length === 0) {
    return notFoundResponse(res, "No sales data found");
  }

  // Final deduplication by sale_id (in case products shift pages during crawl)
  const uniqueSales = Array.from(
    new Map(allSales.map((s) => [s.sale_id, s])).values()
  );

  return successResponse(res, uniqueSales);
};

module.exports = { getSalesData };
