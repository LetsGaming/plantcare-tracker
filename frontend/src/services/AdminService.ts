import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import SourceHealthMapper from "@/mapping/SourceHealthMapping";

const HEALTH_ENDPOINT = "/sales/health";
const RESOURCE_NAME = "admin.scrapers.title";

export enum AdminEvents {
  SOURCE_HEALTH_UPDATED = "source-health-updated",
}

/**
 * Admin-only operations. Health data is always read live: its whole purpose
 * is to show the current state, so nothing here is cached.
 */
export default class AdminService extends BaseService {
  static async getSourceHealth(): Promise<SourceHealth[]> {
    const rows = await this.handleRequest(
      ApiUtils.get<APISourceHealth[]>(HEALTH_ENDPOINT),
      RESOURCE_NAME,
    );
    const sources = SourceHealthMapper.convertToSourceHealth(rows);
    this.emit(AdminEvents.SOURCE_HEALTH_UPDATED, sources);
    return sources;
  }

  /** Re-scrapes page 1 of one source right now and returns its new health. */
  static async recheckSource(key: string): Promise<SourceHealth> {
    const row = await this.handleRequest(
      ApiUtils.post<undefined, APISourceHealth>(
        `${HEALTH_ENDPOINT}/${encodeURIComponent(key)}/check`,
      ),
      RESOURCE_NAME,
      "error.action_failed",
    );
    return SourceHealthMapper.mapSourceHealth(row);
  }

  static countNeedingAttention(sources: SourceHealth[]): number {
    return sources.filter((s) => s.status === "failing").length;
  }
}
