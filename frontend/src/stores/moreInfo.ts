/**
 * stores/moreInfo.ts
 *
 * AI care guide and reference links for a plant, streamed from the backend
 * (SSE) per plant name and language. While a stream runs, the partial result
 * lives in `drafts` and is shown; `byKey` (the persisted part) is only
 * written when the stream completes. A stream that errors or ends with a status
 * other than completed rejects, keeps its partial draft for display and is
 * never cached. Failures are not toasted: the guide section presents them inline.
 */

import { defineStore } from "pinia";
import ApiUtils from "@/utils/apiUtils";
import MoreInfoMapper from "@/mapping/MoreInfoMapping";
import localizationService from "@/services/general/LocalizationService";
import { renderMarkdown } from "@/utils/markdown";
import { coalesced, isStale } from "./resource";

const BASE_ENDPOINT = "/more-info";

/** One guide per plant name and language. */
export const moreInfoKey = (plantName: string, lang: string): string => `${lang}:${plantName}`;

export const useMoreInfoStore = defineStore("moreInfo", {
  state: () => ({
    byKey: {} as Record<string, MoreInfo[]>,
    fetchedAtByKey: {} as Record<string, number>,
    drafts: {} as Record<string, MoreInfo[]>,
    streaming: {} as Record<string, boolean>,
  }),

  persist: {
    entries: [
      {
        key: "more_info_data",
        pick: (state) => state.byKey,
        timestamp: (state) => Math.max(0, ...Object.values(state.fetchedAtByKey)) || null,
        apply: (state, data: Record<string, MoreInfo[]>, timestamp) => {
          state.byKey = data;
          state.fetchedAtByKey = Object.fromEntries(
            Object.keys(data).map((key) => [key, timestamp]),
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
      if (!force && fresh) return Promise.resolve();

      return coalesced(this, key, async () => {
        if (!force && Object.keys(this.byKey).length === 0) {
          await this.$hydrate();
          if (this.byKey[key] && !isStale(this.fetchedAtByKey[key] ?? null)) return;
        }
        await this.runStream(plantName, key);
      });
    },

    runStream(plantName: string, key: string): Promise<void> {
      this.streaming[key] = true;
      delete this.drafts[key];

      return new Promise<void>((resolve, reject) => {
        const raw = { links: [] as string[], ai: "" };
        let stop: (() => void) | null = null;

        const render = (): MoreInfo[] =>
          MoreInfoMapper.convertToMoreInfo({ ...raw, ai: renderMarkdown(raw.ai) });

        const finish = () => {
          this.streaming[key] = false;
          delete this.drafts[key];
        };
        // A failed run keeps its partial draft visible (never cached or persisted);
        // the next run clears it.
        const fail = (error: unknown) => {
          stop?.();
          this.streaming[key] = false;
          reject(error);
        };

        const params = new URLSearchParams({
          plantName,
          htmlFormatting: "false", // formatting is done client-side
          lang: localizationService.getLocale(),
        });

        void ApiUtils.stream<{ type: string; value: string }>(
          `${BASE_ENDPOINT}?${params.toString()}`,
          (event) => {
            try {
              // Each SSE event is one { type, value } object.
              const { type, value } = event.data;
              if (type === "link") raw.links.push(value);
              else if (type === "ai_chunk") raw.ai += value;

              const mapped = render();
              if (mapped.length > 0) this.drafts[key] = mapped;
            } catch (error) {
              fail(error);
            }
          },
          fail,
          (done) => {
            if (done?.status && done.status !== "completed") {
              fail(new Error(`Information stream ended with status: ${done.status}`));
              return;
            }
            stop?.();
            this.byKey[key] = render();
            this.fetchedAtByKey[key] = Date.now();
            finish();
            resolve();
          },
        )
          .then((cleanup) => {
            stop = cleanup;
          })
          .catch(fail);
      });
    },
  },
});
