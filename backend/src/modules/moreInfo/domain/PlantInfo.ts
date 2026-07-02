/**
 * modules/moreInfo/domain/PlantInfo.ts
 *
 * Domain model and ports for the plant-information stream.
 *
 * The module previously had no domain layer; the route talked to the
 * OpenAI client and the link searchers directly. The two ports below
 * are what the StreamPlantInfo use case orchestrates:
 *
 *  - PlantGuideStreamer: streams a care guide chunk by chunk
 *    (implemented by the OpenAI adapter).
 *  - PlantLinkSearcher:  resolves one external reference link for a
 *    plant name (implemented by the scraper/API adapters).
 *
 * No framework, SQL, or HTTP imports are allowed here.
 */

// ── Request / event shapes ────────────────────────────────────────────────────

export interface PlantInfoRequest {
  /** Cleaned plant name (parentheses and special characters stripped). */
  plantName: string;
  /** Whether AI chunks should be delivered as HTML instead of Markdown. */
  htmlFormatting: boolean;
  /** BCP-47-ish language tag the guide is written in. */
  language: string;
}

/** One payload event on the stream — either an AI text chunk or a link. */
export interface PlantInfoEvent {
  type: 'ai_chunk' | 'link';
  value: string;
}

// ── Ports ─────────────────────────────────────────────────────────────────────

export interface PlantGuideStreamer {
  streamPlantCare(
    plantName: string,
    htmlFormatting: boolean,
    onChunk: (chunk: string) => Promise<void>,
    language?: string,
  ): Promise<void>;
}

export type PlantLinkSearcher = (plantName: string) => Promise<string | null>;
