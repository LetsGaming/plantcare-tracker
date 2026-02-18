import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import MoreInfoMapper from "@/mapping/MoreInforMaping";
import storageService from "@/services/general/StorageService";
import localizationService from "@/services/general/LocalizationService";

const BASE_ENDPOINT = "/more-info";
const CACHE_KEY = "more_info_data";
const RESOURCE_KEY = "moreinfo.title";

export enum MoreInfoEvents {
  MORE_INFO_UPDATED = "more-info-updated",
}

/**
 * Authors: { name: "LetsGamingDE", id: 272402865874534400n}
 */
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
            htmlFormatting: "false", // We handle formatting here
            lang,
          });

          stopFn = await ApiUtils.stream<any>(
            `${BASE_ENDPOINT}?${params.toString()}`,
            (event) => {
              try {
                // event.data is an array because of backend SSEManager._emit
                const payloadArray = event.data;

                payloadArray.forEach((payload: any) => {
                  if (payload.type === "link") {
                    accumulatedRaw.links.push(payload.value);
                  } else if (payload.type === "ai_chunk") {
                    accumulatedRaw.ai += payload.value;
                  }
                });

                // Generate HTML from the current raw buffer
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
            async () => {
              stopFn?.();
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

    // 1. Pre-process: Handle the "mashing" by ensuring certain keywords start on new lines
    // and ensuring double newlines for paragraph separation.
    let text = markdown
      .replace(/([a-z0-9])(###|##|#)/g, "$1\n\n$2") // Force break before headers
      .replace(/(\n- )/g, "\n\n- "); // Ensure lists have air

    // 2. Block processing
    const blocks = text.split(/\n\n+/);
    let html = "";

    blocks.forEach((block) => {
      let trimmed = block.trim();
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
          const content = item.replace(/^([-\*]|\d+\.)\s*/, "");
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

  /**
   * Helper to handle Bold and Italics within a block
   */
  private static parseInlines(text: string): string {
    return (
      text
        .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        // Handle "Key: Value" mashing within paragraphs
        .replace(/^([\w\s\/]+):/gm, "<strong>$1:</strong>")
    );
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
