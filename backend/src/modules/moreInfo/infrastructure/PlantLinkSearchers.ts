/**
 * modules/moreInfo/infrastructure/PlantLinkSearchers.ts
 *
 * Ported from V1's plantSources.js + searchFactory.js.
 * Each searcher fetches and scores links for a given plant name.
 */

import { parse } from 'node-html-parser';
import axios from 'axios';
import type { CacheService } from '../../../core/cache/CacheService';
import type { PlantLinkSearcher } from '../domain/PlantInfo';
import type { SourceHealthReporter, StrategyName } from '../../../core/scrapeHealth';
import { createModuleLogger } from '../../../core/logging';

const log = createModuleLogger('PlantLinkSearchers');

// ── Relevance scoring ─────────────────────────────────────────────────────────

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/);

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
    (best, link) => {
      const s = score(query, link);
      return s > best.score ? { link, score: s } : best;
    },
    { link: null, score: 0 },
  ).link;

// ── HTTP helpers ──────────────────────────────────────────────────────────────

const fetchJson = async (
  url: string,
  options?: { method?: string; data?: unknown },
): Promise<unknown> => {
  const res = await axios({
    url,
    method: options?.method ?? 'GET',
    data: options?.data,
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
// Alias of the domain port — kept local for brevity in the builders below.

type Searcher = PlantLinkSearcher;

// ── Shop searchers ────────────────────────────────────────────────────────────

interface ShopSearchConfig {
  key: string;
  seller: string;
  baseUrl: string;
  searchUrl: (q: string) => string;
  selector: string;
  filter?: (href: string) => boolean;
  cache: CacheService;
  health?: SourceHealthReporter;
}

/** Candidate links from the shop's search results page. */
const htmlSearchLinks = async (config: ShopSearchConfig, plantName: string): Promise<string[]> => {
  const root = parse(await fetchHtml(config.searchUrl(encodeURIComponent(plantName))));
  const hrefs = root
    .querySelectorAll(config.selector)
    .map((a) => a.getAttribute('href'))
    .filter((href): href is string => !!href && (!config.filter || config.filter(href)));
  return [...new Set(hrefs)].map((href) => resolveLink(href, config.baseUrl)!);
};

interface SuggestResponse {
  resources?: { results?: { products?: { handle: string }[] } };
}

/**
 * Shopify's predictive search endpoint. Returns null when the response does
 * not have the expected shape, which is how a changed storefront shows up.
 */
const suggestSearchLinks = async (
  config: ShopSearchConfig,
  plantName: string,
): Promise<string[] | null> => {
  const origin = new URL(config.baseUrl).origin;
  const data = (await fetchJson(
    `${origin}/search/suggest.json?q=${encodeURIComponent(plantName)}&resources[type]=product&resources[limit]=10`,
  )) as SuggestResponse | null;
  const products = data?.resources?.results?.products;
  if (!Array.isArray(products)) return null;
  return products.map((p) => `${origin}/products/${p.handle}`);
};

/**
 * Tries the structured Shopify search first and the shop's HTML search page
 * second. Outcomes are reported as source health; a plain zero-result query
 * from the HTML page carries no signal (it could be a broken selector or a
 * missing plant) and is not reported.
 */
const shopSearcher =
  (config: ShopSearchConfig): Searcher =>
  async (plantName) => {
    const cacheKey = `${config.key}_${plantName.toLowerCase().replace(/\s+/g, '_')}`;
    const cached = config.cache.get<string>(cacheKey);
    if (cached !== undefined) return cached;

    const attempts: { strategy: StrategyName; find: () => Promise<string[] | null> }[] = [
      { strategy: 'shopifyJson', find: () => suggestSearchLinks(config, plantName) },
      { strategy: 'selector', find: () => htmlSearchLinks(config, plantName) },
    ];
    const healthKey = `search:${config.key}`;
    const failures: string[] = [];

    for (const [index, { strategy, find }] of attempts.entries()) {
      try {
        const links = await find();
        if (links === null) {
          failures.push(`${strategy}: unexpected response structure`);
          continue;
        }
        if (links.length === 0 && strategy !== 'shopifyJson') continue;

        const result = findBestMatch(plantName, links);
        config.cache.set(cacheKey, result ?? '', 86_400);
        config.health?.record({
          key: healthKey,
          seller: config.seller,
          kind: 'search',
          strategy,
          usedFallback: index > 0,
          itemCount: links.length,
          error: failures.join('; ') || null,
          issues: [],
        });
        return result;
      } catch (err: unknown) {
        failures.push(`${strategy}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (failures.length === attempts.length) {
      log.warn(`[${config.key}] search failed`, { failures });
      config.health?.record({
        key: healthKey,
        seller: config.seller,
        kind: 'search',
        strategy: null,
        usedFallback: false,
        itemCount: 0,
        error: failures.join('; '),
        issues: [],
      });
    }
    return null;
  };

// ── API-based searchers ───────────────────────────────────────────────────────

const wikipediaSearcher =
  (cache: CacheService): Searcher =>
  async (plantName) => {
    const cacheKey = `wikipedia_${plantName.toLowerCase().replace(/\s+/g, '_')}`;
    const cached = cache.get<string>(cacheKey);
    if (cached !== undefined) return cached;
    try {
      const data = (await fetchJson(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(plantName)}&format=json`,
      )) as { query?: { search?: { title: string }[] } };
      const links = (data.query?.search ?? []).map(
        (r) => `https://en.wikipedia.org/wiki/${r.title.replace(/ /g, '_')}`,
      );
      const result = findBestMatch(plantName, links);
      cache.set(cacheKey, result ?? '', 86_400);
      return result;
    } catch {
      return null;
    }
  };

const gbifSearcher =
  (cache: CacheService): Searcher =>
  async (plantName) => {
    const cacheKey = `gbif_${plantName.toLowerCase().replace(/\s+/g, '_')}`;
    const cached = cache.get<string>(cacheKey);
    if (cached !== undefined) return cached;
    try {
      const data = (await fetchJson(
        `https://api.gbif.org/v1/species/search?q=${encodeURIComponent(plantName)}&limit=5`,
      )) as { results?: { species: string; nubKey?: number }[] };
      const results = data.results ?? [];
      const bestName = findBestMatch(
        plantName,
        results.map((r) => r.species),
      );
      const match = results.find((r) => r.species === bestName);
      const result = match?.nubKey ? `https://www.gbif.org/species/${match.nubKey}` : null;
      cache.set(cacheKey, result ?? '', 86_400);
      return result;
    } catch {
      return null;
    }
  };

const rhsSearcher =
  (cache: CacheService): Searcher =>
  async (plantName) => {
    const cacheKey = `rhs_${plantName.toLowerCase().replace(/\s+/g, '_')}`;
    const cached = cache.get<string>(cacheKey);
    if (cached !== undefined) return cached;
    try {
      const data = (await fetchJson(
        'https://lwapp-uks-prod-psearch-01.azurewebsites.net/api/v1/plants/search/advanced',
        {
          method: 'POST',
          data: { startFrom: 0, pageSize: 20, keywords: plantName, includeAggregation: true },
        },
      )) as { hits?: { id: string; botanicalName: string }[] };
      const hits = (data.hits ?? []).map((h) => ({
        id: h.id,
        name: h.botanicalName.replace(/<[^>]+>/g, '').trim(),
      }));
      const bestName = findBestMatch(
        plantName,
        hits.map((h) => h.name),
      );
      const best = hits.find((h) => h.name === bestName);
      const result = best
        ? `https://www.rhs.org.uk/plants/${best.id}/${best.name.replace(/ /g, '-').toLowerCase()}/details`
        : null;
      cache.set(cacheKey, result ?? '', 86_400);
      return result;
    } catch {
      return null;
    }
  };

// ── Registry factory ──────────────────────────────────────────────────────────

export const createPlantLinkSearchers = (
  cache: CacheService,
  health?: SourceHealthReporter,
): Searcher[] => [
  shopSearcher({
    key: 'jungleLeaves',
    seller: 'Jungle Leaves',
    baseUrl: 'https://www.jungle-leaves.de',
    cache,
    health,
    searchUrl: (q) => `https://www.jungle-leaves.de/search?type=product&q=${q}`,
    selector: 'product-card a.product-card-title',
  }),
  shopSearcher({
    key: 'harmonyPlants',
    seller: 'Harmony Plants',
    baseUrl: 'https://www.harmony-plants.com',
    cache,
    health,
    searchUrl: (q) => `https://www.harmony-plants.com/search?type=product&q=${q}`,
    selector: '.card-information__text',
  }),
  shopSearcher({
    key: 'foliageDreams',
    seller: 'Foliage Dreams',
    baseUrl: 'https://www.foliagedreams.com',
    cache,
    health,
    searchUrl: (q) => `https://www.foliagedreams.com/search?q=${q}`,
    selector: '.grid-product__link',
  }),
  shopSearcher({
    key: 'whiteLeafPlants',
    seller: 'White Leaf Plants',
    baseUrl: 'https://www.whiteleafplants.com',
    cache,
    health,
    searchUrl: (q) => `https://www.whiteleafplants.com/search?q=${q}`,
    selector: '.card-title',
    filter: (h) => !h.includes('author'),
  }),
  wikipediaSearcher(cache),
  gbifSearcher(cache),
  rhsSearcher(cache),
];
