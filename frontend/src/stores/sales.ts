/**
 * stores/sales.ts
 *
 * Plant sales streamed from the backend (SSE), the ids still flagged "new" and
 * a short price history per sale. Sales, new ids and history survive logout
 * (keepOnClear): they are not account data.
 *
 * A stream collects its sales outside the store and replaces `items` once,
 * when it completes, so a failed or aborted stream never leaves partial data
 * behind (or persists it as if it were complete). Only a store with nothing
 * to show publishes the running stream, at most every 250 ms, so the first
 * screen fills.
 */

import { defineStore } from "pinia";
import { markRaw } from "vue";
import ApiUtils from "@/utils/apiUtils";
import SaleMapper from "@/mapping/SaleMapping";
import { handleRequest } from "@/utils/requestFeedback";
import { coalesced, isStale, resourceState } from "./resource";
import { applySalesQuery, defaultSalesQuery, type SalesQuery } from "@/utils/salesQuery";
import { compareText } from "@/utils/intlCache";
import localizationService from "@/services/general/LocalizationService";

const ENDPOINT = "/sales";
const RESOURCE_KEY = "sales.title";
export const MAX_PRICE_POINTS = 30;
const PROGRESSIVE_COMMIT_MS = 250;

/** Storage key of the new ids, all the tab badge needs. */
export const SALES_NEW_KEY = "sales_new";
const LIST_KEYS = ["sales_data", "sales_price_history", "sales_query"] as const;
const STREAM_ACTIONS = ["load", "runStream"] as const;

export interface PricePoint {
  price: number;
  timestamp: number;
}

export type PriceHistory = Record<string, PricePoint[]>;

/** A sale as older releases stored it: with an `isNew` flag and without a search key. */
type StoredSale = Omit<Sale, "searchKey"> & { searchKey?: string; isNew?: boolean };

const NO_IDS: readonly string[] = Object.freeze([]);
const NO_POINTS = Object.freeze([]) as readonly PricePoint[] as PricePoint[];

const idSets = new WeakMap<readonly string[], Set<string>>();
const idSet = (ids: readonly string[]): Set<string> => {
  let set = idSets.get(ids);
  if (!set) {
    set = new Set(ids);
    idSets.set(ids, set);
  }
  return set;
};

const indexes = new WeakMap<readonly Sale[], Map<string, Sale>>();
const indexOf = (items: readonly Sale[]): Map<string, Sale> => {
  let index = indexes.get(items);
  if (!index) {
    index = new Map(items.map((sale) => [sale.id, sale]));
    indexes.set(items, index);
  }
  return index;
};

/** Sales are replaced wholesale and never edited, so neither they nor the list get proxies. */
const saleList = (sales: Iterable<Sale>): Sale[] => markRaw(Array.from(sales));

const restoreSale = (stored: StoredSale): Sale => {
  const sale = { ...stored };
  delete sale.isNew;
  return Object.freeze({
    ...sale,
    searchKey:
      sale.searchKey ?? SaleMapper.searchKeyOf(sale.nameFull ?? sale.name ?? "", sale.seller ?? ""),
  });
};

/**
 * The price history after a snapshot: a point is added where the price
 * changed, ids no longer listed are dropped, every id keeps at most
 * MAX_PRICE_POINTS points. Returns `prev` itself when nothing changed.
 */
export const nextHistory = (
  prev: PriceHistory,
  items: readonly Sale[],
  now: number,
): PriceHistory => {
  const next: PriceHistory = {};
  let changed = Object.keys(prev).length !== items.length;
  for (const sale of items) {
    const points = Object.hasOwn(prev, sale.id) ? prev[sale.id] : NO_POINTS;
    let kept = points.length > MAX_PRICE_POINTS ? points.slice(-MAX_PRICE_POINTS) : points;
    if (kept.at(-1)?.price !== sale.price) {
      kept = [...kept, { price: sale.price, timestamp: now }].slice(-MAX_PRICE_POINTS);
    }
    if (kept !== points) changed = true;
    next[sale.id] = kept;
  }
  return changed ? markRaw(next) : prev;
};

