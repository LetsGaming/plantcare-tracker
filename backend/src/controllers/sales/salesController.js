const crypto = require("crypto");
const { parse } = require("node-html-parser");
const {
  successResponse,
  notFoundResponse,
} = require("../../utils/responseUtils.js");
const { fetchData } = require("../../utils/scrapeUtils.js");

const SCRAPERS = require("./sources");

const generateSaleId = (seller, link) => {
  if (!link) return null;
  return crypto.createHash("sha1").update(`${seller}|${link}`).digest("hex");
};

function formatItem(item, scraper) {
  if (!item || !item.link || !item.newPrice) return null;
  return {
    sale_id: generateSaleId(scraper.seller, item.link),
    sale_name: (item.name ?? "Unnamed").slice(0, 45),
    sale_name_full: item.name ?? "Unnamed",
    sale_seller: scraper.seller,
    sale_link: item.link,
    sale_image_url: item.img ?? null,
    sale_old_price: item.oldPrice,
    sale_new_price: item.newPrice,
  };
}

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
            .map((item) => formatItem(item, scraper))
            .filter((item) => item !== null);
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
