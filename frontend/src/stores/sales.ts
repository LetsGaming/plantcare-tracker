/**
 * stores/sales.ts
 *
 * The sales the server stored, replayed over SSE from its database, plus what
 * the user has seen of them. Sales, the seen record and the badge summary
 * survive logout (keepOnClear): they are not account data.
 *
 * A replay collects its sales outside the store and replaces `items` once,
 * when it completes, so a failed or aborted replay never leaves partial data
 * behind (or persists it as if it were complete). Only a store with nothing
 * to show publishes the running replay, at most every 250 ms, so the first
 * screen fills.
 *
 * NEW is a watermark plus a few ids: a sale is new when the server first saw
 * it after the watermark and the user has not opened it since.
 */

import { defineStore } from "pinia";
import { markRaw } from "vue";
import ApiUtils from "@/utils/apiUtils";
import SaleMapper from "@/mapping/SaleMapping";
import { handleRequest } from "@/utils/requestFeedback";
import { coalesced, epoch, resourceState } from "./resource";
import { applySalesQuery, defaultSalesQuery, type SalesQuery } from "@/utils/salesQuery";
import { compareText } from "@/utils/intlCache";
import localizationService from "@/services/general/LocalizationService";

const ENDPOINT = "/sales";
const RESOURCE_KEY = "sales.title";
const PROGRESSIVE_COMMIT_MS = 250;
const DAY_MS = 24 * 60 * 60 * 1000;
export const NEW_WINDOW_DAYS = 7;
/** ensureFresh asks the server for the summary at most this often; pull to refresh always does. */
export const SUMMARY_MIN_INTERVAL_MS = 30_000;

/** Storage keys of the badge: all the tab bar needs at boot. */
export const SALES_SUMMARY_KEY = "sales_summary";
export const SALES_SEEN_KEY = "sales_seen";
export const SALES_BOOT_KEYS = [SALES_SUMMARY_KEY, SALES_SEEN_KEY] as const;
const LIST_KEYS = ["sales_data", "sales_query"] as const;
const REPLAY_ACTIONS = ["replay", "runStream"] as const;

/** What the user has seen: sales first seen at or before `watermark`, and the listed ids opened since. */
export interface SalesSeen {
  readonly watermark: number;
  readonly ids: readonly string[];
}

/** The badge: counts as of the last server summary or completed replay. */
export interface SalesSummary {
  readonly total: number;
  readonly newCount: number;
  /** The server's `refreshed_at` last seen, null until it has refreshed any source. */
  readonly refreshedAt: number | null;
  /** The server's `refreshed_at` the stored list was replayed at. */
  readonly listRefreshedAt: number | null;
  readonly latestFirstSeenAt: number | null;
}

/** A sale as written to storage: the search key is derived again on restore. */
type StoredSale = Omit<Sale, "searchKey">;

const NO_IDS: readonly string[] = Object.freeze([]);

const freshSeen = (): SalesSeen =>
  Object.freeze({ watermark: Date.now() - NEW_WINDOW_DAYS * DAY_MS, ids: NO_IDS });

const emptySummary = (): SalesSummary =>
  Object.freeze({
    total: 0,
    newCount: 0,
    refreshedAt: null,
    listRefreshedAt: null,
    latestFirstSeenAt: null,
  });

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

const fingerprints = new WeakMap<readonly Sale[], string>();
/** Count and newest scrape: a replay of an unchanged list leaves both as they were. */
const fingerprintOf = (items: readonly Sale[]): string => {
  let fingerprint = fingerprints.get(items);
  if (fingerprint === undefined) {
    let newest = 0;
    for (const sale of items) if (sale.scrapedAt > newest) newest = sale.scrapedAt;
    fingerprint = `${items.length}:${newest}`;
    fingerprints.set(items, fingerprint);
  }
  return fingerprint;
};

/** Sales are replaced wholesale and never edited, so neither they nor the list get proxies. */
const saleList = (sales: Iterable<Sale>): Sale[] => markRaw(Array.from(sales));

const isStoredSale = (value: unknown): value is StoredSale => {
  const sale = value as Partial<Record<keyof StoredSale, unknown>> | null;
  return (
    !!sale &&
    typeof sale.id === "string" &&
    typeof sale.name === "string" &&
    typeof sale.nameFull === "string" &&
    typeof sale.seller === "string" &&
    typeof sale.price === "number" &&
    typeof sale.link === "string" &&
    typeof sale.firstSeenAt === "number" &&
    typeof sale.scrapedAt === "number"
  );
};

const restoreSale = (stored: StoredSale): Sale =>
  Object.freeze({
    ...stored,
    searchKey: SaleMapper.searchKeyOf(stored.nameFull, stored.seller),
  });

const storedSale = ({ searchKey: _searchKey, ...sale }: Sale): StoredSale => sale;

