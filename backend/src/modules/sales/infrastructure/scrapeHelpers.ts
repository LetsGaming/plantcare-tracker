/**
 * modules/sales/infrastructure/scrapeHelpers.ts
 *
 * Utility functions used across scrapers.
 * Ported 1:1 from V1's scrapeUtils.js — no logic changes,
 * just proper TypeScript types added.
 */

import type { HTMLElement } from 'node-html-parser';

type NodeLike = HTMLElement | null | undefined;

export const parsePrice = (input: NodeLike | string | null | undefined): number | null => {
  if (!input) return null;
  const str = typeof input === 'object' ? (input as HTMLElement).text : String(input);
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

export const commercialRound = (value: number | null): number | null => {
  if (value === null) return null;
  return Math.round(value * 100) / 100;
};

export const getText = (el: NodeLike, selector?: string): string | null => {
  const target = selector ? el?.querySelector(selector) : el;
  return (target as HTMLElement)?.text?.trim() ||
    (target as HTMLElement)?.textContent?.trim() ||
    null;
};

export const resolveLink = (href: string | null | undefined, baseUrl: string): string | null => {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  if (href.startsWith('//')) return `https:${href}`;
  const base = baseUrl.replace(/\/$/, '');
  const path = href.startsWith('/') ? href : `/${href}`;
  return `${base}${path}`;
};

export const buildPageUrl = (
  baseUrl: string,
  page: number,
  pagePattern?: string,
  urlTemplate?: string,
): string => {
  if (page === 1) return baseUrl;

  // Priority 1: Explicit URL template
  if (urlTemplate) {
    return urlTemplate.replace(/\{\{page\}\}/g, String(page));
  }

  const pattern = pagePattern?.replace(/\{\{page\}\}/g, String(page));
  if (!pattern) return baseUrl;

  // Query parameter pattern (starts with ? or &)
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
