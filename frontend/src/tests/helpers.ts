import type { Store } from "pinia";
import { vi } from "vitest";

/** In-memory stand-in for the Ionic storage backing StorageService. */
export const memoryStore = new Map<string, unknown>();

export const storageModule = () => ({
  default: {
    get: vi.fn(async (key: string) => memoryStore.get(key) ?? null),
    // Cloned like IndexedDB does, so a reactive proxy left in a value fails here too.
    set: vi.fn(async (key: string, value: unknown) => {
      memoryStore.set(key, structuredClone(value));
    }),
    remove: vi.fn(async (key: string) => {
      memoryStore.delete(key);
    }),
    clear: vi.fn(async () => {
      for (const [key, value] of [...memoryStore]) {
        if (!(value as { keepOnClear?: boolean } | null)?.keepOnClear) memoryStore.delete(key);
      }
    }),
    clearAll: vi.fn(async () => {
      memoryStore.clear();
    }),
  },
});

export const toast = {
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
  addToast: vi.fn(),
};

export const toastModule = () => ({ default: toast });

export const localizationModule = () => ({
  default: {
    t: (key: string, _vars?: unknown, fallback?: string) => fallback ?? key,
    getLocale: () => "en",
    locale: { value: "en" },
  },
});

export const jsonResponse = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** The body of a list endpoint: `{ data: { items, next_cursor, total? } }`. */
export const envelope = <T>(items: T[], nextCursor: string | null = null, total?: number) => ({
  data: {
    items,
    next_cursor: nextCursor,
    ...(total === undefined ? {} : { total }),
  },
});

/** A list endpoint response as `fetch` would resolve it. */
export const envelopeResponse = <T>(items: T[], nextCursor: string | null = null, total?: number) =>
  jsonResponse(200, envelope(items, nextCursor, total));

export const apiImageDto = (overrides: Partial<APIImageDTO> = {}): APIImageDTO => ({
  id: 10,
  url: "/uploads/plant-10.webp",
  srcset:
    "/uploads/plant-10-160.webp 160w, /uploads/plant-10-480.webp 480w, /uploads/plant-10.webp 1024w",
  width: 1024,
  height: 768,
  placeholder: "#4a7a3c",
  date: 1748779200,
  ...overrides,
});

export const apiWateringSummary = (
  overrides: Partial<APIWateringSummary> = {},
): APIWateringSummary => ({
  last_watered_at: null,
  last_fertilized_at: null,
  avg_interval_days: null,
  ...overrides,
});

export const apiPlantListItem = (overrides: Partial<APIPlantListItem> = {}): APIPlantListItem => ({
  plant_id: 7,
  plant_name: "Monstera Deliciosa",
  user_id: 42,
  is_public: false,
  created_at: 1726839000000,
  species_name: "Monstera deliciosa",
  substrate: { substrate_id: 5, substrate_name: "Aroid Mix" },
  cover: apiImageDto(),
  image_count: 1,
  watering: apiWateringSummary(),
  ...overrides,
});

export const apiPlantDetail = (overrides: Partial<APIPlantDetail> = {}): APIPlantDetail => ({
  ...apiPlantListItem(),
  images: [apiImageDto()],
  ...overrides,
});

export const apiSubstrateListItem = (
  overrides: Partial<APISubstrateListItem> = {},
): APISubstrateListItem => ({
  id: 5,
  name: "Aroid Mix",
  user_id: 99,
  is_public: true,
  created_at: 1736928000000,
  cover: null,
  component_count: 2,
  ...overrides,
});

export const apiSubstrateDetail = (
  overrides: Partial<APISubstrateDetail> = {},
): APISubstrateDetail => ({
  substrate_id: 5,
  substrate_user_id: 99,
  substrate_name: "Aroid Mix",
  is_public: true,
  substrate_created_at: 1736928000000,
  cover: null,
  images: [],
  components: [
    { component_id: 1, component_name: "Perlite", component_fineness: "Fine", component_parts: 3 },
    { component_id: 2, component_name: "Bark", component_fineness: "Coarse", component_parts: 2 },
  ],
  ...overrides,
});

export const apiComponentListItem = (
  overrides: Partial<APIComponentListItem> = {},
): APIComponentListItem => ({
  id: 1,
  name: "Perlite",
  fineness_id: 2,
  fineness_name: "Fine",
  cover: null,
  ...overrides,
});

export const apiWateringItem = (overrides: Partial<APIWateringItem> = {}): APIWateringItem => ({
  id: 11,
  plant_id: 7,
  date: 1740819600000,
  used_fertilizer: false,
  fertilizer_type_id: null,
  ...overrides,
});

export const apiSale = (overrides: Partial<APISale> = {}): APISale => ({
  sale_id: "abc-123",
  sale_name: "Monstera Deliciosa 20cm",
  sale_seller: "PlantShop",
  sale_link: "https://plantshop.de/monstera",
  sale_image_url: "https://cdn.example.com/sale.webp",
  sale_old_price: 19.99,
  sale_new_price: 14.99,
  sale_discount_pct: 25,
  sale_first_seen_at: 1741150800000,
  sale_scraped_at: 1741154400000,
  ...overrides,
});

/** Builds an unsigned JWT-shaped string; payload is encoded as UTF-8 base64url. */
export const fakeJwt = (payload: Record<string, unknown>): string => {
  const encode = (value: unknown) => {
    let binary = "";
    new TextEncoder().encode(JSON.stringify(value)).forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).split("+").join("-").split("/").join("_").split("=").join("");
  };
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
};

export const resetStore = () => {
  memoryStore.clear();
};

const installedStores = new Set<Store>();

/** A pinia with the app's plugins, installed on a throwaway app so the plugins run. */
export const createInstalledPinia = async () => {
  const [{ createApp }, { setActivePinia }, { createAppPinia }] = await Promise.all([
    import("vue"),
    import("pinia"),
    import("@/stores/pinia"),
  ]);
  const pinia = createAppPinia();
  pinia.use(({ store }) => {
    installedStores.add(store);
  });
  createApp({}).use(pinia);
  setActivePinia(pinia);
  return pinia;
};

/**
 * Drops the debounced storage writes (and the changes marked for them) still
 * pending on stores from `createInstalledPinia`. A test that ran on real
 * timers would otherwise write into `memoryStore` up to 250 ms later, in the
 * middle of a later test.
 */
export const cancelPendingPersistence = () => {
  for (const store of installedStores) store.$cancelPersist();
  installedStores.clear();
};
