const axios = require("axios");
const NodeCache = require("node-cache");
const { chromium } = require("playwright");

const cache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 }); // 24h TTL

// --- Chromium Browser Singleton ---
let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

async function fetchWithChromium(url) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    return await page.content();
  } finally {
    await page.close();
    await context.close();
  }
}

// --- Axios Fetch ---
async function fetchWithAxios(url, method = "GET", payload = null) {
  const options = {
    method,
    url,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    timeout: 15000,
  };

  if (payload) options.data = payload;
  if (method === "POST") options.headers["Content-Type"] = "application/json";

  const response = await axios(options);
  return response.data;
}

// --- Main Fetch Wrapper ---
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

    const relevantData = extractFn(rawData);

    if (cacheKey && relevantData) {
      cache.set(cacheKey, relevantData);
    }

    return relevantData;
  } catch (err) {
    console.error(
      `Error fetching ${url} (${useChromium ? "chromium" : "axios"}):`,
      err.message,
    );
    return null;
  }
};

// --- Utility Functions ---
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
  const url = new URL(baseUrl);
  return `${url.protocol}//${url.host}${
    href.startsWith("/") ? "" : "/"
  }${href}`;
};

module.exports = {
  fetchData,
  getCache,
  parsePrice,
  commercialRound,
  getText,
  resolveLink,
};