/**
 * New ids after a snapshot: those still new, plus those the previous list did
 * not have; ids no longer listed are dropped. Returns `prev` itself when the
 * set is unchanged.
 */
const nextNewIds = (
  prev: readonly string[],
  before: readonly Sale[],
  after: readonly Sale[],
): readonly string[] => {
  const known = indexOf(before);
  const pending = idSet(prev);
  const next = after
    .filter((sale) => pending.has(sale.id) || !known.has(sale.id))
    .map((sale) => sale.id);
  const unchanged = next.length === prev.length && next.every((id) => pending.has(id));
  return unchanged ? prev : Object.freeze(next);
};

export const useSalesStore = defineStore("sales", {
  state: () => ({
    items: saleList([]),
    streaming: false,
    priceHistory: markRaw({}) as PriceHistory,
    /** Ids of listed sales the user has not opened since they appeared. */
    newIds: NO_IDS,
    /** How the list is ordered and narrowed; a browser preference, not account data. */
    query: defaultSalesQuery(),
    /** Every persisted entry was read (or tried) since the store was created or reset. */
    restored: false,
    /** `isNew` flags found in a stored list of an older release, adopted by `restore`. */
    legacyNewIds: null as string[] | null,
    ...resourceState(),
  }),

  persist: {
    entries: [
      {
        key: SALES_NEW_KEY,
        keepOnClear: true,
        allowExpired: true,
        dirtyOn: [...STREAM_ACTIONS, "restore", "markSeen", "markAllSeen"],
        version: (state) => state.newIds,
        pick: (state) => ({ ids: state.newIds }),
        apply: (state, data: { ids?: string[] }) => {
          state.newIds = Object.freeze([...(data.ids ?? [])]);
        },
      },
      {
        key: "sales_data",
        keepOnClear: true,
        allowExpired: true,
        dirtyOn: [...STREAM_ACTIONS, "restore"],
        version: (state) => state.items,
        pick: (state) => state.items,
        timestamp: (state) => state.fetchedAt,
        apply: (state, data: StoredSale[], timestamp) => {
          const flagged = data.some((sale) => "isNew" in sale);
          state.legacyNewIds = flagged
            ? data.filter((sale) => sale.isNew === true).map((sale) => sale.id)
            : null;
          state.items = saleList(data.map(restoreSale));
          state.fetchedAt = timestamp;
          state.status = "ready";
        },
      },
      {
        key: "sales_price_history",
        keepOnClear: true,
        allowExpired: true,
        dirtyOn: STREAM_ACTIONS,
        version: (state) => state.priceHistory,
        // Stored as a list of { id, points }, the shape older releases wrote.
        pick: (state) => Object.entries(state.priceHistory).map(([id, points]) => ({ id, points })),
        apply: (state, data: { id: string; points: PricePoint[] }[]) => {
          state.priceHistory = markRaw(
            Object.fromEntries(data.map((entry) => [entry.id, entry.points])),
          );
        },
      },
      {
        key: "sales_query",
        keepOnClear: true,
        allowExpired: true,
        dirtyOn: ["setQuery", "resetQuery"],
        version: (state) => state.query,
        pick: (state) => state.query,
        apply: (state, data: Partial<SalesQuery>) => {
          state.query = { ...defaultSalesQuery(), ...data };
        },
      },
    ],
  },

  getters: {
    isStale: (state): boolean => isStale(state.fetchedAt),
    isNew: (state): ((id: string) => boolean) => {
      const ids = idSet(state.newIds);
      return (id) => ids.has(id);
    },
    /** Sales after the user's filters, in the user's order. */
    filteredSales(): Sale[] {
      return applySalesQuery(this.items, this.query, {
        locale: localizationService.getLocale(),
        isNew: this.isNew,
      });
    },
    sellers(): string[] {
      return [...new Set(this.items.map((sale) => sale.seller))].sort(
        compareText(localizationService.getLocale()),
      );
    },
    newCount: (state): number => state.newIds.length,
    byId: (state): ((id: string) => Sale | undefined) => {
      const index = indexOf(state.items);
      return (id) => index.get(id);
    },
    historyOf:
      (state) =>
      (id: string): PricePoint[] =>
        Object.hasOwn(state.priceHistory, id) ? state.priceHistory[id] : NO_POINTS,
  },

  actions: {
    /** Loads the stored sales into memory without touching the network; concurrent callers share one read. */
    restore(): Promise<void> {
      if (this.restored) return Promise.resolve();
      return coalesced(this, "restore", async () => {
        // The badge may already be reading the new ids; joining that read keeps it from
        // landing after (and over) the adoption of legacy flags below.
        await Promise.all([this.$hydrate([SALES_NEW_KEY]), this.$hydrate(LIST_KEYS)]);
        if (this.legacyNewIds) {
          const listed = indexOf(this.items);
          const adopted = this.legacyNewIds.filter((id) => listed.has(id));
          this.newIds = Object.freeze([...new Set([...this.newIds, ...adopted])]);
          // A new list reference rewrites the stored list without the old flags.
          this.items = saleList(this.items);
          this.legacyNewIds = null;
        }
        this.restored = true;
      });
    },

    /** Streams the sales unless fresh ones are in memory; concurrent callers share one stream. */
    load({ force = false }: { force?: boolean } = {}): Promise<void> {
      if (!force && this.status === "ready" && !this.isStale) return Promise.resolve();
      return coalesced(this, "stream", async () => {
        await this.restore();
        if (!force && this.status === "ready" && !this.isStale) return;
        await handleRequest(this.runStream(), RESOURCE_KEY);
      });
    },

    runStream(): Promise<void> {
      const before = this.items;
      const received = new Map<string, Sale>();
      const progressive = before.length === 0;
      let lastPublish = Number.NEGATIVE_INFINITY;
      let pending: ReturnType<typeof setTimeout> | undefined;
      this.streaming = true;

      const publish = () => {
        pending = undefined;
        lastPublish = Date.now();
        this.items = saleList(received.values());
      };
      const publishSoon = () => {
        if (!progressive || pending !== undefined) return;
        const wait = lastPublish + PROGRESSIVE_COMMIT_MS - Date.now();
        if (wait <= 0) publish();
        else pending = setTimeout(publish, wait);
      };
      const stopPublishing = () => {
        if (pending !== undefined) clearTimeout(pending);
        pending = undefined;
      };

      return new Promise<void>((resolve, reject) => {
        let stop: (() => void) | null = null;
        const fail = (error: unknown) => {
          stop?.();
          stopPublishing();
          this.items = before;
          this.streaming = false;
          reject(error);
        };

        void ApiUtils.stream<unknown>(
          ENDPOINT,
          (event) => {
            try {
              let added = false;
              for (const sale of SaleMapper.convertToSales(event.data as APISale[])) {
                if (received.has(sale.id)) continue;
                received.set(sale.id, Object.freeze(sale));
                added = true;
              }
              if (added) publishSoon();
            } catch (error) {
              fail(error);
            }
          },
          fail,
          () => {
            stop?.();
            stopPublishing();
            const items = saleList(received.values());
            const now = Date.now();
            this.priceHistory = nextHistory(this.priceHistory, items, now);
            this.newIds = nextNewIds(this.newIds, before, items);
            this.items = items;
            this.fetchedAt = now;
            this.status = "ready";
            this.streaming = false;
            resolve();
          },
        )
          .then((cleanup) => {
            stop = cleanup;
          })
          .catch(fail);
      });
    },

    setQuery(query: Partial<SalesQuery>): void {
      this.query = { ...this.query, ...query };
    },

    resetQuery(): void {
      this.query = { ...defaultSalesQuery(), sort: this.query.sort };
    },

    markSeen(id: string): void {
      if (!idSet(this.newIds).has(id)) return;
      this.newIds = Object.freeze(this.newIds.filter((newId) => newId !== id));
    },

    markAllSeen(): void {
      if (this.newIds.length > 0) this.newIds = NO_IDS;
    },
  },
});
