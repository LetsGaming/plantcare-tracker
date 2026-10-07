import type { FetchOptions, SalesSource } from '../../domain/SalesSource';
import type { RawSaleItem } from '../../domain/Sale';
import type {
  SourceHealthReporter,
  StrategyName,
} from '../../../../core/scrapeHealth/SourceHealth';
import type { CacheService } from '../../../../core/cache/CacheService';
import { fetchDocument, type FetchedDocument } from '../HttpFetcher';
import { buildPageUrl } from '../scrapeHelpers';
import { createModuleLogger } from '../../../../core/logging';
import { HeuristicStrategy } from './strategies/HeuristicStrategy';
import { JsonLdStrategy } from './strategies/JsonLdStrategy';
import { SelectorStrategy } from './strategies/SelectorStrategy';
import { ShopifyJsonStrategy } from './strategies/ShopifyJsonStrategy';
import type { ExtractionStrategy, ScraperConfig, StrategyContext } from './types';

export type { ScraperConfig, ScraperSelectors } from './types';

const STRATEGY_REGISTRY: Record<StrategyName, ExtractionStrategy> = {
  shopifyJson: new ShopifyJsonStrategy(),
  jsonLd: new JsonLdStrategy(),
  selector: new SelectorStrategy(),
  heuristic: new HeuristicStrategy(),
};

const DEFAULT_SHOPIFY_STRATEGIES: StrategyName[] = ['shopifyJson', 'selector', 'heuristic'];
const DEFAULT_HTML_STRATEGIES: StrategyName[] = ['selector', 'jsonLd', 'heuristic'];

/** Share of items that must carry link, name and a real discount. */
const MIN_COMPLETENESS = 0.8;

const SHOPIFY_MARKERS = /cdn\.shopify\.com|Shopify\.theme|\/cdn\/shop\//i;
const SHOPIFY_COLLECTION_PATH = /^(.*\/collections\/[^/]+)/;

const isComplete = (item: RawSaleItem): boolean =>
  Boolean(item.link && item.name) &&
  typeof item.newPrice === 'number' &&
  typeof item.oldPrice === 'number' &&
  item.newPrice < item.oldPrice;

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export abstract class BaseScraper implements SalesSource {
  public readonly key: string;
  public readonly seller: string;
  public readonly priority: number;
  public readonly maxPages: number;
  public readonly useChromium: boolean;

  protected readonly baseUrl: string;
  protected readonly strategies: ExtractionStrategy[];
  protected readonly log;

  constructor(
    protected readonly config: ScraperConfig,
    protected readonly cache: CacheService,
    protected readonly health?: SourceHealthReporter,
  ) {
    this.key = config.key;
    this.seller = config.seller;
    this.baseUrl = config.baseUrl;
    this.priority = config.priority ?? 99;
    this.maxPages = config.maxPages ?? 1;
    this.useChromium = config.useChromium ?? false;
    this.log = createModuleLogger(`Scraper:${this.key}`);

    const names =
      config.strategies ??
      (config.shopifyCollectionUrl ? DEFAULT_SHOPIFY_STRATEGIES : DEFAULT_HTML_STRATEGIES);
    this.strategies = names
      .map((name) => STRATEGY_REGISTRY[name])
      .filter((strategy) => strategy.isApplicable(config));
  }

  async fetchPage(page: number, options: FetchOptions = {}): Promise<RawSaleItem[]> {
    const cacheKey = `${this.key}_${page}`;
    if (!options.bypassCache) {
      const cached = this.cache.get<RawSaleItem[]>(cacheKey);
      if (cached !== undefined) return cached;
    }

    const pageUrl = buildPageUrl(
      this.baseUrl,
      page,
      this.config.pagePattern,
      this.config.urlTemplate,
    );
    let document: Promise<FetchedDocument | null> | undefined;
    const ctx: StrategyContext = {
      config: this.config,
      page,
      pageUrl,
      loadHtml: () => (document ??= fetchDocument(pageUrl, this.useChromium)),
    };

    const failures: string[] = [];
    let accepted: ExtractionStrategy | null = null;
    let items: RawSaleItem[] = [];

    for (const strategy of this.strategies) {
      const result = await this.attempt(strategy, ctx);
      if (result.items) {
        accepted = strategy;
        items = result.items;
        break;
      }
      failures.push(`${strategy.name}: ${result.reason}`);
    }

    if (!accepted) {
      const detected = await this.attemptShopifyDetection(ctx, failures);
      if (detected) {
        accepted = detected.strategy;
        items = detected.items;
      }
    }

    if (accepted && accepted !== this.strategies[0]) {
      this.log.warn(`Page ${page} served by fallback "${accepted.name}"`, {
        failures,
      });
    } else if (!accepted) {
      this.log.error(`Page ${page}: every strategy failed`, { failures });
    }

    if (page === 1) this.report(accepted, items.length, failures);
    if (items.length > 0) this.cache.set(cacheKey, items);
    return items;
  }

  private async attempt(
    strategy: ExtractionStrategy,
    ctx: StrategyContext,
  ): Promise<{ items: RawSaleItem[] } | { items: null; reason: string }> {
    try {
      const items = await strategy.extract(ctx);
      const rejection = this.validate(strategy, items, ctx.page);
      return rejection ? { items: null, reason: rejection } : { items };
    } catch (err: unknown) {
      return { items: null, reason: errorMessage(err) };
    }
  }

  private validate(
    strategy: ExtractionStrategy,
    items: RawSaleItem[],
    page: number,
  ): string | null {
    if (items.length === 0) {
      // Later pages legitimately run out of items, and structured feeds
      // can be trusted when they report an empty sale.
      return page > 1 || strategy.authoritative ? null : 'no items found';
    }
    const complete = items.filter(isComplete).length / items.length;
    return complete < MIN_COMPLETENESS
      ? `only ${Math.round(complete * 100)}% of items are complete`
      : null;
  }

  /**
   * When every configured strategy fails on a storefront that turns out to be
   * Shopify (for example after a platform migration), the JSON feed of the
   * collection page it redirected to is tried.
   */
  private async attemptShopifyDetection(
    ctx: StrategyContext,
    failures: string[],
  ): Promise<{ strategy: ExtractionStrategy; items: RawSaleItem[] } | null> {
    const shopify = STRATEGY_REGISTRY.shopifyJson;
    if (this.strategies.includes(shopify)) return null;

    const doc = await ctx.loadHtml().catch(() => null);
    if (!doc || !SHOPIFY_MARKERS.test(doc.html)) return null;

    const url = new URL(doc.finalUrl);
    const collection = url.pathname.match(SHOPIFY_COLLECTION_PATH)?.[1];
    if (!collection) return null;

    const result = await this.attempt(shopify, {
      ...ctx,
      shopifyCollectionUrl: `${url.origin}${collection}`,
    });
    if (!result.items) {
      failures.push(`${shopify.name}: ${result.reason}`);
      return null;
    }
    return { strategy: shopify, items: result.items };
  }

  private report(accepted: ExtractionStrategy | null, itemCount: number, failures: string[]): void {
    this.health?.record({
      key: this.key,
      seller: this.seller,
      kind: 'sales',
      strategy: accepted?.name ?? null,
      usedFallback: accepted !== null && accepted !== this.strategies[0],
      itemCount,
      error: failures.length > 0 ? failures.join('; ') : null,
    });
  }
}
