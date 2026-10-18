/**
 * stores/moreInfo.ts
 *
 * AI care guide and reference links for a plant, streamed from the backend
 * (SSE) per plant name and language. While a stream runs, the partial result
 * lives in `drafts` and is shown; `byKey` (the persisted part) is only
 * written when the stream completes. A stream that errors or ends with a status
 * other than completed rejects, keeps its partial draft for display and is
 * never cached. A stream stopped by the user resolves, keeps its partial draft
 * for display and is never cached either.
 * Failures are not toasted: the guide section presents them inline.
 */

import { toRaw } from "vue";
import { defineStore } from "pinia";
import MoreInfoMapper from "@/mapping/MoreInfoMapping";
import localizationService from "@/services/general/LocalizationService";
import { renderMarkdown } from "@/utils/markdown";
import { coalesced, isStale } from "./resource";
import { startStream } from "./streamRun";

const BASE_ENDPOINT = "/more-info";
const MAX_GUIDES = 30;
/** The AI can think silently for minutes before its first chunk arrives. */
const CARE_GUIDE_IDLE_TIMEOUT_MS = 180_000;
const DRAFT_RENDER_MS = 100;

/** Monotonic recency counter shared by all guide reads and writes. */
let useClock = 0;

/** Halts the running stream per key; kept outside the reactive state. */
const haltByKey = new Map<string, () => void>();

/** Keys whose load is running, and those stopped before their stream opened. */
const pendingKeys = new Set<string>();
const stopRequested = new Set<string>();

interface PersistedGuides {
  byKey: Record<string, MoreInfo[]>;
  fetchedAtByKey: Record<string, number>;
  usedAtByKey: Record<string, number>;
}

/** One guide per plant name and language. */
export const moreInfoKey = (plantName: string, lang: string): string => `${lang}:${plantName}`;

