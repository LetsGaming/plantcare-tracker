import { parse, type HTMLElement } from "node-html-parser";
import type { SalesSource } from "../../domain/SalesSource";
import type { RawSaleItem } from "../../domain/Sale";
import type { CacheService } from "../../../../core/cache/CacheService";
import { fetchHtml } from "../HttpFetcher";
import {
  parsePrice,
  commercialRound,
  getText,
  resolveLink,
  buildPageUrl,
} from "../scrapeHelpers";
import { createModuleLogger } from "../../../../core/logging";

// ── Scraper config types ──────────────────────────────────────────────────────

export interface ScraperSelectors {
  container: string;
  oldPrice: string;
  newPrice: string;
  link: string;
  name: string;
  img: string;
  outOfStock?: string;
  nameAttr?: string;
}

export interface ScraperConfig {
  key: string;
  seller: string;
  baseUrl: string;
  priority?: number;
  maxPages?: number;
  useChromium?: boolean;
  pagePattern?: string;
  urlTemplate?: string;
  selectors?: ScraperSelectors;
  parseFn?: (root: HTMLElement) => (RawSaleItem | null)[];
}

// ── Base class ────────────────────────────────────────────────────────────────

export abstract class BaseScraper implements SalesSource {
  public readonly key: string;
  public readonly seller: string;
  public readonly priority: number;
  public readonly maxPages: number;
  public readonly useChromium: boolean;

  protected readonly baseUrl: string;
  protected readonly pagePattern?: string;
  protected readonly urlTemplate?: string;
  protected readonly selectors?: ScraperSelectors;
  protected readonly customParseFn?: (
    root: HTMLElement,
  ) => (RawSaleItem | null)[];
  protected readonly log;

  constructor(
    protected readonly config: ScraperConfig,
    protected readonly cache: CacheService,
  ) {
    this.key = config.key;
    this.seller = config.seller;
    this.baseUrl = config.baseUrl;
    this.priority = config.priority ?? 99;
    this.maxPages = config.maxPages ?? 1;
    this.useChromium = config.useChromium ?? false;
    this.pagePattern = config.pagePattern;
    this.urlTemplate = config.urlTemplate;
    this.selectors = config.selectors;
    this.customParseFn = config.parseFn;
    this.log = createModuleLogger(`Scraper:${this.key}`);
  }

  async fetchPage(page: number): Promise<RawSaleItem[]> {
    const url = buildPageUrl(
      this.baseUrl,
      page,
      this.pagePattern,
      this.urlTemplate,
    );
    const cacheKey = `${this.key}_${page}`;

    // Cache check
    const cached = this.cache.get<RawSaleItem[]>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const html = await fetchHtml(url, this.useChromium);
    if (!html) {
      this.log.warn(`No HTML returned for page ${page}`, { host: (() => { try { return new URL(url).hostname; } catch { return url; } })() });
      return [];
    }

    let items: RawSaleItem[];
    try {
      const root = parse(html);
      const raw = this.customParseFn
        ? this.customParseFn(root)
        : this.defaultParseFn(root);
      items = raw.filter((item): item is RawSaleItem => item !== null);
    } catch (err: unknown) {
      this.log.error(`Parse failed for page ${page}`, { err });
      return [];
    }

    // Cache set (only non-empty results)
    if (items.length > 0) {
      this.cache.set(cacheKey, items);
    }
    return items;
  }

  // ── Default parse logic (from V1 scraperFactory.js) ──────────────────────

  private defaultParseFn(root: HTMLElement): (RawSaleItem | null)[] {
    const sel = this.selectors;
    if (!sel) {
      this.log.warn(
        "No selectors and no custom parseFn defined — returning empty",
      );
      return [];
    }

    return root.querySelectorAll(sel.container).map((item) => {
      if (sel.outOfStock && item.querySelector(sel.outOfStock)) return null;

      const oldPrice = commercialRound(
        parsePrice(item.querySelector(sel.oldPrice)),
      );
      const newPrice = commercialRound(
        parsePrice(item.querySelector(sel.newPrice)),
      );

      if (!newPrice || !oldPrice || newPrice >= oldPrice) return null;

      const linkElem = item.querySelector(sel.link);
      const name = sel.nameAttr
        ? item.querySelector(sel.name)?.getAttribute(sel.nameAttr)
        : getText(item, sel.name);

      const imgElem = item.querySelector(sel.img);
      let imgRaw =
        imgElem?.getAttribute("src") ||
        imgElem?.getAttribute("srcset") ||
        imgElem?.getAttribute("data-src") ||
        imgElem?.getAttribute("data-srcset");

      let img: string | undefined;

      if (imgRaw) {
        // Pick the first entry in case of space or comma-delimited src/srcset values
        const firstEntry = imgRaw.trim().split(",")[0].trim().split(" ")[0];

        // Extract raw image URL if nested within a Cloudflare image optimizer proxy path (/cdn-cgi/image/.../https://...)
        const directUrlMatch = firstEntry.match(/https?:\/\/[^\s]+/);
        if (directUrlMatch) {
          img = directUrlMatch[0];
        } else {
          // Fallback to link resolution if it's a standard path
          img = resolveLink(firstEntry, this.baseUrl) || "";
        }
      }

      return {
        name: name?.trim() ?? "Unnamed Plant",
        link: resolveLink(linkElem?.getAttribute("href"), this.baseUrl),
        img: img ?? null,
        oldPrice,
        newPrice,
      };
    });
  }
}