const isNumberOrNull = (value: unknown): value is number | null =>
  value === null || typeof value === "number";

const isNewIn = (sale: Sale, seen: SalesSeen, ids: Set<string>): boolean =>
  sale.firstSeenAt > seen.watermark && !ids.has(sale.id);

const countNew = (items: readonly Sale[], seen: SalesSeen): number => {
  const ids = idSet(seen.ids);
  let count = 0;
  for (const sale of items) if (isNewIn(sale, seen, ids)) count += 1;
  return count;
};

const latestFirstSeen = (items: readonly Sale[]): number | null => {
  let latest: number | null = null;
  for (const sale of items)
    if (latest === null || sale.firstSeenAt > latest) latest = sale.firstSeenAt;
  return latest;
};

/** Drops ids at or below the watermark or no longer listed; returns `prev` itself when nothing goes. */
const prunedSeen = (prev: SalesSeen, items: readonly Sale[]): SalesSeen => {
  if (prev.ids.length === 0) return prev;
  const index = indexOf(items);
  const kept = prev.ids.filter((id) => {
    const sale = index.get(id);
    return !!sale && sale.firstSeenAt > prev.watermark;
  });
  return kept.length === prev.ids.length
    ? prev
    : Object.freeze({ watermark: prev.watermark, ids: Object.freeze(kept) });
};

