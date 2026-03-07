import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import MoreInfoMapper from "@/mapping/MoreInfoMapping";
import storageService from "@/services/general/StorageService";
import localizationService from "@/services/general/LocalizationService";

const BASE_ENDPOINT = "/more-info";
const CACHE_KEY = "more_info_data";
const RESOURCE_KEY = "moreinfo.title";

export enum MoreInfoEvents {
  MORE_INFO_UPDATED = "more-info-updated",
}

export default class MoreInfoService extends BaseService {
  static async getMoreInfo(
    plantName: string,
    options?: {
      forceUpdate?: boolean;
      onUpdate?: (info: any[]) => void;
    },
  ): Promise<any[]> {
    const forceUpdate = options?.forceUpdate ?? false;

    return await this.getFromDictionaryCache(
      CACHE_KEY,
      plantName,
      async () => {
        return await this.handleRequest(
          this.streamMoreInfo(plantName, options?.onUpdate),
          RESOURCE_KEY,
        );
      },
      forceUpdate,
    );
  }

  private static streamMoreInfo(
    plantName: string,
    onUpdate?: (info: any[]) => void,
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const accumulatedRaw = {
        links: [] as any[],
        ai: "",
      };

      let stopFn: (() => void) | null = null;

      (async () => {
        try {
          const lang = localizationService.getLocale();
          const params = new URLSearchParams({
            plantName,
            htmlFormatting: "false", // We handle formatting client-side
            lang,
          });

          stopFn = await ApiUtils.stream<any>(
            `${BASE_ENDPOINT}?${params.toString()}`,
            (event) => {
              try {
                /**
                 * V2 SseManager sends each event as a single object { type, value },
                 * NOT an array. V1's SSEManager._emit wrapped items in an array.
                 * We now handle the single-object shape directly.
                 */
                const payload = event.data;

                if (payload.type === "link") {
                  accumulatedRaw.links.push(payload.value);
                } else if (payload.type === "ai_chunk") {
                  accumulatedRaw.ai += payload.value;
                }

                // Re-render from the full accumulated buffer on each chunk
                const formattedAI = this.parseMarkdown(accumulatedRaw.ai);

                const mapped = MoreInfoMapper.convertToMoreInfo({
                  ...accumulatedRaw,
                  ai: formattedAI,
                });

                if (mapped.length > 0) {
                  onUpdate?.(mapped);
                }
              } catch (err) {
                stopFn?.();
                reject(err);
              }
            },
            (err) => {
              stopFn?.();
              reject(err);
            },
            async (doneData) => {
              stopFn?.();
              // V2 done event: { status: "completed" }
              // A status other than "completed" is treated as a soft error
              if (doneData?.status && doneData.status !== "completed") {
                console.warn("MoreInfo stream ended with status:", doneData.status);
              }
              const finalHTML = this.parseMarkdown(accumulatedRaw.ai);
              const finalData = MoreInfoMapper.convertToMoreInfo({
                ...accumulatedRaw,
                ai: finalHTML,
              });
              await this.updateDictionaryCache(plantName, finalData);
              resolve(finalData);
            },
          );
        } catch (err) {
          reject(err);
        }
      })();
    });
  }

  /**
   * Internal Markdown Parser (Zero Dependencies)
   * Designed to handle streaming fragments by looking at the full buffer.
   */
  private static parseMarkdown(markdown: string): string {
    if (!markdown) return "";

    let text = markdown
      .replace(/([a-z0-9])(###|##|#)/g, "$1\n\n$2")
      .replace(/(\n- )/g, "\n\n- ");

    const blocks = text.split(/\n\n+/);
    let html = "";

    blocks.forEach((block) => {
      const trimmed = block.trim();
      if (!trimmed) return;

      // HEADINGS
      if (trimmed.startsWith("#")) {
        const match = trimmed.match(/^(#+)\s*(.*)/);
        if (match) {
          const level = match[1].length;
          const content = this.parseInlines(match[2]);
          html += `<h${level} class="info-header">${content}</h${level}>`;
          return;
        }
      }

      // LISTS
      if (
        trimmed.startsWith("- ") ||
        trimmed.startsWith("* ") ||
        /^\d+\./.test(trimmed)
      ) {
        const items = trimmed.split(/\n/);
        html += '<ul class="info-list">';
        items.forEach((item) => {
          const content = item.replace(/^([-*]|\d+\.)\s*/, "");
          html += `<li class="info-item">${this.parseInlines(content)}</li>`;
        });
        html += "</ul>";
        return;
      }

      // PARAGRAPHS (Default)
      html += `<p class="info-text-paragraph">${this.parseInlines(trimmed)}</p>`;
    });

    return `<div>${html}</div>`;
  }

  private static parseInlines(text: string): string {
    return text
      .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/^([\w\s/]+):/gm, "<strong>$1:</strong>");
  }

  private static async updateDictionaryCache(
    plantName: string,
    data: any[],
  ): Promise<void> {
    const cached = await storageService.get<{
      records: Record<string, any[]>;
      timestamp: number;
    }>(CACHE_KEY);
    const records = cached?.records ? { ...cached.records } : {};
    records[plantName] = data;
    await storageService.set(CACHE_KEY, { records, timestamp: Date.now() });
    this.emit(MoreInfoEvents.MORE_INFO_UPDATED, records);
  }

  static async invalidateInfoCache(plantName?: string): Promise<void> {
    if (!plantName) {
      await storageService.remove(CACHE_KEY);
      return;
    }
    const cached = await storageService.get<{
      records: Record<string, any>;
      timestamp: number;
    }>(CACHE_KEY);
    if (!cached?.records) return;
    const updatedRecords = { ...cached.records };
    delete updatedRecords[plantName];
    await storageService.set(CACHE_KEY, {
      records: updatedRecords,
      timestamp: Date.now(),
    });
    this.emit(MoreInfoEvents.MORE_INFO_UPDATED, updatedRecords);
  }

  static async getMoreInfoByName(
    plantName: string,
    forceUpdate: boolean = false,
  ): Promise<any[]> {
    return this.getMoreInfo(plantName, { forceUpdate });
  }
}
