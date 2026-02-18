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

export default class MoreInfoService extends BaseService {
  /**
   * Public accessor: Fetches more info for a specific plant using keyed caching.
   */
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
        const result = await this.handleRequest(
          this.streamMoreInfo(plantName, options?.onUpdate),
          RESOURCE_KEY,
        );
        return result;
      },
      forceUpdate,
    );
  }

  /**
   * Internal Stream method: Accumulates AI chunks and links.
   * Resolves with the final mapped array when the stream closes.
   */
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
            htmlFormatting: "false", // Request raw markdown to handle formatting here
            lang,
          });

          const endpoint = `${BASE_ENDPOINT}?${params.toString()}`;

          stopFn = await ApiUtils.stream<any>(
            endpoint,
            (event) => {
              try {
                const payload = event.data[0];

                if (payload.type === "link") {
                  accumulatedRaw.links.push(payload.value);
                } else if (payload.type === "ai_chunk") {
                  accumulatedRaw.ai += payload.value;
                }

                // Apply HTML formatting to the current state of accumulated text
                const formattedAI = this.formatToHTML(accumulatedRaw.ai);

                // Create a display-ready object for the mapper
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

              // Final format and save
              const finalHTML = this.formatToHTML(accumulatedRaw.ai);
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
   * Frontend-side HTML Formatter
   */
  private static formatToHTML(text: string): string {
    if (!text) return "";

    let formattedText = text.trim();

    // 1. Headings
    formattedText = formattedText.replace(/^###### (.*)$/gm, "<h6>$1</h6>");
    formattedText = formattedText.replace(/^##### (.*)$/gm, "<h5>$1</h5>");
    formattedText = formattedText.replace(/^#### (.*)$/gm, "<h4>$1</h4>");
    formattedText = formattedText.replace(/^### (.*)$/gm, "<h3>$1</h3>");
    formattedText = formattedText.replace(/^## (.*)$/gm, "<h2>$1</h2>");
    formattedText = formattedText.replace(/^# (.*)$/gm, "<h1>$1</h1>");

    // 2. Bold and Italics
    formattedText = formattedText.replace(
      /\*\*(.*?)\*\*/g,
      "<strong>$1</strong>",
    );
    formattedText = formattedText.replace(/\*(.*?)\*/g, "<em>$1</em>");

    // 3. Lists
    // Identify lines starting with - or * or 1. and wrap in <li>
    formattedText = formattedText.replace(/^[-\*]\s+(.*)$/gm, "<li>$1</li>");
    formattedText = formattedText.replace(/^\d+\.\s+(.*)$/gm, "<li>$1</li>");

    // 4. Line Breaks & Paragraphs
    // Split by lines to wrap non-tag lines in <p>
    const lines = formattedText.split("\n");
    const processedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      // If it's already a tag (h1-h6, li), leave it
      if (/^<(h[1-6]|li)/i.test(trimmed)) return trimmed;
      return `<p>${trimmed}</p>`;
    });

    formattedText = processedLines.join("");

    // 5. Basic List Wrapping (Wrap contiguous <li> tags in <ul>)
    formattedText = formattedText.replace(/(<li>.*?<\/li>)+/g, "<ul>$&</ul>");

    return `<div>${formattedText}</div>`;
  }

  /**
   * Helper to persist data to the dictionary-style cache.
   */
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

    await storageService.set(CACHE_KEY, {
      records,
      timestamp: Date.now(),
    });

    this.emit(MoreInfoEvents.MORE_INFO_UPDATED, records);
  }

  /**
   * Removes a specific plant's records from the local cache.
   */
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
