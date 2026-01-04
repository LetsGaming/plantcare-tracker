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

/**
 * Build page URL for a scraper
 *
 * Supported scraper configs:
 * - baseUrl + pagePattern
 * - urlTemplate (with {page})
 * - staticUrl (no paging)
 */
function buildUrl(scraper, page) {
  if (typeof scraper.urlTemplate === "string") {
    return scraper.urlTemplate.replace("{page}", page);
  }

  if (scraper.baseUrl && scraper.pagePattern) {
    const url = new URL(scraper.baseUrl);
    url.searchParams.set(scraper.pagePattern, page);
    return url.toString();
  }

  if (scraper.staticUrl) {
    return scraper.staticUrl;
  }

  throw new Error(`Invalid scraper config for ${scraper.key}`);
}

// --- Main Controller ---
const getSalesData = async (req, res) => {
  const log = (...args) => console.log(new Date().toISOString(), "[SSE]", ...args);

  log("Client connected, starting sales stream");

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const sentIds = new Set();
  let totalItemsSent = 0;

  const sendChunk = (items) => {
    const unique = items.filter((i) => !sentIds.has(i.sale_id));
    unique.forEach((i) => sentIds.add(i.sale_id));

    if (unique.length) {
      totalItemsSent += unique.length;
      log(`Sending chunk with ${unique.length} items (total sent: ${totalItemsSent})`);
      res.write(`data: ${JSON.stringify(unique)}\n\n`);
      res.flush?.();
    } else {
      log("No new items to send in this chunk");
    }
  };

  const jobs = [];

  const doStuff = async (scraper, url, options) => {
    log(`Starting fetch for ${url}`);

    const htmlResponseHandler = (html) => {
      try {
        const root = parse(html);
        const items = scraper
          .parseFn(root)
          .map((i) => formatItem(i, scraper))
          .filter(Boolean);

        log(`Parsed ${items.length} items from ${url}`);
        sendChunk(items);
      } catch (err) {
        log(`Error parsing HTML for ${url}: ${err.message}`);
      }
    };

    try {
      await fetchData(url, htmlResponseHandler, options);
      log(`Finished fetch for ${url}`);
    } catch (err) {
      log(`Error fetching ${url}: ${err.message}`);
    }
  };

  for (const scraper of SCRAPERS) {
    log(`Starting scraper: ${scraper.key}`);
    for (let p = 1; p <= scraper.maxPages; p++) {
      let url;
      try {
        url = buildUrl(scraper, p);
        log(`Built URL for page ${p}: ${url}`);
      } catch (err) {
        log(`Skipping page ${p} for ${scraper.key}: failed to build URL`);
        console.log(err);
        continue;
      }

      jobs.push(doStuff(scraper, url, { ...scraper.options, cacheKey: `${scraper.key}_${p}` }));
    }
  }

  log("Waiting for all fetches to complete...");
  await Promise.allSettled(jobs);
  log(`All fetches completed, sending done event (total items sent: ${totalItemsSent})`);

  res.write(`event: done\ndata: {}\n\n`);
  res.end();

  log("Response ended, client stream closed");
};

module.exports = { getSalesData };
