const axios = require("axios");
const NodeCache = require("node-cache");
const { chromium } = require("playwright");

const cache = new NodeCache({ stdTTL: 24 * 60 * 60, checkperiod: 3600 });

async function fetchWithChromium(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle" });
  const html = await page.content();

  await browser.close();
  return html;
}

async function fetchWithAxios(url, method, payload) {
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
  if (method === "POST") {
    options.headers["Content-Type"] = "application/json";
  }

  const response = await axios(options);
  return response.data;
}

const fetchData = async (
  url,
  extractFn,
  {
    method = "GET",
    payload = null,
    cacheKey = null,
    useChromium = false,
  } = {}
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
      err.message
    );
    return null;
  }
};

const getCache = () => cache;

module.exports = { fetchData };
