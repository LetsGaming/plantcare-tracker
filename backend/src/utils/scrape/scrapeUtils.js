const axios = require("axios");
const NodeCache = require("node-cache");
const { chromium } = require("playwright");
const logger = require("../logger");
const dns = require("node:dns");

// Prevents AggregateError by prioritizing IPv4
dns.setDefaultResultOrder("ipv4first");

const cache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
      ],
    });
  }
  return browserPromise;
}

/**
 * Enhanced Chromium Fetcher
 * Optimized to block unnecessary resources (images/ads/css)
 */
async function fetchWithChromium(url) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  try {
    // Optimization: Block heavy assets that don't affect the HTML structure
    await page.route(
      "**/*.{png,jpg,jpeg,gif,webp,svg,css,woff,woff2,google-analytics,doubleclick}",
      (route) => route.abort(),
    );

    // Faster waitUntil, usually enough for scrapers
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

    // Race between network idle and a hard timeout
    await Promise.race([
      page.waitForLoadState("networkidle").catch(() => {}),
      page.waitForSelector("body").catch(() => {}), // Fallback: wait for body at least
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);

    return await page.content();
  } catch (err) {
    logger.error(`[Chromium] Failed for ${url}: ${err.message}`);
    throw err;
  } finally {
    // Close page and context to free memory, but keep browser singleton alive
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
  if (cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  }

  try {
    const rawData = useChromium
      ? await fetchWithChromium(url)
      : await fetchWithAxios(url, method, payload);

    if (!rawData) return null;

    const relevantData = extractFn(rawData);

    if (cacheKey && relevantData) {
      cache.set(cacheKey, relevantData);
    }

    return relevantData;
  } catch (err) {
    // Log the error but don't crash the loop
    return null;
  }
};

const getCache = () => cache;

/**
 * Improved Price Parsing
 * Handles cases like "1.299,00 €" or "$1,200.50"
 */
const parsePrice = (input) => {
  if (!input) return null;
  const str = typeof input === "object" ? input.text : String(input);

  // Remove currency symbols and whitespace
  let cleanStr = str.replace(/[^\d.,-]/g, "").trim();

  // Detect European format: 1.234,56 -> 1234.56
  if (cleanStr.includes(",") && cleanStr.includes(".")) {
    if (cleanStr.lastIndexOf(",") > cleanStr.lastIndexOf(".")) {
      cleanStr = cleanStr.replace(/\./g, "").replace(",", ".");
    } else {
      cleanStr = cleanStr.replace(/,/g, "");
    }
  } else {
    // Single separator case
    cleanStr = cleanStr.replace(",", ".");
  }

  const number = parseFloat(cleanStr);
  return isNaN(number) ? null : number;
};

const commercialRound = (num) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
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

/**
 * Graceful Shutdown
 */
const closeBrowser = async () => {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
};

module.exports = {
  fetchData,
  getCache,
  parsePrice,
  commercialRound,
  getText,
  resolveLink,
  closeBrowser,
};
