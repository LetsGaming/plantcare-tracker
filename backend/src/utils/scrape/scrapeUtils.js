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
      ],
    });
  }
  return browserPromise;
}

async function fetchWithChromium(url) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    // 1. Wait for basic HTML structure
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // 2. Generic "Smart Wait":
    // We wait for either the network to actually go idle OR 3.5 seconds to pass.
    // This catches fast sites immediately and prevents slow/chat-heavy sites from timing out.
    await Promise.race([
      page.waitForLoadState("networkidle").catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 3500)),
    ]);

    return await page.content();
  } catch (err) {
    logger.error(`Chromium failed for ${url}: ${err.message}`);
    throw err;
  } finally {
    await page.close();
    await context.close();
  }
}

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
      Accept: "text/html,application/xhtml+xml",
    },
    timeout: 15000,
    family: 4, // Force IPv4
  };

  if (payload) options.data = payload;
  if (method === "POST") options.headers["Content-Type"] = "application/json";

  try {
    const response = await axios(options);
    return response.data;
  } catch (err) {
    if (retries > 0) {
      const waitTime = (3 - retries) * 2000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return fetchWithAxios(url, method, payload, retries - 1);
    }
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
    logger.error(`Error fetching ${url}: ${err.message}`);
    return null;
  }
};

const getCache = () => cache;

const parsePrice = (input) => {
  if (!input) return null;
  const str = typeof input === "object" ? input.text : String(input);
  const cleanStr = str.replace(/[^\d.,]/g, "").replace(",", ".");
  const number = parseFloat(cleanStr);
  return isNaN(number) ? null : number;
};

const commercialRound = (num) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

const getText = (el, selector = null) => {
  const target = selector ? el?.querySelector(selector) : el;
  return target?.text?.trim() ?? null;
};

const resolveLink = (href, baseUrl) => {
  if (!href) return null;
  if (href.startsWith("http")) return href;
  try {
    const url = new URL(baseUrl);
    return `${url.protocol}//${url.host}${href.startsWith("/") ? "" : "/"}${href}`;
  } catch (e) {
    return href;
  }
};

module.exports = {
  fetchData,
  getCache,
  parsePrice,
  commercialRound,
  getText,
  resolveLink,
};
