/**
 * stores/adminHealth.ts
 *
 * Admin-only view of scrape source health. Always read live: its purpose is
 * to show the current state, so nothing is persisted.
 */

import { defineStore } from "pinia";
import ApiUtils from "@/utils/apiUtils";
import SourceHealthMapper from "@/mapping/SourceHealthMapping";
import { handleRequest } from "@/utils/requestFeedback";

const HEALTH_ENDPOINT = "/sales/health";
const RESOURCE_NAME = "admin.scrapers.title";

export const useAdminHealthStore = defineStore("adminHealth", {
  state: () => ({
    sources: [] as SourceHealth[],
    loaded: false,
  }),

  getters: {
    /** Sources that currently return no usable data. */
    needingAttention: (state): number => state.sources.filter((s) => s.status === "failing").length,
  },

  actions: {
    async load(): Promise<void> {
      const rows = await handleRequest(
        ApiUtils.get<APISourceHealth[]>(HEALTH_ENDPOINT),
        RESOURCE_NAME,
      );
      this.sources = SourceHealthMapper.convertToSourceHealth(rows);
      this.loaded = true;
    },

    /** Re-scrapes page 1 of one source right now and stores its new health. */
    async recheck(key: string): Promise<SourceHealth> {
      const row = await handleRequest(
        ApiUtils.post<undefined, APISourceHealth>(
          `${HEALTH_ENDPOINT}/${encodeURIComponent(key)}/check`,
        ),
        RESOURCE_NAME,
        "error.action_failed",
      );
      const health = SourceHealthMapper.mapSourceHealth(row);
      const index = this.sources.findIndex((source) => source.key === health.key);
      if (index === -1) this.sources.push(health);
      else this.sources[index] = health;
      return health;
    },
  },
});
