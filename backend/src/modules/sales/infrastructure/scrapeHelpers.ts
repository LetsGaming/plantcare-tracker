/**
 * modules/sales/infrastructure/scrapeHelpers.ts
 *
 * Utility functions used across scrapers.
 * Ported from V1 scrapeUtils.js with corrected behaviour.
 */

import type { HTMLElement } from "node-html-parser";

type NodeLike = HTMLElement | null | undefined;

// ── Price parsing ─────────────────────────────────────────────────────────────

export const parsePrice = (
  input: NodeLike | string | null | undefined,
): number | null => {
  if (!input) return null;

  const str = typeof input === "object" ? (input.text ?? "") : String(input);

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

// ── Financial rounding (same behaviour as V1) ─────────────────────────────────

export const commercialRound = (value: number | null): number | null => {
  if (value === null) return null;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

// ── Text extraction helper ────────────────────────────────────────────────────

export const getText = (el: NodeLike, selector?: string): string | null => {
  const target = selector ? el?.querySelector(selector) : el;
  if (!target) return null;

  return target.text?.trim() || target.textContent?.trim() || null;
};

// ── Robust link resolver (restored V1 logic) ──────────────────────────────────

export const resolveLink = (
  href: string | null | undefined,
  baseUrl: string,
): string | null => {
  if (!href) return null;

  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
};

// ── Image URL extraction ──────────────────────────────────────────────────────

export const extractImageUrl = (
  imgElem: NodeLike,
  baseUrl: string,
): string | null => {
  const raw = ["src", "srcset", "data-src", "data-srcset"]
    .map((attr) => imgElem?.getAttribute(attr))
    .find((value) => value && !value.startsWith("data:"));
  if (!raw) return null;

  // src and srcset values may hold several space or comma separated entries
  const firstEntry = raw.trim().split(",")[0].trim().split(" ")[0];

  // Unwrap image optimizer proxies like /cdn-cgi/image/.../https://...
  const direct = firstEntry.match(/https?:\/\/[^\s]+/);
  if (direct) return direct[0];

  return resolveLink(firstEntry, baseUrl) || null;
};

// ── Pagination URL builder ────────────────────────────────────────────────────

export const buildPageUrl = (
  baseUrl: string,
  page: number,
  pagePattern?: string,
  urlTemplate?: string,
): string => {
  if (page === 1) return baseUrl;

  // Priority 1: explicit URL template
  if (urlTemplate) {
    return urlTemplate.replace(/\{\{page\}\}/g, String(page));
  }

  const pattern = pagePattern?.replace(/\{\{page\}\}/g, String(page));
  if (!pattern) return baseUrl;

  // Query parameter pattern
  if (pattern.startsWith("?") || pattern.startsWith("&")) {
    const hasQuery = baseUrl.includes("?");
    const connector = hasQuery ? "&" : "?";

    const cleanBase = baseUrl.replace(/[?&]$/, "");
    const cleanPattern = pattern.replace(/^[?&]/, "");

    return `${cleanBase}${connector}${cleanPattern}`;
  }

  // Path segment pattern
  const base = baseUrl.replace(/\/$/, "");
  const cleanPath = pattern.replace(/^\//, "");

  return `${base}/${cleanPath}`;
};
