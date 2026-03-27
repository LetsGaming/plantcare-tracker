/**
 * modules/sales/infrastructure/HttpFetcher.ts
 *
 * Wraps Axios and Playwright into a single injectable fetching service.
 * V1 had this logic spread across scrapeUtils.js and directly called from
 * controllers. Now it's a proper infrastructure service with typed interface.
 */

import axios from "axios";
import { chromium, type Browser } from "playwright";
import dns from "node:dns";
import { createModuleLogger } from "../../../core/logging";

dns.setDefaultResultOrder("ipv4first");

const log = createModuleLogger("HttpFetcher");

// ── Browser singleton ─────────────────────────────────────────────────────────

let browserPromise: Promise<Browser> | null = null;
const getBrowser = async (): Promise<Browser> => {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        // launch headless in prod but headed in dev for easier debugging
        headless:
          process.env.headless_browser === "true" ||
          process.env.NODE_ENV === "production",
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
};

export const closeBrowser = async (): Promise<void> => {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
};

// ── Axios fetch with retry ────────────────────────────────────────────────────

const fetchWithAxios = async (
  url: string,
  retries = 2,
): Promise<string | null> => {
  try {
    const response = await axios.get<string>(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
      timeout: 15_000,
    });
    return response.data;
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status: number }; message: string };
    if (
      retries > 0 &&
      (!axiosErr.response || axiosErr.response.status >= 500)
    ) {
      const delay = (3 - retries) * 2000;
      const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
      log.warn(`Retrying ${host} in ${delay}ms... (${retries} left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithAxios(url, retries - 1);
    }
    const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
    log.error(`Final failure for ${host}`, { err: axiosErr });
    return null;
  }
};

// ── Chromium fetch ────────────────────────────────────────────────────────────

const fetchWithChromium = async (url: string): Promise<string | null> => {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    locale: "de-DE",
  });
  const page = await context.newPage();

  try {
    await page.route(
      "**/*.{png,jpg,jpeg,gif,webp,svg,css,woff,woff2}",
      (route) => {
        route.abort();
      },
    );

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1500);

    // Passed as a string to avoid TS "Cannot find name 'window'" errors in Node environment
    await page.evaluate(
      'window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })',
    );

    await page.waitForTimeout(1000);

    return await page.content();
  } catch (err: unknown) {
    const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
    log.error(`Chromium fetch failed for ${host}`, { err });
    return null;
  } finally {
    await context.close();
  }
};

// ── Public API ────────────────────────────────────────────────────────────────

export const fetchHtml = async (
  url: string,
  useChromium: boolean,
): Promise<string | null> => {
  return useChromium ? fetchWithChromium(url) : fetchWithAxios(url);
};
