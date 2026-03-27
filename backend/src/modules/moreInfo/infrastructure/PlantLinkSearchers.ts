/**
 * modules/moreInfo/infrastructure/PlantLinkSearchers.ts
 *
 * Ported from V1's plantSources.js + searchFactory.js.
 * Each searcher fetches and scores links for a given plant name.
 */

import { parse } from 'node-html-parser';
import axios from 'axios';
import type { CacheService } from '../../../core/cache/CacheService';
import { createModuleLogger } from '../../../core/logging';

const log = createModuleLogger('PlantLinkSearchers');

// ── Relevance scoring ─────────────────────────────────────────────────────────

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/);

const score = (query: string, url: string): number => {
  const qWords = normalize(query);
  const uWords = normalize(decodeURIComponent(url));
  const matches = qWords.filter((w) => uWords.includes(w)).length;
  return (
    Math.round((matches / qWords.length) * 100) +
    (decodeURIComponent(url).includes(query.toLowerCase()) ? 20 : 0) +
    (uWords.indexOf(qWords[0]) === 0 ? 10 : 0) +
    Math.max(0, 10 - uWords.length)
  );
};

const findBestMatch = (query: string, links: string[]): string | null =>
  links.reduce<{ link: string | null; score: number }>(
    (best, link) => { const s = score(query, link); return s > best.score ? { link, score: s } : best; },
    { link: null, score: 0 },
  ).link;

// ── HTTP helpers ──────────────────────────────────────────────────────────────

const fetchJson = async (url: string, options?: { method?: string; data?: unknown }): Promise<unknown> => {
  const res = await axios({
    url, method: options?.method ?? 'GET', data: options?.data,
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    timeout: 10_000,
  });
  return res.data;
};

const fetchHtml = async (url: string): Promise<string> => {
  const res = await axios.get<string>(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    timeout: 10_000,
  });
  return res.data;
};

const resolveLink = (href: string | null | undefined, baseUrl: string): string | null => {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  if (href.startsWith('//')) return `https:${href}`;
  return `${baseUrl.replace(/\/$/, '')}${href.startsWith('/') ? href : `/${href}`}`;
};

// ── Searcher type ─────────────────────────────────────────────────────────────

type Searcher = (plantName: string) => Promise<string | null>;

// ── HTML-based searchers ──────────────────────────────────────────────────────

const htmlSearcher = (config: {
  key: string;
  baseUrl: string;
  searchUrl: (q: string) => string;
  selector: string;
  filter?: (href: string) => boolean;
  useChromium?: boolean;
  cache: CacheService;
}): Searcher =>
  async (plantName) => {
    const cacheKey = `${config.key}_${plantName.toLowerCase().replace(/\s+/g, '_')}`;
    const cached = config.cache.get<string>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const url = config.searchUrl(encodeURIComponent(plantName));
      const html = await fetchHtml(url);
      const root = parse(html);
      const links = [...new Set(
        root.querySelectorAll(config.selector)
          .map((a) => a.getAttribute('href'))
          .filter((href): href is string => !!href && (!config.filter || config.filter(href))),
      )];
      const best = findBestMatch(plantName, links);
      const result = best ? resolveLink(best, config.baseUrl) : null;
      config.cache.set(cacheKey, result ?? '', 86_400);
      return result;
    } catch (err: unknown) {
      log.warn(`[${config.key}] search failed`, { err });
      return null;
    }
  };

// ── API-based searchers ───────────────────────────────────────────────────────

const wikipediaSearcher = (cache: CacheService): Searcher =>
  async (plantName) => {
    const cacheKey = `wikipedia_${plantName.toLowerCase().replace(/\s+/g, '_')}`;
    const cached = cache.get<string>(cacheKey);
    if (cached !== undefined) return cached;
    try {
      const data = await fetchJson(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(plantName)}&format=json`,
      ) as { query?: { search?: { title: string }[] } };
      const links = (data.query?.search ?? []).map((r) => `https://en.wikipedia.org/wiki/${r.title.replace(/ /g, '_')}`);
      const result = findBestMatch(plantName, links);
      cache.set(cacheKey, result ?? '', 86_400);
      return result;
    } catch { return null; }
  };

const gbifSearcher = (cache: CacheService): Searcher =>
  async (plantName) => {
    const cacheKey = `gbif_${plantName.toLowerCase().replace(/\s+/g, '_')}`;
    const cached = cache.get<string>(cacheKey);
    if (cached !== undefined) return cached;
    try {
      const data = await fetchJson(
        `https://api.gbif.org/v1/species/search?q=${encodeURIComponent(plantName)}&limit=5`,
      ) as { results?: { species: string; nubKey?: number }[] };
      const results = data.results ?? [];
      const bestName = findBestMatch(plantName, results.map((r) => r.species));
      const match = results.find((r) => r.species === bestName);
      const result = match?.nubKey ? `https://www.gbif.org/species/${match.nubKey}` : null;
      cache.set(cacheKey, result ?? '', 86_400);
      return result;
    } catch { return null; }
  };

const rhsSearcher = (cache: CacheService): Searcher =>
  async (plantName) => {
    const cacheKey = `rhs_${plantName.toLowerCase().replace(/\s+/g, '_')}`;
    const cached = cache.get<string>(cacheKey);
    if (cached !== undefined) return cached;
    try {
      const data = await fetchJson(
        'https://lwapp-uks-prod-psearch-01.azurewebsites.net/api/v1/plants/search/advanced',
        { method: 'POST', data: { startFrom: 0, pageSize: 20, keywords: plantName, includeAggregation: true } },
      ) as { hits?: { id: string; botanicalName: string }[] };
      const hits = (data.hits ?? []).map((h) => ({ id: h.id, name: h.botanicalName.replace(/<[^>]+>/g, '').trim() }));
      const bestName = findBestMatch(plantName, hits.map((h) => h.name));
      const best = hits.find((h) => h.name === bestName);
      const result = best
        ? `https://www.rhs.org.uk/plants/${best.id}/${best.name.replace(/ /g, '-').toLowerCase()}/details`
        : null;
      cache.set(cacheKey, result ?? '', 86_400);
      return result;
    } catch { return null; }
  };

// ── Registry factory ──────────────────────────────────────────────────────────

export const createPlantLinkSearchers = (cache: CacheService): Searcher[] => [
  htmlSearcher({ key: 'jungleLeaves', baseUrl: 'https://www.jungle-leaves.de', cache,
    searchUrl: (q) => `https://www.jungle-leaves.de/?s=${q}`,
    selector: 'article a', filter: (h) => !h.includes('author') }),
  htmlSearcher({ key: 'harmonyPlants', baseUrl: 'https://www.harmony-plants.com', cache,
    searchUrl: (q) => `https://www.harmony-plants.com/search?type=product&q=${q}`,
    selector: '.card-information__text' }),
  htmlSearcher({ key: 'foliageDreams', baseUrl: 'https://www.foliagedreams.com', cache,
    searchUrl: (q) => `https://www.foliagedreams.com/search?q=${q}`,
    selector: '.grid-product__link' }),
  htmlSearcher({ key: 'whiteLeafPlants', baseUrl: 'https://www.whiteleafplants.com', cache,
    searchUrl: (q) => `https://www.whiteleafplants.com/search?q=${q}`,
    selector: '.card-title', filter: (h) => !h.includes('author') }),
  wikipediaSearcher(cache),
  gbifSearcher(cache),
  rhsSearcher(cache),
];
