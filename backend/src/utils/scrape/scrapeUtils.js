const axios = require("axios");
const NodeCache = require("node-cache");
const { chromium } = require("playwright");
const logger = require("../logger");
const dns = require("node:dns");

dns.setDefaultResultOrder("ipv4first");

const cache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });
let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
      })
      .then((b) => {
        b.once("disconnected", () => {
          browserPromise = null;
        });
        return b;
      });
  }
  return browserPromise;
}

// --- Utilities used by Scrapers ---

const parsePrice = (input) => {
  if (!input) return null;
  const str = typeof input === "object" ? input.text : String(input);
  let cleanStr = str.replace(/[^\d.,-]/g, "").trim();

  if (cleanStr.includes(",") && cleanStr.includes(".")) {
    if (cleanStr.lastIndexOf(",") > cleanStr.lastIndexOf(".")) {
      cleanStr = cleanStr.replace(/\./g, "").replace(",", ".");
    } else {
      cleanStr = cleanStr.replace(/,/g, "");
    }
  } else {
    cleanStr = cleanStr.replace(",", ".");
  }

  const number = parseFloat(cleanStr);
  return isNaN(number) ? null : number;
};

const getText = (el, selector = null) => {
  const target = selector ? el?.querySelector(selector) : el;
  return target?.text?.trim() || target?.textContent?.trim() || null;
};

const resolveLink = (href, baseUrl) => {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).href;
  } catch (e) {
    return href;
  }
};

const commercialRound = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

// --- Main Fetchers ---

async function fetchWithChromium(url) {
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.route("**/*.{png,jpg,jpeg,gif,webp,svg,css,js}", (route) => {
      // Block images/css but let essential scripts run if needed for some scrapers
      const type = route.request().resourceType();
      if (["image", "stylesheet", "font"].includes(type)) return route.abort();
      route.continue();
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    return await page.content();
  } finally {
    await page.close();
    await context.close();
  }
}

/**
 * Enhanced Axios Fetcher
 * Implements exponential backoff for retries
 */
async function fetchWithAxios(
  url,
  method = "GET",
  payload = null,
  retries = 2,
) {
  const options = {
    method,
    url,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    timeout: 20000,
    family: 4,
  };

  if (payload) options.data = payload;
  if (method === "POST") options.headers["Content-Type"] = "application/json";

  try {
    const response = await axios(options);
    return response.data;
  } catch (err) {
    if (retries > 0 && (!err.response || err.response.status >= 500)) {
      const delay = (3 - retries) * 2000;
      logger.warn(`[Axios] Retrying ${url} in ${delay}ms... (${retries} left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithAxios(url, method, payload, retries - 1);
    }
    logger.error(`[Axios] Final failure for ${url}: ${err.message}`);
    throw err;
  }
}

const fetchData = async (
  url,
  extractFn,
  { method = "GET", payload = null, cacheKey = null, useChromium = false } = {},
) => {
  // 1. CACHE CHECK
  if (cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  try {
    const rawData = useChromium
      ? await fetchWithChromium(url)
      : await fetchWithAxios(url, method, payload);

    if (!rawData) {
      logger.warn(`[Fetch] No raw data for ${url}`);
      return null;
    }

    // 2. Process data (MUST AWAIT in case extractFn is async)
    const relevantData = await extractFn(rawData);

    // 3. CACHE SET
    if (cacheKey) {
      if (!relevantData) {
      } else if (Array.isArray(relevantData)) {
        if (relevantData.length > 0) {
          cache.set(cacheKey, relevantData);
        }
      } else {
        // Not an array, just set it
        cache.set(cacheKey, relevantData);
      }
    }

    return relevantData;
  } catch (err) {
    logger.error(`FetchData error for ${url}: ${err.message}`);
    return null;
  }
};

module.exports = {
  fetchData,
  parsePrice,
  getText,
  resolveLink,
  commercialRound,
  getCache: () => cache,
  closeBrowser: async () => {
    if (browserPromise) {
      const browser = await browserPromise;
      await browser.close();
      browserPromise = null;
    }
  },
};
