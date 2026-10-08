import type { CacheService } from '../core/cache/CacheService';
import type { SourceHealthTracker } from '../core/scrapeHealth';
import type { RawSaleItem } from '../modules/sales/domain/Sale';
import type { SalesSource } from '../modules/sales/domain/SalesSource';
import type { PlantGuideStreamer, PlantLinkSearcher } from '../modules/moreInfo/domain/PlantInfo';
import type { MoreInfoRouterDeps } from '../modules/moreInfo/presentation/moreInfoRoutes';

const SHOP_PLANTS = [
  'Monstera deliciosa Albo',
  'Philodendron Pink Princess',
  'Alocasia Zebrina',
  'Hoya kerrii',
  'Calathea Orbifolia',
  'Ficus Elastica Tineke',
  'Anthurium Clarinervium',
  'Syngonium Neon Robusta',
  'Scindapsus Treubii Moonlight',
  'Pilea Peperomioides',
  'Begonia Maculata',
  'Peperomia Hope',
];

const COLORS = ['#2e7d32', '#558b2f', '#00796b', '#33691e', '#1b5e20'];

const leafImage = (index: number, label: string): string => {
  const color = COLORS[index % COLORS.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">` +
    `<rect width="400" height="400" fill="${color}"/>` +
    `<text x="200" y="215" font-size="120" text-anchor="middle" fill="#ffffff">${label.charAt(0)}</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};

/** Every fetch lowers the price of some items a little, so repeated refreshes build a price history. */
const catalogue = (seller: string, offset: number, fetches: number): RawSaleItem[] =>
  SHOP_PLANTS.map((name, index) => {
    const base = 12 + ((index * 7 + offset) % 40);
    const discounted = index % 3 === 0;
    const drift = discounted ? Math.min(fetches, 4) * 0.05 : 0;
    return {
      name: `${name} (${seller})`,
      link: `https://${seller.toLowerCase().replace(/\s+/g, '-')}.example/products/${index + 1}`,
      img: leafImage(index + offset, name),
      oldPrice: Math.round(base * 1.4 * 100) / 100,
      newPrice: Math.round(base * (1 - drift) * 100) / 100,
    };
  });

const source = (
  key: string,
  seller: string,
  tracker: SourceHealthTracker,
  behaviour: 'ok' | 'degraded' | 'failing',
  offset: number,
): SalesSource => {
  let fetches = 0;
  return {
    key,
    seller,
    priority: offset,
    maxPages: behaviour === 'ok' ? 2 : 1,
    useChromium: false,
    fetchPage: async (page) => {
      if (behaviour === 'failing') {
        tracker.record({
          key,
          seller,
          kind: 'sales',
          strategy: null,
          usedFallback: false,
          itemCount: 0,
          error: 'No strategy produced usable data (mock source)',
        });
        throw new Error('Mock source is configured to fail');
      }
      if (page === 1) fetches += 1;
      const items = catalogue(seller, offset, fetches);
      const half = Math.ceil(items.length / 2);
      const slice = behaviour === 'ok' ? items.slice((page - 1) * half, page * half) : items;
      tracker.record({
        key,
        seller,
        kind: 'sales',
        strategy: behaviour === 'degraded' ? 'selector' : 'shopifyJson',
        usedFallback: behaviour === 'degraded',
        itemCount: slice.length,
      });
      return slice;
    },
  };
};

export const createMockSalesSources = (
  _cache: CacheService,
  tracker: SourceHealthTracker,
): SalesSource[] => [
  source('mockLeafy', 'Leafy Rarities', tracker, 'ok', 1),
  source('mockJungle', 'Jungle Corner', tracker, 'degraded', 5),
  source('mockBroken', 'Broken Botanics', tracker, 'failing', 9),
];

const GUIDES: Record<string, string[]> = {
  en: [
    '## Light\n',
    'Bright, indirect light suits most aroids. ',
    'Avoid direct midday sun.\n\n',
    '## Watering\n',
    'Water when the top 3 cm of the substrate are dry. ',
    'Use less in winter.\n\n',
    '## Substrate\n',
    'A chunky, well-draining mix with bark and perlite.\n\n',
    '## Common problems\n',
    '- Yellow leaves usually mean too much water.\n',
    '- Brown tips point to dry air.\n',
  ],
  de: [
    '## Licht\n',
    'Die meisten Aronstabgewächse mögen helles, indirektes Licht. ',
    'Direkte Mittagssonne vermeiden.\n\n',
    '## Gießen\n',
    'Gießen, wenn die obersten 3 cm des Substrats trocken sind. ',
    'Im Winter weniger.\n\n',
    '## Substrat\n',
    'Eine grobe, gut drainierende Mischung mit Rinde und Perlit.\n',
  ],
};

const STREAM_DELAY_MS = 150;
const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A plant name containing "fail" ends its stream with an error after the first chunk. */
const guideStreamer: PlantGuideStreamer = {
  async streamPlantCare(plantName, _htmlFormatting, onChunk, language = 'en') {
    const chunks = GUIDES[language.slice(0, 2)] ?? GUIDES.en;
    for (const [index, chunk] of chunks.entries()) {
      await pause(STREAM_DELAY_MS);
      if (index === 1 && /fail/i.test(plantName)) throw new Error('Mock guide failure');
      await onChunk(chunk);
    }
  },
};

const linkSearchers: PlantLinkSearcher[] = [
  async (name) => `https://wiki.example/${encodeURIComponent(name)}`,
  async (name) =>
    /unknown/i.test(name) ? null : `https://plants.example/care/${encodeURIComponent(name)}`,
];

export const createMockMoreInfo = (): MoreInfoRouterDeps => ({ guideStreamer, linkSearchers });
