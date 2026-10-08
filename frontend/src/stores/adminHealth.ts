/**
 * stores/adminHealth.ts
 *
 * Admin-only view of scrape source health. Always read live: its purpose is
 * to show the current state, so nothing is persisted.
 */

import { defineStore } from "pinia";
import ApiUtils from "@/utils/apiUtils";
import SourceHealthMapper from "@/mapping/SourceHealthMapping";
import {
  classifyFailure,
  handleRequest,
  showRequestFailure,
  withoutErrorToasts,
} from "@/utils/requestFeedback";

const HEALTH_ENDPOINT = "/sales/health";
const RESOURCE_NAME = "admin.scrapers.title";
const ACTION_FAILED_KEY = "error.action_failed";

export type RecheckOutcome = "recovered" | "ok" | "still_failing" | "now_failing" | "degraded";

export interface RecheckResult {
  outcome: RecheckOutcome;
  checkedAt: number;
}

export const describeOutcome = (
  before: SourceStatus | undefined,
  after: SourceStatus,
): RecheckOutcome => {
  if (after === "failing") return before === "failing" ? "still_failing" : "now_failing";
  if (after === "degraded") return "degraded";
  return before === "failing" || before === "degraded" ? "recovered" : "ok";
};

export const useAdminHealthStore = defineStore("adminHealth", {
  state: () => ({
    sources: [] as SourceHealth[],
    loaded: false,
    /** Key of the source being re-checked, null when idle. */
    checking: null as string | null,
    /** Progress of a "check all" run, null when none runs. */
    batch: null as { done: number; total: number } | null,
    results: {} as Record<string, RecheckResult>,
  }),

  getters: {
    /** Sources that fail or return incomplete data. */
    needingAttention: (state): number =>
      state.sources.filter((s) => s.status === "failing" || s.status === "degraded").length,
    hasFailing: (state): boolean => state.sources.some((s) => s.status === "failing"),
    /** Sources that can be re-checked on demand. */
    checkable: (state): SourceHealth[] => state.sources.filter((s) => s.kind === "sales"),
    busy: (state): boolean => state.checking !== null || state.batch !== null,
  },

  actions: {
    async load(): Promise<void> {
      const request = () => ApiUtils.get<APISourceHealth[]>(HEALTH_ENDPOINT);
      const rows = this.loaded
        ? await withoutErrorToasts(request)
        : await handleRequest(request(), RESOURCE_NAME);
      this.sources = SourceHealthMapper.convertToSourceHealth(rows);
      this.loaded = true;
    },

    /**
     * Re-scrapes page 1 of one source right now and stores its new health. A
     * source that still fails is a result, not an error: when the server
     * answers with a failure after recording it, the recorded row is returned.
     */
    async recheck(key: string): Promise<SourceHealth> {
      this.checking = key;
      try {
        return await this.runRecheck(key);
      } catch (error) {
        showRequestFailure(error, RESOURCE_NAME, ACTION_FAILED_KEY);
        throw error;
      } finally {
        this.checking = null;
      }
    },

    /** Re-checks every sale source one after another; returns how many requests failed. */
    async recheckAll(): Promise<number> {
      const keys = this.checkable.map((source) => source.key);
      this.batch = { done: 0, total: keys.length };
      let failed = 0;
      let done = 0;
      try {
        for (const key of keys) {
          this.checking = key;
          try {
            await this.runRecheck(key);
          } catch (error) {
            failed += 1;
            if (failed === 1) showRequestFailure(error, RESOURCE_NAME, ACTION_FAILED_KEY);
          }
          done += 1;
          this.batch = { done, total: keys.length };
        }
      } finally {
        this.checking = null;
        this.batch = null;
      }
      return failed;
    },

    async runRecheck(key: string): Promise<SourceHealth> {
      const before = this.sources.find((source) => source.key === key)?.status;
      let health: SourceHealth;
      try {
        const row = await withoutErrorToasts(() =>
          ApiUtils.post<undefined, APISourceHealth>(
            `${HEALTH_ENDPOINT}/${encodeURIComponent(key)}/check`,
          ),
        );
        health = SourceHealthMapper.mapSourceHealth(row);
      } catch (error) {
        const recorded = await this.recordedFailure(key, error);
        if (!recorded) throw error;
        health = recorded;
      }
      this.store(health);
      this.results[key] = {
        outcome: describeOutcome(before, health.status),
        checkedAt: Date.now(),
      };
      return health;
    },

    /** After a server-side failure, the row the server recorded for it, if it did record one. */
    async recordedFailure(key: string, error: unknown): Promise<SourceHealth | null> {
      if (classifyFailure(error) !== "server") return null;
      try {
        const rows = await withoutErrorToasts(() =>
          ApiUtils.get<APISourceHealth[]>(HEALTH_ENDPOINT),
        );
        const row = rows.find((candidate) => candidate.source_key === key);
        return row && row.status === "failing" ? SourceHealthMapper.mapSourceHealth(row) : null;
      } catch {
        return null;
      }
    },

    store(health: SourceHealth): void {
      const index = this.sources.findIndex((source) => source.key === health.key);
      if (index === -1) this.sources.push(health);
      else this.sources[index] = health;
      this.sources = SourceHealthMapper.sortByAttention(this.sources);
    },
  },
});
