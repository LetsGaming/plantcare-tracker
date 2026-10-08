/**
 * modules/sales/infrastructure/scrapeHelpers.ts
 *
 * Utility functions used across scrapers.
 * Ported from V1 scrapeUtils.js with corrected behaviour.
 */

import type { HTMLElement } from 'node-html-parser';

type NodeLike = HTMLElement | null | undefined;

// ── Price parsing ─────────────────────────────────────────────────────────────

export const parsePrice = (input: NodeLike | string | null | undefined): number | null => {
  if (!input) return null;

  const str = typeof input === 'object' ? (input.text ?? '') : String(input);

  let cleanStr = str.replace(/[^\d.,-]/g, '').trim();

  if (cleanStr.includes(',') && cleanStr.includes('.')) {
    if (cleanStr.lastIndexOf(',') > cleanStr.lastIndexOf('.')) {
      cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
    } else {
      cleanStr = cleanStr.replace(/,/g, '');
    }
  } else {
    cleanStr = cleanStr.replace(',', '.');
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

export const resolveLink = (href: string | null | undefined, baseUrl: string): string | null => {
  if (!href) return null;

  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
};

// ── Image URL extraction ──────────────────────────────────────────────────────

/**
 * Turns an src or srcset value into one absolute http(s) URL, or null.
 * Image optimizer proxies (/cdn-cgi/image/width=3840,quality=80/https://host/a.jpg)
 * are unwrapped to the original image first, because their option list holds
 * commas that would otherwise be read as srcset separators.
 */
export const normalizeImageUrl = (
  raw: string | null | undefined,
  baseUrl: string,
): string | null => {
  const firstCandidate = raw?.trim().split(/,\s+/)[0].split(/\s+/)[0];
  if (!firstCandidate) return null;

  const embedded = firstCandidate.search(/https?:\/\//i);
  const candidate = embedded > 0 ? firstCandidate.slice(embedded) : firstCandidate;

  try {
    const url = new URL(candidate, baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

export const extractImageUrl = (imgElem: NodeLike, baseUrl: string): string | null => {
  for (const attr of ['src', 'srcset', 'data-src', 'data-srcset']) {
    const url = normalizeImageUrl(imgElem?.getAttribute(attr), baseUrl);
    if (url) return url;
  }
  return null;
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
  if (pattern.startsWith('?') || pattern.startsWith('&')) {
    const hasQuery = baseUrl.includes('?');
    const connector = hasQuery ? '&' : '?';

    const cleanBase = baseUrl.replace(/[?&]$/, '');
    const cleanPattern = pattern.replace(/^[?&]/, '');

    return `${cleanBase}${connector}${cleanPattern}`;
  }

  // Path segment pattern
  const base = baseUrl.replace(/\/$/, '');
  const cleanPath = pattern.replace(/^\//, '');

  return `${base}/${cleanPath}`;
};
