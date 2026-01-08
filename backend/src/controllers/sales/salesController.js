const { parse } = require("node-html-parser");
const crypto = require("crypto");
const { setupSSE } = require("../../utils/responseUtils");
const { createLimiter } = require("../../utils/concurrency");
const { fetchData } = require("../../utils/scrape/scrapeUtils.js");
const SCRAPERS = require("./sources");

// --- Concurrency Limiters ---
const chromiumLimit = createLimiter(2);
const axiosLimit = createLimiter(8);

// --- Domain Helpers ---
const generateSaleId = (seller, link) => {
  if (!link) return null;
  return crypto.createHash("sha1").update(`${seller}|${link}`).digest("hex");
};

const formatItem = (item, scraper) => {
  if (!item?.link || !item?.newPrice) return null;
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
};

const buildUrl = (scraper, page) => {
  if (page === 1) return scraper.baseUrl;
  if (scraper.urlTemplate) return scraper.urlTemplate.replace(/\{\{page\}\}/g, page);
  
  const pattern = scraper.pagePattern?.replace(/\{\{page\}\}/g, page);
  if (pattern?.startsWith("?")) return `${scraper.baseUrl}${pattern}`;
  if (pattern?.endsWith("/")) return `${scraper.baseUrl.replace(/\/$/, "")}/${pattern}`;
  
  return `${scraper.baseUrl}${pattern}`;
};

// --- Main Handler ---
const getSalesData = async (req, res) => {
  const sse = setupSSE(res);

  /**
   * Internal worker function for a single page
   */
  const scrapeWorker = async (scraper, page) => {
    try {
      const url = buildUrl(scraper, page);
      
      await fetchData(
        url,
        (html) => {
          const root = parse(html);
          const rawItems = scraper.parseFn(root);
          
          const formattedItems = rawItems
            .map((item) => formatItem(item, scraper))
            .filter(Boolean);

          // SSEManager handles deduplication internally via sendUnique
          sse.sendUnique(formattedItems, "sale_id");
        },
        { ...scraper.options, cacheKey: `${scraper.key}_${page}` }
      );
    } catch (err) {
      console.error(`[Scraper: ${scraper.key}] Page ${page} failed:`, err.message);
    }
  };

  // 1. Create a flattened list of all scraping tasks
  const jobs = SCRAPERS
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .flatMap((scraper) =>
      Array.from({ length: scraper.maxPages }, (_, i) => {
        const page = i + 1;
        const runner = scraper.options?.useChromium ? chromiumLimit : axiosLimit;
        
        // Return a promise that the limiter will resolve
        return runner(() => scrapeWorker(scraper, page));
      })
    );

  // 2. Execute all tasks in parallel (limited by the runners)
  await Promise.allSettled(jobs);

  // 3. Close the stream
  sse.end();
};

module.exports = { getSalesData };