export const useMoreInfoStore = defineStore("moreInfo", {
  state: () => ({
    byKey: {} as Record<string, MoreInfo[]>,
    fetchedAtByKey: {} as Record<string, number>,
    /** Recency rank per stored guide (higher is newer); decides which guide is evicted. */
    usedAtByKey: {} as Record<string, number>,
    drafts: {} as Record<string, MoreInfo[]>,
    streaming: {} as Record<string, boolean>,
  }),

  persist: {
    entries: [
      {
        key: "more_info_data",
        pick: (state): PersistedGuides => ({
          byKey: state.byKey,
          fetchedAtByKey: state.fetchedAtByKey,
          usedAtByKey: state.usedAtByKey,
        }),
        timestamp: (state) => Math.max(0, ...Object.values(state.fetchedAtByKey)) || null,
        dirtyOn: ["runStream"],
        version: (state) => state.byKey,
        apply: (state, stored: PersistedGuides | Record<string, MoreInfo[]>, timestamp) => {
          const data: PersistedGuides =
            "byKey" in stored && typeof stored.byKey === "object"
              ? (stored as PersistedGuides)
              : {
                  byKey: stored as Record<string, MoreInfo[]>,
                  fetchedAtByKey: {},
                  usedAtByKey: {},
                };
          const usedAt = (key: string): number => data.usedAtByKey?.[key] ?? 0;
          const keys = Object.keys(data.byKey)
            .sort((a, b) => usedAt(a) - usedAt(b))
            .slice(-MAX_GUIDES);
          state.byKey = Object.fromEntries(keys.map((key) => [key, data.byKey[key]]));
          state.fetchedAtByKey = Object.fromEntries(
            keys.map((key) => [key, data.fetchedAtByKey?.[key] ?? timestamp]),
          );
          state.usedAtByKey = Object.fromEntries(
            keys.map((key, index) => [key, -keys.length + index]),
          );
        },
      },
    ],
  },

  getters: {
    /** The guide to show for a plant: the running draft, else the stored one. */
    infoFor:
      (state) =>
      (plantName: string): MoreInfo[] => {
        const key = moreInfoKey(plantName, localizationService.getLocale());
        return state.drafts[key] ?? state.byKey[key] ?? [];
      },
  },

  actions: {
    /**
     * Makes sure the guide for this plant is loaded: from memory, then
     * storage, otherwise by streaming. Concurrent callers share one stream.
     */
    ensureInfo(plantName: string, { force = false }: { force?: boolean } = {}): Promise<void> {
      const key = moreInfoKey(plantName, localizationService.getLocale());
      const fresh = this.byKey[key] && !isStale(this.fetchedAtByKey[key] ?? null);
      if (!force && fresh) {
        this.usedAtByKey[key] = ++useClock;
        return Promise.resolve();
      }

      return coalesced(this, key, async (isCurrent) => {
        pendingKeys.add(key);
        stopRequested.delete(key);
        try {
          if (!force && Object.keys(this.byKey).length === 0) {
            await this.$hydrate();
            if (!isCurrent()) return;
            if (this.byKey[key] && !isStale(this.fetchedAtByKey[key] ?? null)) return;
          }
          if (stopRequested.has(key)) return;
          await this.runStream(plantName, key);
        } finally {
          pendingKeys.delete(key);
          stopRequested.delete(key);
        }
      });
    },

    /**
     * Loads stored guides when none are in memory and reports whether a fresh
     * guide for this plant is available. Never opens a stream.
     */
    async loadCached(plantName: string): Promise<boolean> {
      const key = moreInfoKey(plantName, localizationService.getLocale());
      if (Object.keys(this.byKey).length === 0) await this.$hydrate();
      const fresh = !!this.byKey[key] && !isStale(this.fetchedAtByKey[key] ?? null);
      if (fresh) this.usedAtByKey[key] = ++useClock;
      return fresh;
    },

    /** Stops the running stream for this plant; every waiting caller resolves. */
    stopInfo(plantName: string): void {
      const key = moreInfoKey(plantName, localizationService.getLocale());
      const halt = haltByKey.get(key);
      if (halt) halt();
      else if (pendingKeys.has(key)) stopRequested.add(key);
    },

    /** Keeps the guide as the newest one and evicts the least recently used beyond `MAX_GUIDES`. */
    storeGuide(key: string, guide: MoreInfo[]): void {
      const { [key]: _replaced, ...others } = toRaw(this.byKey);
      const byKey = { ...others, [key]: guide };
      const fetchedAtByKey = { ...toRaw(this.fetchedAtByKey), [key]: Date.now() };
      const usedAtByKey = { ...toRaw(this.usedAtByKey), [key]: ++useClock };
      const stored = Object.keys(byKey);
      if (stored.length > MAX_GUIDES) {
        stored.sort((a, b) => (usedAtByKey[a] ?? 0) - (usedAtByKey[b] ?? 0));
        for (const evicted of stored.slice(0, stored.length - MAX_GUIDES)) {
          delete byKey[evicted];
          delete fetchedAtByKey[evicted];
          delete usedAtByKey[evicted];
        }
      }
      this.byKey = byKey;
      this.fetchedAtByKey = fetchedAtByKey;
      this.usedAtByKey = usedAtByKey;
    },

    /** Failed drafts stay visible, but only the newest `MAX_GUIDES` runs are remembered. */
    pruneRuns(keep: string): void {
      for (const record of [this.drafts, this.streaming] as Record<string, unknown>[]) {
        const keys = Object.keys(record);
        for (const old of keys.slice(0, Math.max(0, keys.length - MAX_GUIDES))) {
          if (old !== keep && !this.streaming[old]) delete record[old];
        }
      }
    },

    runStream(plantName: string, key: string): Promise<void> {
      this.streaming[key] = true;
      delete this.drafts[key];
      this.pruneRuns(key);

      const raw = { links: [] as string[], ai: "" };
      const render = (): MoreInfo[] =>
        MoreInfoMapper.convertToMoreInfo({ ...raw, ai: renderMarkdown(raw.ai) });

      // Rendering the whole text per chunk is quadratic, so chunks repaint the draft at most once per window.
      let lastDraft = Number.NEGATIVE_INFINITY;
      let draftTimer: ReturnType<typeof setTimeout> | undefined;
      const publishDraft = () => {
        draftTimer = undefined;
        lastDraft = Date.now();
        const mapped = render();
        if (mapped.length > 0) this.drafts[key] = mapped;
      };
      const publishDraftSoon = () => {
        if (draftTimer !== undefined) return;
        const wait = lastDraft + DRAFT_RENDER_MS - Date.now();
        if (wait <= 0) publishDraft();
        else draftTimer = setTimeout(publishDraft, wait);
      };

      const params = new URLSearchParams({
        plantName,
        htmlFormatting: "false", // formatting is done client-side
        lang: localizationService.getLocale(),
      });

      // A failed or stopped run keeps its partial draft visible (never cached or persisted);
      // the next run clears it.
      const streamRun = startStream<{ type: string; value: string }>({
        endpoint: `${BASE_ENDPOINT}?${params.toString()}`,
        idleTimeoutMs: CARE_GUIDE_IDLE_TIMEOUT_MS,
        requireDoneStatus: true,
        onMessage: ({ type, value }) => {
          // Each SSE event is one { type, value } object.
          if (type === "link") raw.links.push(value);
          else if (type === "ai_chunk") raw.ai += value;
          publishDraftSoon();
        },
        onDone: (done) => {
          if (done?.status !== "completed") {
            throw new Error(`Information stream ended with status: ${done?.status}`);
          }
          this.storeGuide(key, render());
          delete this.drafts[key];
        },
        onSettled: (outcome) => {
          clearTimeout(draftTimer);
          haltByKey.delete(key);
          if (outcome === "done") {
            this.streaming[key] = false;
            return;
          }
          publishDraft();
          this.streaming[key] = false;
        },
      });
      haltByKey.set(key, streamRun.stop);
      return streamRun.promise;
    },
  },
});