export const useSalesStore = defineStore("sales", {
  state: () => ({
    items: saleList([]),
    streaming: false,
    seen: freshSeen(),
    summary: emptySummary(),
    /** How the list is ordered and narrowed; a browser preference, not account data. */
    query: defaultSalesQuery(),
    /** Every persisted entry was read (or tried) since the store was created or reset. */
    restored: false,
    /** The badge entries were read once; reading them again would overwrite newer in-memory state. */
    bootRead: false,
    /** When the server summary was last read in this session; 0 before the first read. */
    summaryAt: 0,
    /**
     * Replaced by `$reset`: reads and streams begun before a logout check it
     * and leave the state alone once it changed.
     */
    session: markRaw({}) as object,
    /** Token of the stream allowed to commit; any other stream is stale. */
    activeRun: null as object | null,
    ...resourceState(),
  }),

  persist: {
    entries: [
      {
        key: SALES_SEEN_KEY,
        keepOnClear: true,
        allowExpired: true,
        dirtyOn: [...REPLAY_ACTIONS, "restore", "loadSummary", "markSeen", "markAllSeen"],
        version: (state) => state.seen,
        pick: (state) => state.seen,
        apply: (state, data: Partial<SalesSeen> | null) => {
          if (
            !data ||
            typeof data.watermark !== "number" ||
            !Array.isArray(data.ids) ||
            !data.ids.every((id) => typeof id === "string")
          ) {
            return;
          }
          state.seen = Object.freeze({
            watermark: data.watermark,
            ids: Object.freeze([...data.ids]),
          });
        },
      },
      {
        key: SALES_SUMMARY_KEY,
        keepOnClear: true,
        allowExpired: true,
        dirtyOn: [...REPLAY_ACTIONS, "restore", "loadSummary", "markSeen", "markAllSeen"],
        version: (state) => state.summary,
        pick: (state) => state.summary,
        apply: (state, data: Partial<SalesSummary> | null) => {
          if (
            !data ||
            typeof data.total !== "number" ||
            typeof data.newCount !== "number" ||
            !isNumberOrNull(data.refreshedAt ?? null)
          ) {
            return;
          }
          state.summary = Object.freeze({
            total: data.total,
            newCount: data.newCount,
            refreshedAt: data.refreshedAt ?? null,
            listRefreshedAt: isNumberOrNull(data.listRefreshedAt ?? null)
              ? (data.listRefreshedAt ?? null)
              : null,
            latestFirstSeenAt: isNumberOrNull(data.latestFirstSeenAt ?? null)
              ? (data.latestFirstSeenAt ?? null)
              : null,
          });
        },
      },
      {
        key: "sales_data",
        keepOnClear: true,
        allowExpired: true,
        dirtyOn: [...REPLAY_ACTIONS, "restore"],
        version: (state) => fingerprintOf(state.items),
        pick: (state) => state.items.map(storedSale),
        // A running replay's partial list is never stored: the entry stays dirty until it settles.
        timestamp: (state) => (state.streaming ? null : state.fetchedAt),
        // A list of an older release lacks fields the new model needs: it is ignored, not migrated.
        apply: (state, data: unknown[], timestamp) => {
          if (!Array.isArray(data) || !data.every(isStoredSale)) return;
          state.items = saleList(data.map(restoreSale));
          state.fetchedAt = timestamp;
          state.status = "ready";
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
    isNew: (state): ((id: string) => boolean) => {
      const index = indexOf(state.items);
      const ids = idSet(state.seen.ids);
      const seen = state.seen;
      return (id) => {
        const sale = index.get(id);
        return !!sale && isNewIn(sale, seen, ids);
      };
    },
    /** Sales after the user's filters, in the user's order. */
    filteredSales(): Sale[] {
      // Reading `isNew` only when the query asks keeps markSeen from rebuilding other orders.
      const asksNew = this.query.sort === "new" || this.query.onlyNew;
      return applySalesQuery(this.items, this.query, {
        locale: localizationService.getLocale(),
        isNew: asksNew ? this.isNew : () => false,
      });
    },
    sellers(): string[] {
      return [...new Set(this.items.map((sale) => sale.seller))].sort(
        compareText(localizationService.getLocale()),
      );
    },
    newCount: (state): number => state.summary.newCount,
    byId: (state): ((id: string) => Sale | undefined) => {
      const index = indexOf(state.items);
      return (id) => index.get(id);
    },
  },

  actions: {
    /** Reads the badge entries once per session; later calls and concurrent callers share that read. */
    async hydrateBoot(): Promise<void> {
      if (this.bootRead) return;
      const session = this.session;
      await coalesced(session, "boot", async () => {
        await this.$hydrate(SALES_BOOT_KEYS);
        if (this.session !== session) return;
        this.bootRead = true;
      });
    },

    /** Loads the stored sales into memory without touching the network; concurrent callers share one read. */
    restore(): Promise<void> {
      if (this.restored) return Promise.resolve();
      const session = this.session;
      return coalesced(session, "restore", async () => {
        await Promise.all([this.hydrateBoot(), this.$hydrate(LIST_KEYS)]);
        if (this.session !== session) return;
        this.restored = true;
      });
    },

    /** Reads the server's counts for the badge; null when the account ended meanwhile. */
    async loadSummary(): Promise<APISalesSummary | null> {
      const session = this.session;
      const isCurrent = epoch.guard();
      await this.hydrateBoot();
      if (!isCurrent() || this.session !== session) return null;
      const dto = await ApiUtils.get<APISalesSummary>(
        `${ENDPOINT}/summary?since=${this.seen.watermark}`,
      );
      if (!isCurrent() || this.session !== session) return null;
      this.summaryAt = Date.now();
      this.summary = Object.freeze({
        ...this.summary,
        total: dto.total,
        newCount: Math.max(0, dto.new_since - this.seen.ids.length),
        refreshedAt: dto.refreshed_at,
        latestFirstSeenAt: dto.latest_first_seen_at ?? this.summary.latestFirstSeenAt,
      });
      return dto;
    },

    /**
     * Replays the sales when none are stored or the server refreshed since the stored ones were
     * replayed. A failing summary keeps a stored list as it is.
     */
    async ensureFresh(): Promise<void> {
      const isCurrent = epoch.guard();
      await this.restore();
      if (!isCurrent()) return;
      if (this.items.length > 0 && Date.now() - this.summaryAt < SUMMARY_MIN_INTERVAL_MS) return;
      let summary: APISalesSummary | null = null;
      try {
        summary = await this.loadSummary();
      } catch (error) {
        if (!isCurrent()) return;
        if (this.items.length > 0) {
          console.error("Loading the sales summary failed:", error);
          return;
        }
      }
      if (!isCurrent()) return;
      const refreshedAt = summary?.refreshed_at ?? null;
      const listRefreshedAt = this.summary.listRefreshedAt;
      const newer =
        refreshedAt !== null && (listRefreshedAt === null || refreshedAt > listRefreshedAt);
      if (this.items.length === 0 || newer) await this.runReplay(false);
    },

    /** Replays the sales now; concurrent callers share one stream. */
    replay(): Promise<void> {
      return this.runReplay(true);
    },

    /** `loadFirst` reads the server summary so the replay is stamped with its `refreshed_at`. */
    runReplay(loadFirst: boolean): Promise<void> {
      const session = this.session;
      return coalesced(session, "stream", async (isCurrent) => {
        await this.restore();
        if (this.session !== session || !isCurrent()) return;
        if (loadFirst) {
          try {
            await this.loadSummary();
          } catch (error) {
            console.error("Loading the sales summary failed:", error);
          }
          if (this.session !== session || !isCurrent()) return;
        }
        await handleRequest(this.runStream(), RESOURCE_KEY);
      });
    },

    runStream(): Promise<void> {
      const before = this.items;
      const receivedIds = new Set<string>();
      const built: Sale[] = [];
      let latestFirst: number | null = null;
      const progressive = before.length === 0;
      const refreshedAt = this.summary.refreshedAt;
      const isCurrent = epoch.guard();
      let lastPublish = Number.NEGATIVE_INFINITY;
      let pending: ReturnType<typeof setTimeout> | undefined;
      const run = markRaw({});
      this.activeRun = run;
      this.streaming = true;

      const stopPublishing = () => {
        if (pending !== undefined) clearTimeout(pending);
        pending = undefined;
      };

      return new Promise<void>((resolve, reject) => {
        let stop: (() => void) | null = null;
        let settled = false;
        let stopListening: (() => void) | null = null;
        const cleanup = () => {
          stop?.();
          stopListening?.();
          stopPublishing();
        };
        /** Stops a stream that was superseded, reset or ended with its session. */
        const superseded = (): boolean => {
          if (this.activeRun === run && isCurrent()) return false;
          cleanup();
          if (this.activeRun === run) {
            this.activeRun = null;
            this.streaming = false;
            this.items = before;
          }
          if (!settled) {
            settled = true;
            resolve();
          }
          return true;
        };
        const finish = () => {
          settled = true;
          this.activeRun = null;
          this.streaming = false;
        };

        stopListening = epoch.onAbortAll(() => {
          superseded();
        });

        const publish = () => {
          pending = undefined;
          if (superseded()) return;
          lastPublish = Date.now();
          this.items = markRaw(built.slice());
        };
        const publishSoon = () => {
          if (!progressive || pending !== undefined) return;
          const wait = lastPublish + PROGRESSIVE_COMMIT_MS - Date.now();
          if (wait <= 0) publish();
          else pending = setTimeout(publish, wait);
        };

        const fail = (error: unknown) => {
          if (settled || superseded()) return;
          cleanup();
          this.items = before;
          finish();
          reject(error);
        };

        void ApiUtils.stream<unknown>(
          ENDPOINT,
          (event) => {
            if (settled || superseded()) return;
            try {
              let added = false;
              for (const sale of SaleMapper.convertToSales(event.data as APISale[])) {
                if (receivedIds.has(sale.id)) continue;
                receivedIds.add(sale.id);
                built.push(sale);
                if (latestFirst === null || sale.firstSeenAt > latestFirst)
                  latestFirst = sale.firstSeenAt;
                added = true;
              }
              if (added) publishSoon();
            } catch (error) {
              fail(error);
            }
          },
          fail,
          (done) => {
            if (settled || superseded()) return;
            cleanup();
            if (typeof done?.total === "number" && done.total !== built.length) {
              console.warn(`Sales replay received ${built.length} of ${done.total} sales`);
            }
            const items = markRaw(built);
            const now = Date.now();
            const seen = prunedSeen(this.seen, items);
            if (seen !== this.seen) this.seen = seen;
            this.summary = Object.freeze({
              total: items.length,
              newCount: countNew(items, seen),
              refreshedAt: this.summary.refreshedAt,
              listRefreshedAt: refreshedAt,
              latestFirstSeenAt: latestFirst ?? this.summary.latestFirstSeenAt,
            });
            this.items = items;
            this.fetchedAt = now;
            this.status = "ready";
            finish();
            resolve();
          },
        )
          .then((close) => {
            stop = close;
            if (settled) close();
            else superseded();
          })
          .catch(fail);
      });
    },

    /** The sale and its price history from the server, for the details page; null after logout. */
    async loadDetail(
      id: string,
    ): Promise<{ sale: Sale; history: readonly SalePricePoint[] } | null> {
      const session = this.session;
      const isCurrent = epoch.guard();
      const dto = await ApiUtils.get<APISaleDetail>(`${ENDPOINT}/${encodeURIComponent(id)}`);
      if (!isCurrent() || this.session !== session) return null;
      return SaleMapper.mapDetail(dto);
    },

    setQuery(query: Partial<SalesQuery>): void {
      this.query = { ...this.query, ...query };
    },

    resetQuery(): void {
      this.query = { ...defaultSalesQuery(), sort: this.query.sort };
    },

    /** One sale opened; `firstSeenAt` covers a sale the stored list does not have. */
    markSeen(id: string, firstSeenAt?: number): void {
      const first = this.byId(id)?.firstSeenAt ?? firstSeenAt;
      if (first === undefined || first <= this.seen.watermark) return;
      if (idSet(this.seen.ids).has(id)) return;
      this.seen = Object.freeze({
        watermark: this.seen.watermark,
        ids: Object.freeze([...this.seen.ids, id]),
      });
      if (this.summary.newCount > 0) {
        this.summary = Object.freeze({ ...this.summary, newCount: this.summary.newCount - 1 });
      }
    },

    markAllSeen(): void {
      const latest = Math.max(
        this.seen.watermark,
        this.summary.latestFirstSeenAt ?? 0,
        latestFirstSeen(this.items) ?? 0,
      );
      if (latest === this.seen.watermark && this.seen.ids.length === 0) return;
      this.seen = Object.freeze({ watermark: latest, ids: NO_IDS });
      this.summary = Object.freeze({ ...this.summary, newCount: 0 });
    },
  },
});
