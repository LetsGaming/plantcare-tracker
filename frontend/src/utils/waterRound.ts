import { wateringStatus, type WateringTone } from "@/utils/wateringStats";

export interface RoundRow {
  plantId: number;
  name: string;
  imageUrl?: string;
  tone: WateringTone;
  rank: number;
  checked: boolean;
  /** undefined follows the round's fertilizer, null means none for this plant */
  fertilizerTypeId: number | null | undefined;
}

const TONE_BONUS: Record<WateringTone, number> = { overdue: 0.05, due: 0.03, ok: 0 };

export const buildRoundRows = (
  plants: Plant[],
  recordsFor: (id: number) => WateringRecord[],
  now = Date.now(),
): RoundRow[] =>
  plants
    .map((plant) => {
      const status = wateringStatus(recordsFor(plant.id) ?? [], now);
      return {
        plantId: plant.id,
        name: plant.name,
        imageUrl: plant.imageUrl,
        tone: status.tone,
        rank: status.rank,
        checked: status.tone !== "ok",
        fertilizerTypeId: undefined,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

export const buildBatchEntries = (
  rows: RoundRow[],
  roundFertilizer: number | null,
): WateringBatchEntry[] =>
  rows
    .filter((row) => row.checked)
    .map((row) => {
      const fertilizer =
        row.fertilizerTypeId === undefined ? roundFertilizer : row.fertilizerTypeId;
      return {
        plantId: row.plantId,
        usedFertilizer: fertilizer !== null,
        fertilizerTypeId: fertilizer,
      };
    });

export const rerankCandidates = (
  candidates: RecognitionCandidate[],
  toneOf: (plantId: number) => WateringTone | undefined,
  limit = 3,
): RecognitionCandidate[] =>
  candidates
    .map((c) => ({ c, adjusted: c.score + TONE_BONUS[toneOf(c.plantId) ?? "ok"] }))
    .sort((a, b) => b.adjusted - a.adjusted)
    .slice(0, limit)
    .map(({ c }) => c);
