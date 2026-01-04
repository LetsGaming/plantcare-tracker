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
  // Use urlTemplate if defined
  if (typeof scraper.urlTemplate === "string") {
    return scraper.urlTemplate.replace(/\{\{page\}\}/g, page);
  }

  // If pagePattern exists, replace placeholder
  if (scraper.baseUrl && scraper.pagePattern) {
    const pattern = scraper.pagePattern.replace(/\{\{page\}\}/g, page);

    // Check if pattern starts with "?" → query param
    if (pattern.startsWith("?")) {
      return `${scraper.baseUrl}${pattern}`;
    } else if (pattern.endsWith("/")) {
      // Otherwise treat as path
      return `${scraper.baseUrl.replace(/\/$/, "")}/${pattern}`;
    } else {
      return `${scraper.baseUrl}${pattern}`;
    }
  }

  if (scraper.staticUrl) {
    return scraper.staticUrl;
  }

  throw new Error(`Invalid scraper config for ${scraper.key}`);
}

// --- Main Controller ---
const getSalesData = async (req, res) => {
  const log = (...args) =>
    console.log(new Date().toISOString(), "[SSE]", ...args);

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
      res.write(`data: ${JSON.stringify(unique)}\n\n`);
      res.flush?.();
    }
  };

  const jobs = [];

  const doStuff = async (scraper, url, options) => {
    const htmlResponseHandler = (html) => {
      try {
        const root = parse(html);
        const items = scraper
          .parseFn(root)
          .map((i) => formatItem(i, scraper))
          .filter(Boolean);

        sendChunk(items);
      } catch (err) {}
    };

    try {
      await fetchData(url, htmlResponseHandler, options);
    } catch (err) {
      log(`Error fetching ${url}: ${err.message}`);
    }
  };

  for (const scraper of SCRAPERS) {
    for (let p = 1; p <= scraper.maxPages; p++) {
      let url;
      try {
        url = buildUrl(scraper, p);
      } catch (err) {
        console.log(err);
        continue;
      }

      jobs.push(
        doStuff(scraper, url, {
          ...scraper.options,
          cacheKey: `${scraper.key}_${p}`,
        })
      );
    }
  }

  await Promise.allSettled(jobs);

  res.write(`event: done\ndata: {}\n\n`);
  res.end();
};

module.exports = { getSalesData };
