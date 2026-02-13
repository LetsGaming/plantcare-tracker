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

  // Case A: Pattern is a Query Parameter (starts with ? or &)
  if (pattern.startsWith("?") || pattern.startsWith("&")) {
    const base = scraper.baseUrl;
    const hasQuery = base.includes("?");

    // Determine the correct connector
    const connector = hasQuery ? "&" : "?";

    // Clean base: remove trailing ? or &
    const cleanBase = base.replace(/[?&]$/, "");

    // Clean pattern: remove leading ? or &
    const cleanPattern = pattern.replace(/^[?&]/, "");

    return `${cleanBase}${connector}${cleanPattern}`;
  }

  // Case B: Pattern is a Path Segment
  const base = scraper.baseUrl.replace(/\/$/, "");
  const cleanPath = pattern.replace(/^\//, "");
  return `${base}/${cleanPath}`;
};

// --- Main Handler ---
const getSalesData = async (req, res) => {
  const sse = setupSSE(res);
  let isAborted = false;

  req.on("close", () => {
    isAborted = true;
  });

  const scrapeWorker = async (scraper, page) => {
    if (isAborted) return;

    try {
      const url = buildUrl(scraper, page);

      // 1. Get the items (This will now correctly SET the cache because we return the data)
      const rawItems = await fetchData(
        url,
        (html) => {
          if (!html) return [];
          const root = parse(html);
          try {
            const parsed = scraper.parseFn(root);
            // CRITICAL: We return the parsed data so fetchData can cache it
            return Array.isArray(parsed) ? parsed : [];
          } catch (err) {
            logger.error(
              `[Scraper: ${scraper.key}] Parse function failed for ${url}: ${err.message}`,
            );
            return [];
          }
        },
        {
          ...scraper.options,
          cacheKey: `${scraper.key}_${page}`,
        },
      );

      // 2. Stream the items to the client (Works for both Cache Hits and fresh Fetches)
      if (rawItems && rawItems.length > 0 && !isAborted) {
        const formattedItems = rawItems
          .map((item) => formatItem(item, scraper))
          .filter(Boolean);

        if (formattedItems.length > 0) {
          // Await the send to respect backpressure
          await sse.sendUnique(formattedItems, "sale_id");
        }
      }
    } catch (err) {
      logger.error(
        `[Scraper: ${scraper.key}] Page ${page} failed: ${err.message}`,
      );
    }
  };

  const sortedScrapers = [...SCRAPERS].sort(
    (a, b) => (a.priority ?? 99) - (b.priority ?? 99),
  );

  const jobs = sortedScrapers.flatMap((scraper) =>
    Array.from({ length: scraper.maxPages || 1 }, (_, i) => {
      const page = i + 1;
      const runner = scraper.options?.useChromium ? chromiumLimit : axiosLimit;

      // Ensure the runner itself is awaited inside the Promise.all logic
      return runner(() => scrapeWorker(scraper, page));
    }),
  );

  // Wait for all workers to complete their execution blocks
  await Promise.allSettled(jobs);
  // 3. Finalize: Add a small delay or check for drain if necessary
  if (!isAborted) {
    // Ensure all data is flushed before closing
    await sse.end();
  }
};

module.exports = { getSalesData };
