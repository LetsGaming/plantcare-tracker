const { parse } = require("node-html-parser");
const crypto = require("crypto");
const logger = require("../../utils/logger");
const { setupSSE } = require("../../utils/responseUtils");
const { createLimiter } = require("../../utils/concurrency");
const { fetchData } = require("../../utils/scrape/scrapeUtils");
const SCRAPERS = require("./sources");

// --- Concurrency Limiters ---
// Keep Chromium low to prevent CPU spikes; Axios can be higher
const chromiumLimit = createLimiter(2);
const axiosLimit = createLimiter(8);

// --- Domain Helpers ---
const normalizeUrl = (url) => {
  try {
    const u = new URL(url);
    // Standardize to https and remove www.
    u.protocol = "https:";
    u.hostname = u.hostname.replace(/^www\./, "");
    u.hash = "";
    u.search = "";
    // Remove trailing slash
    let path = u.pathname.replace(/\/$/, "");
    u.pathname = path;
    return u.toString().toLowerCase();
  } catch (err) {
    return url.toLowerCase();
  }
};

const generateSaleId = (seller, link) => {
  if (!link) return null;
  const normalized = normalizeUrl(link);
  return crypto
    .createHash("sha1")
    .update(`${seller.toLowerCase()}|${normalized}`)
    .digest("hex");
};

const formatItem = (item, scraper) => {
  if (!item?.link || !item?.newPrice) return null;
  return {
    sale_id: generateSaleId(scraper.seller, item.link),
    sale_name: item.name?.trim() ?? "Unnamed Product",
    sale_seller: scraper.seller,
    sale_link: item.link,
    sale_image_url: item.img ?? null,
    sale_old_price: item.oldPrice ?? null,
    sale_new_price: item.newPrice,
    sale_scraped_at: new Date().toISOString(),
  };
};

const buildUrl = (scraper, page) => {
  if (page === 1) return scraper.baseUrl;

  // Priority 1: Explicit URL Template
  if (scraper.urlTemplate) {
    return scraper.urlTemplate.replace(/\{\{page\}\}/g, page);
  }

  // Priority 2: Pattern-based construction
  const pattern = scraper.pagePattern?.replace(/\{\{page\}\}/g, page);
  if (!pattern) return scraper.baseUrl;

  if (pattern.startsWith("?") || pattern.startsWith("&")) {
    const separator = scraper.baseUrl.includes("?") ? "&" : "?";
    // Avoid double question marks if pattern already includes it
    const cleanPattern = pattern.startsWith("?")
      ? pattern.substring(1)
      : pattern;
    return `${scraper.baseUrl}${separator}${cleanPattern}`;
  }

  const base = scraper.baseUrl.replace(/\/$/, "");
  return `${base}/${pattern.replace(/^\//, "")}`;
};

// --- Main Handler ---
const getSalesData = async (req, res) => {
  const sse = setupSSE(res);
  let isAborted = false;

  // Handle client disconnect
  req.on("close", () => {
    isAborted = true;
    logger.info("Client disconnected, stopping scrape tasks...");
  });

  /**
   * Internal worker function for a single page
   */
  const scrapeWorker = async (scraper, page) => {
    if (isAborted) return;

    try {
      const url = buildUrl(scraper, page);

      await fetchData(
        url,
        (html) => {
          if (!html) return [];

          let root = parse(html);
          try {
            const rawItems = scraper.parseFn(root);
            if (!Array.isArray(rawItems)) return;

            const formattedItems = rawItems
              .map((item) => formatItem(item, scraper))
              .filter(Boolean);

            if (formattedItems.length > 0) {
              sse.sendUnique(formattedItems, "sale_id");
            }
          } finally {
            // Explicitly help GC with large DOM trees
            root = null;
          }
        },
        {
          ...scraper.options,
          cacheKey: `${scraper.key}_${page}`,
        },
      );
    } catch (err) {
      logger.error(
        `[Scraper: ${scraper.key}] Page ${page} failed: ${err.message}`,
      );
    }
  };

  // 1. Prepare and Sort Jobs
  // We sort by priority so the limiter processes high-priority sites first
  const sortedScrapers = [...SCRAPERS].sort(
    (a, b) => (a.priority ?? 99) - (b.priority ?? 99),
  );

  const jobs = sortedScrapers.flatMap((scraper) =>
    Array.from({ length: scraper.maxPages || 1 }, (_, i) => {
      const page = i + 1;
      const runner = scraper.options?.useChromium ? chromiumLimit : axiosLimit;

      // Wrap the worker in the limiter
      return runner(() => scrapeWorker(scraper, page));
    }),
  );

  // 2. Execute all tasks
  // Promise.allSettled ensures one scraper failing doesn't stop the others
  await Promise.allSettled(jobs);

  // 3. Finalize
  if (!isAborted) {
    sse.end();
  }
};

module.exports = { getSalesData };
