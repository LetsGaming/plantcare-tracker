/**
 * stores/sales.ts
 *
 * Plant sales streamed from the backend (SSE), with "new" flags and a short
 * price history per sale. Sales and history survive logout (keepOnClear):
 * they are not account data.
 *
 * A stream builds up `incoming` first and replaces `items` only when it
 * completes, so a failed or aborted stream never leaves partial data behind
 * (or persists it as if it were complete).
 */

import { defineStore } from "pinia";
import ApiUtils from "@/utils/apiUtils";
import SaleMapper from "@/mapping/SaleMapping";
import { handleRequest } from "@/utils/requestFeedback";
import { coalesced, isStale, resourceState } from "./resource";

const ENDPOINT = "/sales";
const RESOURCE_KEY = "sales.title";
const MAX_PRICE_POINTS = 30;

export interface PricePoint {
  price: number;
  timestamp: number;
}

export const useSalesStore = defineStore("sales", {
  state: () => ({
    items: [] as Sale[],
    /** Sales received by a running stream, not yet committed. */
    incoming: [] as Sale[],
    streaming: false,
    priceHistory: {} as Record<string, PricePoint[]>,
    ...resourceState(),
  }),

  persist: {
    entries: [
      {
        key: "sales_data",
        keepOnClear: true,
        allowExpired: true,
        pick: (state) => state.items,
        timestamp: (state) => state.fetchedAt,
        apply: (state, data: Sale[], timestamp) => {
          state.items = data;
          state.fetchedAt = timestamp;
          state.status = "ready";
        },
      },
      {
        key: "sales_price_history",
        keepOnClear: true,
        allowExpired: true,
        // Stored as a list of { id, points }, the shape older releases wrote.
        pick: (state) => Object.entries(state.priceHistory).map(([id, points]) => ({ id, points })),
        apply: (state, data: { id: string; points: PricePoint[] }[]) => {
          state.priceHistory = Object.fromEntries(data.map((entry) => [entry.id, entry.points]));
        },
      },
    ],
  },

  getters: {
    isStale: (state): boolean => isStale(state.fetchedAt),
    /** Committed sales plus those a running stream has delivered so far. */
    visibleSales: (state): Sale[] => {
      if (!state.streaming || state.incoming.length === 0) return state.items;
      const known = new Set(state.items.map((sale) => sale.id));
      return [...state.items, ...state.incoming.filter((sale) => !known.has(sale.id))];
    },
    newCount: (state): number => state.items.filter((sale) => sale.isNew).length,
    byId:
      (state) =>
      (id: string): Sale | undefined =>
        state.items.find((sale) => sale.id === id),
    historyOf:
      (state) =>
      (id: string): PricePoint[] =>
        state.priceHistory[id] ?? [],
  },

  actions: {
    /** Loads stored sales into memory without touching the network. */
    async restore(): Promise<void> {
      if (this.status === "idle") await this.$hydrate();
    },

    /** Streams the sales unless fresh ones are in memory; concurrent callers share one stream. */
    load({ force = false }: { force?: boolean } = {}): Promise<void> {
      if (!force && this.status === "ready" && !this.isStale) return Promise.resolve();
      return coalesced(this, "stream", async () => {
        if (!force && this.status === "idle" && (await this.$hydrate()) && !this.isStale) return;
        await handleRequest(this.runStream(), RESOURCE_KEY);
      });
    },

    runStream(): Promise<void> {
      const knownIds = new Set(this.items.map((sale) => sale.id));
      const received = new Map<string, Sale>();
      this.incoming = [];
      this.streaming = true;

      return new Promise<void>((resolve, reject) => {
        let stop: (() => void) | null = null;
        const fail = (error: unknown) => {
          stop?.();
          this.streaming = false;
          this.incoming = [];
          reject(error);
        };

        void ApiUtils.stream<unknown>(
          ENDPOINT,
          (event) => {
            try {
              const fresh: Sale[] = [];
              for (const sale of SaleMapper.convertToSales(event.data as APISale[])) {
                if (received.has(sale.id)) continue;
                const flagged = { ...sale, isNew: !knownIds.has(sale.id) };
                received.set(sale.id, flagged);
                fresh.push(flagged);
              }
              if (fresh.length > 0) {
                this.incoming.push(...fresh);
                fresh.forEach((sale) => this.addPricePoint(sale));
              }
            } catch (error) {
              fail(error);
            }
          },
          fail,
          () => {
            stop?.();
            this.items = Array.from(received.values());
            this.fetchedAt = Date.now();
            this.status = "ready";
            this.incoming = [];
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

    markSeen(id: string): void {
      const sale = this.items.find((item) => item.id === id);
      if (sale) sale.isNew = false;
    },

    markAllSeen(): void {
      this.items.forEach((sale) => (sale.isNew = false));
      this.incoming.forEach((sale) => (sale.isNew = false));
    },

    /** Records the sale's price when it differs from the last known one. */
    addPricePoint(sale: Sale): void {
      const points = this.priceHistory[sale.id] ?? [];
      if (points.at(-1)?.price === sale.price) return;
      this.priceHistory[sale.id] = [...points, { price: sale.price, timestamp: Date.now() }].slice(
        -MAX_PRICE_POINTS,
      );
    },
  },
});
